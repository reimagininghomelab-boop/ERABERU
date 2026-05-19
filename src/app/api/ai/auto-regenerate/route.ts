import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { generateSalesIntro, type SalesIntroInput, type SalesIntroReview } from '@/lib/ai/salesIntro'

const ADMIN_EMAILS = ['reimagining.home.lab@gmail.com', '1989yo55@gmail.com']
const MIN_INTERVAL_DAYS = 30
const MAX_INTERVAL_DAYS = 180
const REVIEW_COUNT_THRESHOLD = 3

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ triggered: false, reason: 'OPENAI_API_KEY未設定' }, { status: 500 })
  }

  let salespersonId: string
  try {
    const body = await request.json()
    salespersonId = typeof body.salespersonId === 'string' ? body.salespersonId.trim() : ''
  } catch {
    return NextResponse.json({ triggered: false, reason: 'リクエスト形式不正' }, { status: 400 })
  }
  if (!salespersonId) {
    return NextResponse.json({ triggered: false, reason: 'salespersonId必須' }, { status: 400 })
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
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ triggered: false, reason: '権限なし' }, { status: 403 })
  }

  // プロフィールと初回承認済み口コミ数を並行取得
  const [{ data: profile }, { count: firstApprovedCount }] = await Promise.all([
    supabase
      .from('salesperson_profiles')
      .select('ai_last_auto_generated_at, ai_review_count_at_generation')
      .eq('id', salespersonId)
      .maybeSingle(),
    supabase
      .from('contract_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('salesperson_id', salespersonId)
      .not('first_approved_at', 'is', null),
  ])

  if (!profile) {
    return NextResponse.json({ triggered: false, reason: '営業マンが見つかりません' }, { status: 404 })
  }

  const currentCount = firstApprovedCount ?? 0
  const lastCount = profile.ai_review_count_at_generation ?? 0
  const lastGenAt = profile.ai_last_auto_generated_at
    ? new Date(profile.ai_last_auto_generated_at)
    : null
  const now = new Date()

  // トリガー判定
  let shouldGenerate = false
  let triggerReason = ''

  if (!lastGenAt) {
    // 初回自動生成: 口コミ3件以上あれば即実行（時間制限なし）
    if (currentCount >= REVIEW_COUNT_THRESHOLD) {
      shouldGenerate = true
      triggerReason = `初回自動生成: 初回承認済み口コミ ${currentCount} 件`
    }
  } else {
    const daysSinceLast = (now.getTime() - lastGenAt.getTime()) / (1000 * 60 * 60 * 24)
    const countDiff = currentCount - lastCount

    // 条件A: 口コミ3件増加 かつ 1ヶ月以上経過
    if (countDiff >= REVIEW_COUNT_THRESHOLD && daysSinceLast >= MIN_INTERVAL_DAYS) {
      shouldGenerate = true
      triggerReason = `条件A: 口コミ +${countDiff} 件、${Math.floor(daysSinceLast)} 日経過`
    }
    // 条件B: 6ヶ月以上経過 かつ 口コミが1件以上増加
    else if (daysSinceLast >= MAX_INTERVAL_DAYS && countDiff >= 1) {
      shouldGenerate = true
      triggerReason = `条件B: ${Math.floor(daysSinceLast)} 日経過（強制更新）、口コミ +${countDiff} 件`
    }
  }

  if (!shouldGenerate) {
    return NextResponse.json({ triggered: false, reason: 'トリガー条件未達' })
  }

  // プロフィールデータと承認済み口コミを取得してAI生成
  const [{ data: profileDetail }, { data: reviewData }] = await Promise.all([
    supabase
      .from('salesperson_profiles')
      .select(`
        company_id, application_company_name, department, core_city,
        available_prefectures, qualifications, sales_styles, bio, is_verified
      `)
      .eq('id', salespersonId)
      .maybeSingle(),
    supabase
      .from('contract_reviews')
      .select('rating, content, meeting_status, contract_price')
      .eq('salesperson_id', salespersonId)
      .eq('is_approved', true),
  ])

  if (!profileDetail) {
    return NextResponse.json({ triggered: false, reason: 'プロフィール詳細取得失敗' }, { status: 500 })
  }

  // 会社名の解決
  let companyName: string | null = profileDetail.application_company_name as string | null
  if (profileDetail.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profileDetail.company_id)
      .maybeSingle()
    if (company) companyName = company.name as string
  }

  const reviews: SalesIntroReview[] = (reviewData ?? []).map((r) => ({
    rating: r.rating as number,
    content: r.content as string,
    meeting_status: r.meeting_status as string | null,
    contract_price: r.contract_price as number | null,
  }))

  const input: SalesIntroInput = {
    companyName,
    department: profileDetail.department as string | null,
    coreCity: profileDetail.core_city as string | null,
    availablePrefectures: Array.isArray(profileDetail.available_prefectures)
      ? (profileDetail.available_prefectures as string[])
      : [],
    qualifications: Array.isArray(profileDetail.qualifications)
      ? (profileDetail.qualifications as string[])
      : [],
    salesStyles: (profileDetail.sales_styles as Record<string, number>) ?? {},
    bio: (profileDetail.bio as string | null) ?? null,
    isVerified: Boolean(profileDetail.is_verified),
    reviews,
  }

  try {
    const result = await generateSalesIntro(input)
    await supabase
      .from('salesperson_profiles')
      .update({
        ai_summary: result,
        ai_last_auto_generated_at: now.toISOString(),
        ai_review_count_at_generation: currentCount,
      })
      .eq('id', salespersonId)

    return NextResponse.json({ triggered: true, reason: triggerReason })
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー'
    return NextResponse.json({ triggered: false, reason: `AI生成失敗: ${message}` }, { status: 500 })
  }
}
