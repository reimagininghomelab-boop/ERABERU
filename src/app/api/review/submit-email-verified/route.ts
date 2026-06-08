import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    const { token, rating, content, access_token, phase } = await req.json()

    if (!token || !rating || !content?.trim() || !access_token) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: '評価は1〜5で指定してください' }, { status: 400 })
    }
    const resolvedPhase = VALID_PHASES.includes(phase) ? phase : 'pre_contract'

    // access_token を Supabase で検証してメールアドレスを取得
    const { data: { user }, error: authError } = await supabase.auth.getUser(access_token)
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'メール認証が確認できませんでした。もう一度最初からお試しください。' }, { status: 401 })
    }

    // サーバー側でのみ pepper 付きハッシュを生成
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
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[review/submit-email-verified]', e)
    return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
  }
}
