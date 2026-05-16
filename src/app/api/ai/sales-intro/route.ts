import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { generateSalesIntro, type SalesIntroInput, type SalesIntroReview } from '@/lib/ai/salesIntro'

const ADMIN_EMAILS = ['reimagining.home.lab@gmail.com', '1989yo55@gmail.com']

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  const salespersonId = typeof body.salespersonId === 'string' ? body.salespersonId.trim() : ''
  if (!salespersonId) {
    return NextResponse.json({ error: 'salespersonId は必須です' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  // 管理者のみ実行可能
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  // プロフィールと承認済み口コミを並行取得
  const [{ data: profile, error: profileError }, { data: reviewData }] = await Promise.all([
    supabase
      .from('salesperson_profiles')
      .select(`
        id,
        company_id,
        application_company_name,
        department,
        core_city,
        available_prefectures,
        qualifications,
        sales_styles,
        bio,
        is_verified
      `)
      .eq('id', salespersonId)
      .maybeSingle(),
    supabase
      .from('contract_reviews')
      .select('rating, content, meeting_status, contract_price')
      .eq('salesperson_id', salespersonId)
      .eq('is_approved', true),
  ])

  if (profileError) {
    return NextResponse.json({ error: 'プロフィール取得に失敗しました: ' + profileError.message }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json({ error: '該当する営業マンが見つかりません' }, { status: 404 })
  }

  // 会社名の解決
  let companyName: string | null = profile.application_company_name as string | null
  if (profile.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .maybeSingle()
    if (company) companyName = company.name as string
  }

  const reviews: SalesIntroReview[] = (reviewData ?? []).map((r) => ({
    rating: r.rating as number,
    content: r.content as string,
    meeting_status: r.meeting_status as string | null,
    contract_price: r.contract_price as number | null,
  }))

  const qualifications = Array.isArray(profile.qualifications)
    ? (profile.qualifications as string[])
    : []
  const bio = (profile.bio as string | null) ?? null
  const salesStyles = (profile.sales_styles as Record<string, number>) ?? {}

  // 紹介文を生成するのに十分なデータがあるか確認
  const hasEnoughData =
    reviews.length > 0 ||
    qualifications.length > 0 ||
    (bio && bio.trim().length > 0) ||
    Object.keys(salesStyles).length > 0

  if (!hasEnoughData) {
    return NextResponse.json(
      { error: 'データが不足しているため紹介文を生成できません。口コミ・資格・自己紹介・会話スタイルのいずれかを入力してください。' },
      { status: 422 }
    )
  }

  const input: SalesIntroInput = {
    companyName,
    department: profile.department as string | null,
    coreCity: profile.core_city as string | null,
    availablePrefectures: Array.isArray(profile.available_prefectures)
      ? (profile.available_prefectures as string[])
      : [],
    qualifications,
    salesStyles,
    bio,
    isVerified: Boolean(profile.is_verified),
    reviews,
  }

  try {
    const result = await generateSalesIntro(input)

    await supabase
      .from('salesperson_profiles')
      .update({ ai_summary: result })
      .eq('id', salespersonId)

    return NextResponse.json({ result })
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー'
    return NextResponse.json({ error: 'AI生成に失敗しました: ' + message }, { status: 500 })
  }
}
