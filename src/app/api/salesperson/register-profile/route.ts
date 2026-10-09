import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const OTHER_COMPANY_ID = '__other__'

// salesperson_profiles への書き込み専用（サーバー内でのみ使用。キーをレスポンスに含めない）
function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[register-profile] SUPABASE_SERVICE_ROLE_KEY is not set in environment')
    return null
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  })
}

const ALLOWED_SPECIALTIES = [
  '資金計画の相談', '住宅ローンの相談', '土地探しからの家づくり', '土地の注意点整理',
  '間取り要望の整理', '家事動線・生活動線の相談', '収納計画の相談', '子育て世帯の住まい相談',
  '共働き世帯の住まい相談', '平屋の相談', '二世帯住宅の相談', '断熱・省エネ住宅の説明',
  '耐震性能の説明', '外観・内装デザインの相談', '設備・仕様選びの相談', '見積内容の説明',
  '契約前の不安整理', '他社比較中の判断整理', '打合せ内容の整理', '引渡し後のフォロー',
]

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
    specialties: rawSpecialties,
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

  const specialtiesList = Array.isArray(rawSpecialties)
    ? rawSpecialties.filter((v): v is string => typeof v === 'string')
    : []
  if (specialtiesList.length > 5) {
    return NextResponse.json({ error: '得意分野は最大5つまで選択できます' }, { status: 400 })
  }
  const invalidSpecialty = specialtiesList.find((v) => !ALLOWED_SPECIALTIES.includes(v))
  if (invalidSpecialty) {
    return NextResponse.json({ error: '無効な得意分野が含まれています' }, { status: 400 })
  }

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

  // 書き込みは service_role で行う。status / is_verified / user_id はリクエスト本文から受け取らず、
  // サーバー側の判定値とログイン中の user.id だけを使う。
  // TODO: authenticated から salesperson_profiles の INSERT と status/is_verified の UPDATE 権限を剥奪すること
  const admin = getServiceClient()
  if (!admin) {
    return NextResponse.json({ error: 'サーバー設定エラーが発生しました' }, { status: 500 })
  }

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
    specialties: specialtiesList,
    is_verified: isAutoApproved,
  }

  const { data: existing, error: existingError } = await admin
    .from('salesperson_profiles')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (existingError) {
    console.error('[register-profile] existing profile lookup error', { code: existingError.code, message: existingError.message })
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }

  let registrationResult: string
  if (existing?.id) {
    // 既存プロフィールの再送信では status を変更しない（運営が pending にした営業が自分で active に戻せないようにする）
    const { error } = await admin
      .from('salesperson_profiles')
      .update(profileData)
      .eq('id', existing.id)
      .eq('user_id', user.id)
    if (error) {
      console.error('[register-profile] update error', { code: error.code, message: error.message })
      return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
    }
    registrationResult = existing.status as string
  } else {
    // 新規登録: 会社ドメイン一致のみ即時公開、それ以外（不一致・ドメイン未登録・その他の会社）は運営確認待ち
    const status = isAutoApproved ? 'active' : 'pending'
    const { error } = await admin
      .from('salesperson_profiles')
      .insert({ user_id: user.id, ...profileData, status })
    if (error) {
      console.error('[register-profile] insert error', { code: error.code, message: error.message })
      return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
    }
    registrationResult = status
  }

  return NextResponse.json({ registrationResult, isVerified: isAutoApproved })
}
