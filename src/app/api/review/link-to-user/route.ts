import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!accessToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // アクセストークンをAuthorizationヘッダーとして使うクライアント
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    // トークン検証
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: '認証トークンが無効です' }, { status: 401 })
    }

    const ip = getClientIp(req)

    const { data: linked, error } = await supabase.rpc('link_anonymous_reviews_by_ip', {
      p_ip: ip,
    })

    if (error) throw error

    return NextResponse.json({ success: true, linked: linked ?? 0 })
  } catch (e) {
    console.error('[review/link-to-user]', e)
    return NextResponse.json({ error: '紐づけに失敗しました' }, { status: 500 })
  }
}
