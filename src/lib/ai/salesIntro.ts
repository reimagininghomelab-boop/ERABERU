import OpenAI from 'openai'

export type SalesIntroInput = {
  displayName: string
  companyName: string | null
  department: string | null
  coreCity: string | null
  availablePrefectures: string[]
  qualifications: string[]
  salesStyles: Record<string, number>
  bio: string | null
  isVerified: boolean
  // 将来口コミデータを追加する際はここに reviews フィールドを追加
}

export type SalesIntroOutput = {
  summary: string
  goodMatch: string[]
  communicationStyle: string
  strengths: string[]
  caution: string
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

  const profileText = [
    `氏名: ${input.displayName}`,
    input.companyName ? `会社名: ${input.companyName}` : null,
    input.department ? `所属部署: ${input.department}` : null,
    input.coreCity ? `コアエリア: ${input.coreCity}` : null,
    input.availablePrefectures.length > 0
      ? `対応可能エリア: ${input.availablePrefectures.join('、')}`
      : null,
    input.qualifications.length > 0
      ? `保有資格: ${input.qualifications.join('、')}`
      : null,
    stylesDescription
      ? `会話スタイル（本人申告）:\n${stylesDescription}`
      : '会話スタイル: 未回答',
    input.bio ? `自己紹介:\n${input.bio}` : null,
    input.isVerified ? '本人確認済み' : null,
  ].filter(Boolean).join('\n')

  const systemPrompt = `あなたは住宅購入を検討している施主が「この営業マンと相性が合うか」を判断しやすくするための紹介文を作成する専門家です。

## 絶対に守るルール
- データにない実績・能力・受賞歴・顧客満足度・数字を作らない
- 「おすすめです」「最高です」などの断定的な褒め言葉を使わない
- 「相性が良さそうです」「確認するとよいでしょう」など判断補助の表現にする
- 営業を過度に褒めず、施主が自分で判断できる情報を提供する

## 情報が少ない場合の対処
- bio や会話スタイルが空・未回答の場合は、他の情報（エリア・資格・会社名など）から自然に紹介文を組み立てる
- 会話スタイルが「未回答」の場合、communicationStyle は「プロフィール情報からは確認しきれません。面談で直接確認することをおすすめします」とする
- 情報がない項目について推測や創作はしない

## 文章の方針
- 合いそうな施主像だけでなく、相性が分かれそうな点も必ず出す
- 施主が次に確認すべき観点（例：建築実績の詳細、打ち合わせ頻度など）を含める
- 「プロフィール情報をもとにした紹介です」という前提が伝わる表現にする
- 一般の施主が読んで自然な日本語にする

## 出力形式
必ず以下のJSON形式のみを返す。前後に説明文・コードブロックを付けない。

{
  "summary": "施主向けの営業紹介文（2〜4文）",
  "goodMatch": ["相性が良さそうな施主タイプ1", "タイプ2", "タイプ3"],
  "communicationStyle": "会話・提案スタイルの説明（1〜2文）",
  "strengths": ["強み1", "強み2", "強み3"],
  "caution": "相性が分かれそうな点・施主が次に確認すべき観点（1〜2文）"
}`

  const response = await client.chat.completions.create({
    // gpt-5-mini が正式リリースされ次第ここを更新する
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下の営業マン情報をもとに紹介文を生成してください。\n\n${profileText}` },
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
