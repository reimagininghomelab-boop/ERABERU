import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { generateSalesIntro, type SalesIntroInput, type SalesIntroReview } from '@/lib/ai/salesIntro'

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI生成が設定されていません' }, { status: 500 })
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { data: profile } = await supabase
    .from('salesperson_profiles')
    .select('id, company_id, application_company_name, department, core_city, available_prefectures, qualifications, sales_styles, bio, is_verified')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'プロフィールが見つかりません' }, { status: 404 })

  const { data: reviewData } = await supabase
    .from('contract_reviews')
    .select('rating, content, meeting_status, contract_price')
    .eq('salesperson_id', profile.id)
    .eq('is_approved', true)

  let companyName: string | null = profile.application_company_name as string | null
  if (profile.company_id) {
    const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).maybeSingle()
    if (company) companyName = company.name as string
  }

  const qualifications = Array.isArray(profile.qualifications) ? (profile.qualifications as string[]) : []
  const bio = (profile.bio as string | null) ?? null
  const salesStyles = (profile.sales_styles as Record<string, number>) ?? {}
  const reviews: SalesIntroReview[] = (reviewData ?? []).map((r) => ({
    rating: r.rating as number,
    content: r.content as string,
    meeting_status: r.meeting_status as string | null,
    contract_price: r.contract_price as number | null,
  }))

  const hasEnoughData =
    reviews.length > 0 ||
    qualifications.length > 0 ||
    (bio && bio.trim().length > 0) ||
    Object.keys(salesStyles).length > 0

  if (!hasEnoughData) {
    return NextResponse.json({ error: 'データ不足' }, { status: 422 })
  }

  const input: SalesIntroInput = {
    companyName,
    department: profile.department as string | null,
    coreCity: profile.core_city as string | null,
    availablePrefectures: Array.isArray(profile.available_prefectures) ? (profile.available_prefectures as string[]) : [],
    qualifications,
    salesStyles,
    bio,
    isVerified: Boolean(profile.is_verified),
    reviews,
  }

  try {
    const result = await generateSalesIntro(input)
    await supabase.from('salesperson_profiles').update({ ai_summary: result }).eq('id', profile.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
