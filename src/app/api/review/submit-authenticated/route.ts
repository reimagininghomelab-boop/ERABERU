import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TERMS_VERSION = 'terms_2026-06-11'
const PRIVACY_VERSION = 'privacy_2026-06-11'
const CONSENT_TEXT_VERSION = 'review_consent_2026-06-11'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[submit-authenticated] SUPABASE_SERVICE_ROLE_KEY is not set in environment')
    return null
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  })
}

// inet 型として PostgreSQL に渡せる形式かチェックし、不正なら null を返す
function sanitizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-fA-F:]+$/
  if (ipv4.test(trimmed) || ipv6.test(trimmed)) return trimmed
  console.warn('[submit-authenticated] sanitizeIp: invalid IP discarded:', JSON.stringify(trimmed))
  return null
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!accessToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { salesperson_id, phase, rating, content, consentAccepted } = await req.json()

    if (!salesperson_id || !phase || !rating || !content?.trim()) {
      return NextResponse.json({ error: '入力内容が不正です' }, { status: 400 })
    }
    if (!consentAccepted) {
      return NextResponse.json({ error: '投稿前の確認事項に同意してください。' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: '認証トークンが無効です' }, { status: 401 })
    }

    const { data, error } = await supabase.rpc('submit_authenticated_review', {
      p_salesperson_id: salesperson_id,
      p_phase: phase,
      p_rating: rating,
      p_content: content.trim(),
    })

    if (error) {
      const msg = error.message
      if (msg.includes('invalid_phase')) return NextResponse.json({ error: 'フェーズが不正です' }, { status: 400 })
      if (msg.includes('invalid_rating')) return NextResponse.json({ error: '評価値が不正です' }, { status: 400 })
      if (msg.includes('salesperson_not_found')) return NextResponse.json({ error: '営業マンが見つかりません' }, { status: 404 })
      if (msg.includes('duplicate_review')) return NextResponse.json({ error: 'このフェーズの口コミはすでに投稿済みです' }, { status: 409 })
      throw error
    }

    // RPC が review UUID を返す場合に取得（返さない場合は null）
    const reviewId: string | null = (typeof data === 'string' && data) ? data : null

    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]
      ?? req.headers.get('x-real-ip')
      ?? null
    const ipAddress = sanitizeIp(rawIp)
    const userAgent = req.headers.get('user-agent') ?? null

    const serviceClient = getServiceClient()
    if (!serviceClient) {
      return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
    }

    const { error: consentError } = await serviceClient.from('review_consents').insert({
      review_id: reviewId,
      user_id: user.id,
      email_hash: null,  // ログインユーザーは email_hash なし
      terms_version: TERMS_VERSION,
      privacy_policy_version: PRIVACY_VERSION,
      consent_text_version: CONSENT_TEXT_VERSION,
      ip_address: ipAddress,
      user_agent: userAgent,
    })

    if (consentError) {
      console.error('[submit-authenticated] review_consents insert failed:', {
        message: consentError.message,
        details: consentError.details,
        hint: consentError.hint,
        code: consentError.code,
        reviewId,
        userId: user.id,
        ipAddress,
        hasUserAgent: !!userAgent,
      })
      return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: reviewId })
  } catch (e) {
    console.error('[review/submit-authenticated] unexpected error:', e)
    return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
  }
}
