import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 })
  }

  let body: { query?: string; agents?: any[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  if (!body.query || !body.agents?.length) {
    return NextResponse.json({ error: 'query と agents は必須です' }, { status: 400 })
  }

  const agentLines = body.agents.slice(0, 30).map((a: any) => {
    const parts: string[] = []
    if (a.company_name) parts.push(`会社:${a.company_name}`)
    if (a.area_prefecture) parts.push(`エリア:${a.area_prefecture}`)
    if (a.specialty_styles?.length) parts.push(`得意:${a.specialty_styles.join('・')}`)
    if (a.ai_summary?.communicationStyle) parts.push(`スタイル:${a.ai_summary.communicationStyle}`)
    if (a.ai_summary?.goodMatch?.length) parts.push(`合う方:${a.ai_summary.goodMatch.slice(0, 2).join('・')}`)
    if (a.bio) parts.push(`bio:${String(a.bio).substring(0, 80)}`)
    return `[${a.id}] ${parts.join(' / ')}`
  }).join('\n')

  const prompt = `ユーザーの希望・状況:
${body.query}

以下の営業マン候補から、ユーザーの希望に合う順番にランク付けしてください（最大5人）。
合わない場合は少なくて構いません。

営業マン一覧:
${agentLines}

以下のJSON形式のみで返答してください（日本語で）:
{
  "results": [
    {
      "agent_id": "...",
      "score": 90,
      "match_reason": "ユーザーの希望に合う具体的な理由を1〜2文で"
    }
  ]
}`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'あなたは住宅購入者と住宅営業マンのマッチング専門家です。必ずJSON形式のみで回答してください。' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    })

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー'
    return NextResponse.json({ error: 'AI処理に失敗しました: ' + message }, { status: 500 })
  }
}
