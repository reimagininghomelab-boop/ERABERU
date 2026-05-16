import OpenAI from 'openai'

export type SalesIntroReview = {
  rating: number
  content: string
  meeting_status: string | null
  contract_price: number | null
}

export type SalesIntroInput = {
  companyName: string | null
  department: string | null
  coreCity: string | null
  availablePrefectures: string[]
  qualifications: string[]
  salesStyles: Record<string, number>
  bio: string | null
  isVerified: boolean
  reviews: SalesIntroReview[]
}

export type SalesIntroOutput = {
  summary: string
  goodMatch: string[]
  communicationStyle: string
  strengths: string[]
  caution?: string
}

const STYLE_AXIS_LABELS: Record<string, { left: string; right: string }> = {
  listening_proposing: { left: '傾聴型', right: '提案型' },
  numbers_feeling: { left: '数字で説明', right: '感覚で説明' },
}

function describeSalesStyles(styles: Record<string, number>): string | null {
  const entries = Object.entries(styles).filter(([key]) => key in STYLE_AXIS_LABELS)
  if (entries.length === 0) return null

  const lines = entries.map(([key, val]) => {
    const axis = STYLE_AXIS_LABELS[key]!
    const pct = ((val - 1) / 4) * 100
    const tendency =
      pct <= 25 ? `強く${axis.left}寄り` :
      pct <= 45 ? `やや${axis.left}寄り` :
      pct >= 75 ? `強く${axis.right}寄り` :
      pct >= 55 ? `やや${axis.right}寄り` :
      'どちらでもない（中立）'
    return `${axis.left}↔${axis.right}: ${tendency}（スコア ${val}/5）`
  })
  return lines.join('\n')
}

export async function generateSalesIntro(input: SalesIntroInput): Promise<SalesIntroOutput> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY が設定されていません')
  }

  const client = new OpenAI({ apiKey })

  const stylesDescription = describeSalesStyles(input.salesStyles)

  // 口コミセクション（メイン情報）
  const reviewsText = input.reviews.length > 0
    ? input.reviews.map((r, i) => {
        const parts = [`口コミ${i + 1}（評価${r.rating}/5）`]
        if (r.meeting_status) parts.push(`打ち合わせ状況: ${r.meeting_status}`)
        if (r.contract_price) parts.push(`成約価格: ${Math.round(r.contract_price / 10000)}万円`)
        parts.push(`コメント: ${r.content}`)
        return parts.join(' / ')
      }).join('\n')
    : '（口コミなし）'

  const profileText = [
    // 名前・個人特定情報は含めない（①）
    input.companyName ? `会社: ${input.companyName}` : null,
    input.department ? `部署: ${input.department}` : null,
    input.coreCity ? `活動エリア: ${input.coreCity}` : null,
    input.availablePrefectures.length > 0
      ? `対応エリア: ${input.availablePrefectures.join('、')}`
      : null,
    input.qualifications.length > 0
      ? `資格（裏付け情報）: ${input.qualifications.join('、')}`
      : null,
    stylesDescription
      ? `スタイル評価（参考）:\n${stylesDescription}`
      : null,
    input.bio
      ? `本人コメント（参考程度）:\n${input.bio}`
      : null,
    `\n【施主からの口コミ（メイン）】\n${reviewsText}`,
  ].filter(Boolean).join('\n')

  const systemPrompt = `あなたは住宅購入を検討している施主に向けて、住宅営業マンを紹介するアドバイザーです。
親しい友人から「この営業さん、あなたに合いそうだよ」と教えてもらうような、温かく前向きなトーンで書いてください。

## 絶対に守るルール
- 営業マンの氏名・連絡先・具体的な勤務場所・住所は一切含めない（開示後に分かることのため）
- 提供された情報に存在しない内容・実績・性格・受賞歴・数字を一切作らない
- 「丁寧」「誠実」「信頼」などの人格評価は、口コミや自己紹介に明示されている場合のみ使う
- 口コミがある場合はそれをメイン情報とし、資格や会社情報で裏付ける
- 本人の自己紹介・スタイル評価は参考程度にとどめる
- 口コミがない場合は、資格・エリア・スタイルから自然に紹介文を組み立てる
- 情報が少なく紹介文の根拠が作れない場合は、一般的な美辞麗句を並べず、判明している情報のみを素直に書く

## 口コミの分析方法（重要）
口コミには「会社・商品・価格への評価」と「この営業マン個人への評価」が混在している。
紹介文に使うのは「この営業マン個人への評価」のみ。
具体的には以下を営業個人への評価として扱う：
- 対応の丁寧さ・スピード・誠実さ
- 提案力・ヒアリング力・説明のわかりやすさ
- 打ち合わせ中のコミュニケーション
会社の製品・価格・アフターサービス全般への評価は紹介文に含めない。

## 口コミが矛盾する場合の処理
- 多数派の評価を優先して紹介文に反映する
- ただし反対意見が拮抗している（例：3件中2件 vs 1件 程度）場合は、断定を避け「〜な傾向がある」「〜と感じる方が多いようです」など表現を弱める
- 完全に半々で割れている場合はその項目には言及しない

## 文章の方針
- 前向きで温かい口調。友人からのアドバイスのような自然な日本語
- 「こんな施主に合いそう」を前面に出す
- 注意点・気をつける点は書かない
- summary は日本語で100文字程度（短くまとめる）
- goodMatch は具体的な施主像を3つ（「〇〇な方」の形で）

## 出力形式
必ず以下のJSON形式のみを返す。前後に説明文・コードブロックを付けない。

{
  "summary": "施主向けの紹介文（100文字程度）",
  "goodMatch": ["〇〇な方", "〇〇な方", "〇〇な方"],
  "communicationStyle": "会話スタイルの説明（1〜2文）",
  "strengths": ["強み1", "強み2", "強み3"]
}`

  const response = await client.chat.completions.create({
    // gpt-5-mini が正式リリースされ次第ここを更新する
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下の情報をもとに紹介文を生成してください。\n\n${profileText}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const raw = response.choices[0]?.message?.content ?? ''

  let parsed: SalesIntroOutput
  try {
    parsed = JSON.parse(raw) as SalesIntroOutput
  } catch {
    const preview = raw.slice(0, 300)
    throw new Error(`AIの返却値がJSONとして解析できませんでした。先頭300文字: ${preview}`)
  }

  return parsed
}
