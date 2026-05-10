import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const OTHER_COMPANY_ID = '__other__'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  const {
    family_name,
    given_name,
    company_id: rawCompanyId,
    application_company_name,
    department,
    core_city,
    available_prefectures,
    qualifications,
    sales_styles,
    bio,
  } = body

  const familyName = typeof family_name === 'string' ? family_name.trim() : ''
  const givenName = typeof given_name === 'string' ? given_name.trim() : ''
  if (!familyName || !givenName) {
    return NextResponse.json({ error: '姓と名は必須です' }, { status: 400 })
  }

  const applicationCompanyName =
    typeof application_company_name === 'string' ? application_company_name.trim() : ''

  const prefectureList = Array.isArray(available_prefectures)
    ? available_prefectures.filter((v): v is string => typeof v === 'string')
    : []

  const qualificationList = Array.isArray(qualifications)
    ? qualifications.filter((v): v is string => typeof v === 'string')
    : []

  const salesStyles: Record<string, number> =
    sales_styles !== null &&
    typeof sales_styles === 'object' &&
    !Array.isArray(sales_styles)
      ? (sales_styles as Record<string, number>)
      : {}

  const isOtherCompany = rawCompanyId === OTHER_COMPANY_ID
  const companyId = isOtherCompany
    ? null
    : typeof rawCompanyId === 'string'
      ? rawCompanyId
      : null

  if (!isOtherCompany && !companyId) {
    return NextResponse.json({ error: '会社を選択してください' }, { status: 400 })
  }
  if (isOtherCompany && !applicationCompanyName) {
    return NextResponse.json({ error: '会社名を入力してください' }, { status: 400 })
  }

  let companyName = ''
  let isAutoApproved = false

  if (!isOtherCompany && companyId) {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, domains')
      .eq('id', companyId)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: '会社情報の取得に失敗しました' }, { status: 500 })
    }
    if (!company) {
      return NextResponse.json({ error: '指定された会社が見つかりません' }, { status: 400 })
    }

    companyName = company.name as string
    const emailDomain = user.email?.split('@')[1]?.toLowerCase() ?? ''
    isAutoApproved =
      Array.isArray(company.domains) &&
      (company.domains as string[]).includes(emailDomain)
  } else {
    companyName = applicationCompanyName
  }

  // TODO: service role key への移行時に、本人の直接 UPDATE で status/is_verified を
  // 変更できないよう RLS を絞ること（現状は anon key + RLS の範囲内で動作）
  const profileData = {
    real_name: `${familyName} ${givenName}`,
    family_name: familyName,
    given_name: givenName,
    company_name: companyName,
    company_id: companyId,
    application_company_name: isOtherCompany ? applicationCompanyName : null,
    application_email: user.email ?? null,
    department: (typeof department === 'string' ? department.trim() : null) || null,
    core_city: (typeof core_city === 'string' ? core_city.trim() : null) || null,
    available_prefectures: prefectureList,
    qualifications: qualificationList,
    sales_styles: salesStyles,
    bio: (typeof bio === 'string' ? bio.trim() : null) || null,
    status: isAutoApproved ? 'active' : 'pending',
    is_verified: isAutoApproved,
  }

  const { data: existing } = await supabase
    .from('salesperson_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('salesperson_profiles')
      .update(profileData)
      .eq('id', existing.id)
    if (error) {
      return NextResponse.json({ error: '更新に失敗しました: ' + error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('salesperson_profiles')
      .insert({ user_id: user.id, ...profileData })
    if (error) {
      return NextResponse.json({ error: '登録に失敗しました: ' + error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ registrationResult: isAutoApproved ? 'active' : 'pending' })
}
