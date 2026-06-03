import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `あなたはERABERUの住宅営業マンマッチングアシスタントです。
ユーザーが求める住宅営業マンの条件を、短い自然な会話で引き出してください。

ルール：
- 返答は1〜2文で短く、一度に1つだけ質問する
- フレンドリーで親しみやすいトーン（敬語は使う）
- 以下の情報を自然に引き出す：希望エリア、営業スタイルの好み（傾聴型/提案型など）、家づくりの状況、避けたいこと
- 2〜3回のやり取りで条件が把握できたら ready: true にする
- ready: true のとき、summaryに条件を日本語で簡潔にまとめる

必ずJSON形式のみで返答すること：
{"message": "返答テキスト", "ready": false}
または
{"message": "条件が把握できました！候補を探してみます。", "ready": true, "summary": "条件の要約"}`

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 })
  }

  let body: { messages?: { role: string; content: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages は必須です' }, { status: 400 })
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...body.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 300,
    })

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー'
    return NextResponse.json({ error: 'AI処理に失敗しました: ' + message }, { status: 500 })
  }
}
