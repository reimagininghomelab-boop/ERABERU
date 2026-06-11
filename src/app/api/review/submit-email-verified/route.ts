import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TERMS_VERSION = 'terms_2026-06-11'
const PRIVACY_VERSION = 'privacy_2026-06-11'
const CONSENT_TEXT_VERSION = 'review_consent_2026-06-11'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// service_role キーはサーバーサイドのみ使用（クライアントに露出させない）
function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  })
}

async function generatePepperedHash(email: string, pepper: string): Promise<string> {
  const normalized = email.toLowerCase().trim()
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized + pepper)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  try {
    const pepper = process.env.EMAIL_HASH_PEPPER
    if (!pepper) {
      console.error('[submit-email-verified] EMAIL_HASH_PEPPER is not set')
      return NextResponse.json({ error: '投稿処理に失敗しました' }, { status: 500 })
    }

    const VALID_PHASES = ['pre_contract', 'post_contract', 'after_start', 'after_handover']

    const body = await req.json()
    const { token, rating, content, access_token, phase, consentAccepted } = body

    if (!token || !rating || !content?.trim() || !access_token) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: '評価は1〜5で指定してください' }, { status: 400 })
    }
    // サーバー側でも同意チェックを検証
    if (!consentAccepted) {
      return NextResponse.json({ error: '投稿前の確認事項に同意してください。' }, { status: 400 })
    }

    const resolvedPhase = VALID_PHASES.includes(phase) ? phase : 'pre_contract'

    const { data: { user }, error: authError } = await supabase.auth.getUser(access_token)
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'メール認証が確認できませんでした。もう一度最初からお試しください。' }, { status: 401 })
    }

    const emailHash = await generatePepperedHash(user.email, pepper)

    const { data, error } = await supabase.rpc('submit_email_verified_review', {
      p_token: token,
      p_rating: rating,
      p_content: content.trim(),
      p_email_hash: emailHash,
      p_phase: resolvedPhase,
      p_user_id: user.id,
    })

    if (error) throw error

    if (data?.error === 'invalid_token') {
      return NextResponse.json({ error: 'このQRコードは無効または期限切れです' }, { status: 404 })
    }

    // 同意ログを service_role 経由で保存（RLS をバイパス）
    const reviewId: string | null = data?.review_id ?? null
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? null
    const userAgent = req.headers.get('user-agent') ?? null

    try {
      const serviceClient = getServiceClient()
      const { error: consentError } = await serviceClient.from('review_consents').insert({
        review_id: reviewId,
        user_id: user.id,
        email_hash: emailHash,
        terms_version: TERMS_VERSION,
        privacy_policy_version: PRIVACY_VERSION,
        consent_text_version: CONSENT_TEXT_VERSION,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      if (consentError) {
        console.error('[submit-email-verified] consent log save failed:', consentError)
        // 同意ログ保存失敗は口コミ投稿全体を失敗扱いにする
        return NextResponse.json({ error: '同意ログの保存に失敗しました。もう一度お試しください。' }, { status: 500 })
      }
    } catch (e) {
      console.error('[submit-email-verified] consent log error:', e)
      return NextResponse.json({ error: '同意ログの保存に失敗しました。' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[review/submit-email-verified]', e)
    return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
  }
}
