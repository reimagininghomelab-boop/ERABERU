import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  const salesperson_id = typeof body.salesperson_id === 'string' ? body.salesperson_id.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const contact_name = typeof body.contact_name === 'string' ? body.contact_name.trim() : ''
  const contact_email = typeof body.contact_email === 'string' ? body.contact_email.trim() : ''

  if (!salesperson_id || !message || !contact_name || !contact_email) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  // 営業マンの存在確認
  const { data: sp } = await supabase
    .from('salesperson_profiles')
    .select('id')
    .eq('id', salesperson_id)
    .eq('status', 'active')
    .maybeSingle()
  if (!sp) return NextResponse.json({ error: '営業マンが見つかりません' }, { status: 404 })

  const area = typeof body.area === 'string' ? body.area.trim() || null : null
  const timing = typeof body.timing === 'string' ? body.timing.trim() || null : null

  const { error } = await supabase.from('offers').insert({
    buyer_id: user.id,
    salesperson_id,
    area,
    timing,
    message,
    contact_name,
    contact_email,
  })

  if (error) {
    console.error('[offers/create]', error)
    return NextResponse.json({ error: '送信に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
