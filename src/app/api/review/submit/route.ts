import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  try {
    const { token, rating, content } = await req.json()

    if (!token || !rating || !content?.trim()) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: '評価は1〜5で指定してください' }, { status: 400 })
    }

    const ip = getClientIp(req)

    const { data, error } = await supabase.rpc('submit_anonymous_review', {
      p_token: token,
      p_rating: rating,
      p_content: content.trim(),
      p_ip: ip,
    })

    if (error) throw error

    if (data?.error === 'invalid_token') {
      return NextResponse.json({ error: 'このQRコードは無効または期限切れです' }, { status: 404 })
    }
    if (data?.error === 'duplicate_ip') {
      return NextResponse.json(
        { error: 'このデバイスからは既に口コミを投稿済みです' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[review/submit]', e)
    return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
  }
}
