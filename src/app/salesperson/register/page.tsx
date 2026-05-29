'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

const QUALIFICATION_OPTIONS = [
  '宅地建物取引士', 'ファイナンシャルプランナー（FP）', '住宅ローンアドバイザー',
  '不動産コンサルティングマスター', 'マンション管理士', '建築士（一級・二級）',
  'インテリアコーディネーター', 'リフォームスタイリスト',
]

const SPECIALTY_OPTIONS = [
  '資金計画の相談', '住宅ローンの相談', '土地探しからの家づくり', '土地の注意点整理',
  '間取り要望の整理', '家事動線・生活動線の相談', '収納計画の相談', '子育て世帯の住まい相談',
  '共働き世帯の住まい相談', '平屋の相談', '二世帯住宅の相談', '断熱・省エネ住宅の説明',
  '耐震性能の説明', '外観・内装デザインの相談', '設備・仕様選びの相談', '見積内容の説明',
  '契約前の不安整理', '他社比較中の判断整理', '打合せ内容の整理', '引渡し後のフォロー',
]

const MAX_SPECIALTIES = 5

const SALES_STYLE_AXES = [
  { key: 'listening_proposing', left: '傾聴型', right: '提案型' },
  { key: 'numbers_feeling', left: '数字で説明', right: '感覚で説明' },
]

const OTHER_COMPANY_ID = '__other__'

type Company = { id: string; name: string; domains: string[] }

type UserMetadata = {
  selected_company_id?: string
  application_company_name?: string
}

export default function SalespersonRegisterPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [step, setStep] = useState<1 | 2 | 'email_sent'>(1)
  const [initializing, setInitializing] = useState(true)
  const [registrationResult, setRegistrationResult] = useState<'active' | 'pending' | null>(null)

  // Step 1
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [companyNameInput, setCompanyNameInput] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step1Loading, setStep1Loading] = useState(false)
  const [step1Error, setStep1Error] = useState('')

  // Step 2
  const [familyName, setFamilyName] = useState('')
  const [givenName, setGivenName] = useState('')
  const [department, setDepartment] = useState('')
  const [coreCity, setCoreCity] = useState('')
  const [availablePrefectures, setAvailablePrefectures] = useState<string[]>([])
  const [qualifications, setQualifications] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [specialtiesError, setSpecialtiesError] = useState('')
  const [salesStyles, setSalesStyles] = useState<Record<string, number>>({
    listening_proposing: 3,
    numbers_feeling: 3,
  })
  const [bio, setBio] = useState('')
  const [step2Loading, setStep2Loading] = useState(false)
  const [step2Error, setStep2Error] = useState('')
  const [done, setDone] = useState(false)

  const checkSession = useCallback(async (userId: string, userMetadata?: UserMetadata) => {
    const supabase = createClient()

    const { data: profile } = await supabase
      .from('salesperson_profiles')
      .select('id, status, company_id, application_company_name, family_name, given_name, department, core_city, available_prefectures, qualifications, specialties, sales_styles, bio')
      .eq('user_id', userId)
      .maybeSingle()

    if (profile?.status === 'active') {
      router.replace('/salesperson/dashboard')
      return
    }

    // pending中は既存データをフォームに復元（プロフィール再編集可）
    let restoredCompanyFromDb = false
    if (profile) {
      if (profile.family_name) setFamilyName(profile.family_name as string)
      if (profile.given_name) setGivenName(profile.given_name as string)
      if (profile.department) setDepartment(profile.department as string)
      if (profile.core_city) setCoreCity(profile.core_city as string)
      if (profile.available_prefectures) setAvailablePrefectures(profile.available_prefectures as string[])
      if (profile.qualifications) setQualifications(profile.qualifications as string[])
      if (profile.specialties) setSpecialties(profile.specialties as string[])
      if (profile.sales_styles) setSalesStyles(profile.sales_styles as Record<string, number>)
      if (profile.bio) setBio(profile.bio as string)

      // 会社情報の復元: DB最優先
      if (profile.company_id) {
        setSelectedCompanyId(profile.company_id as string)
        restoredCompanyFromDb = true
      } else if (profile.application_company_name) {
        setSelectedCompanyId(OTHER_COMPANY_ID)
        setCompanyNameInput(profile.application_company_name as string)
        restoredCompanyFromDb = true
      }
    }

    // DBに会社情報がない場合は user_metadata → localStorage の順でフォールバック
    // TODO: メールリンクを別端末で開くと localStorage からは復元できない。
    // 将来的には pending レコードの company_id / application_company_name から一本化する。
    if (!restoredCompanyFromDb) {
      const companyId =
        userMetadata?.selected_company_id ??
        localStorage.getItem('pending_company_id') ??
        ''
      const companyName =
        userMetadata?.application_company_name ??
        localStorage.getItem('pending_company_name') ??
        ''
      if (companyId) setSelectedCompanyId(companyId)
      if (companyName) setCompanyNameInput(companyName)
    }

    localStorage.removeItem('pending_company_id')
    localStorage.removeItem('pending_company_name')

    setStep(2)
    setInitializing(false)
  }, [router])

  useEffect(() => {
    const supabase = createClient()

    supabase.from('companies').select('id, name, domains').order('name').then(({ data }) => {
      if (data) setCompanies(data as Company[])
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const metadata = session.user.user_metadata as UserMetadata | undefined
        checkSession(session.user.id, metadata)
      } else {
        setInitializing(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [checkSession])

  // selectedCompany は導出値として計算（useState不要）
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null
  const isOtherCompany = selectedCompanyId === OTHER_COMPANY_ID

  const togglePrefecture = (pref: string) => {
    setAvailablePrefectures(
      availablePrefectures.includes(pref)
        ? availablePrefectures.filter((x) => x !== pref)
        : [...availablePrefectures, pref]
    )
  }

  const toggleQualification = (item: string) => {
    setQualifications(
      qualifications.includes(item)
        ? qualifications.filter((x) => x !== item)
        : [...qualifications, item]
    )
  }

  const toggleSpecialty = (item: string) => {
    setSpecialtiesError('')
    if (specialties.includes(item)) {
      setSpecialties(specialties.filter((x) => x !== item))
    } else if (specialties.length >= MAX_SPECIALTIES) {
      setSpecialtiesError(`得意分野は最大${MAX_SPECIALTIES}つまで選択できます。`)
    } else {
      setSpecialties([...specialties, item])
    }
  }

  const handleAccountSubmit = async () => {
    setStep1Error('')
    if (!selectedCompanyId) { setStep1Error('会社を選択してください'); return }
    if (isOtherCompany && !companyNameInput.trim()) { setStep1Error('会社名を入力してください'); return }
    if (!email || !password) { setStep1Error('メールアドレスとパスワードを入力してください'); return }
    if (password.length < 6) { setStep1Error('パスワードは6文字以上で入力してください'); return }

    setStep1Loading(true)
    const supabase = createClient()

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/salesperson/register`,
        data: {
          selected_company_id: selectedCompanyId,
          application_company_name: isOtherCompany ? companyNameInput.trim() : '',
        },
      },
    })

    if (signUpError) {
      setStep1Error(
        signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')
          ? 'このメールアドレスはすでに登録されています'
          : signUpError.message
      )
      setStep1Loading(false)
      return
    }

    // 同端末・同ブラウザ用のフォールバック
    localStorage.setItem('pending_company_id', selectedCompanyId)
    if (isOtherCompany) localStorage.setItem('pending_company_name', companyNameInput.trim())

    setStep1Loading(false)
    setStep('email_sent')
  }

  const handleProfileSubmit = async () => {
    setStep2Error('')
    if (!familyName || !givenName) { setStep2Error('姓と名を入力してください'); return }
    if (!selectedCompanyId) { setStep2Error('会社情報が取得できませんでした。ページを再読み込みしてください。'); return }

    setStep2Loading(true)

    try {
      const res = await fetch('/api/salesperson/register-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_name: familyName,
          given_name: givenName,
          company_id: selectedCompanyId,
          application_company_name: isOtherCompany ? companyNameInput : null,
          department: department || null,
          core_city: coreCity || null,
          available_prefectures: availablePrefectures,
          qualifications,
          specialties,
          sales_styles: salesStyles,
          bio: bio || null,
        }),
      })

      const data = await res.json() as { registrationResult?: 'active' | 'pending'; error?: string }

      if (!res.ok) {
        setStep2Error(data.error ?? '登録に失敗しました')
        setStep2Loading(false)
        return
      }

      setRegistrationResult(data.registrationResult ?? 'pending')
      setDone(true)
    } catch {
      setStep2Error('通信に失敗しました。時間をおいて再度お試しください。')
    }

    setStep2Loading(false)
  }

  if (initializing) return <div className="min-h-screen bg-stone-100" />

  if (done) {
    return (
      <main className="min-h-screen bg-stone-100">
        <Header />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <div className="bg-white rounded-2xl shadow-sm p-10">
            {registrationResult === 'active' ? (
              <>
                <div className="text-4xl mb-4">✅</div>
                <h2 className="text-xl font-bold text-stone-800 mb-3">登録が完了しました</h2>
                <p className="text-stone-500 text-sm leading-relaxed mb-6">
                  会社メールアドレスの確認が取れたため、営業プロフィールを公開しました。<br />
                  ダッシュボードから掲載状況や口コミを確認できます。
                </p>
                <Link href="/salesperson/dashboard" className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition text-sm">
                  ダッシュボードへ
                </Link>
              </>
            ) : (
              <>
                <div className="text-4xl mb-4">📋</div>
                <h2 className="text-xl font-bold text-stone-800 mb-3">申請を受け付けました</h2>
                <p className="text-stone-500 text-sm leading-relaxed mb-6">
                  所属会社またはメールアドレスの確認が取れるまで、プロフィールは非公開となります。<br />
                  確認が完了次第、公開のご連絡をいたします。
                </p>
                <Link href="/" className="inline-block bg-stone-400 hover:bg-stone-500 text-white font-bold px-6 py-3 rounded-xl transition text-sm">
                  トップページへ
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-100">
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-800">営業マンとして登録する</h1>
          <p className="text-stone-500 text-sm mt-1">メールアドレスで登録してください。</p>
          {step !== 'email_sent' && (
            <div className="flex items-center gap-2 mt-4">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${step === 1 ? 'bg-orange-500 text-white' : 'bg-green-100 text-green-600'}`}>
                1. アカウント作成
              </span>
              <span className="text-stone-300 text-xs">→</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${step === 2 ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-400'}`}>
                2. プロフィール入力
              </span>
            </div>
          )}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-stone-700 mb-4">アカウント情報</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">所属会社 <span className="text-red-400">*</span></label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                >
                  <option value="">会社を選択してください</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value={OTHER_COMPANY_ID}>その他・未登録会社</option>
                </select>
              </div>

              {isOtherCompany && (
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">会社名 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={companyNameInput}
                    onChange={(e) => setCompanyNameInput(e.target.value)}
                    placeholder="例: ○○工務店、△△ホーム"
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  <p className="text-xs text-stone-400 mt-1">一覧にない会社・工務店も申請できます。確認後に公開されます。</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">メールアドレス <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@company.co.jp"
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <p className="text-xs text-stone-400 mt-1">会社メールアドレス以外（Gmail等）でも登録できます。確認が取れるまで非公開となります。</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">パスワード <span className="text-red-400">*</span></label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6文字以上"
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            </div>
            {step1Error && <p className="text-sm text-red-500 mt-3">{step1Error}</p>}
            <button
              onClick={handleAccountSubmit}
              disabled={step1Loading}
              className="w-full mt-5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-4 rounded-2xl transition-colors text-sm"
            >
              {step1Loading ? '処理中...' : '確認メールを送る'}
            </button>
            <p className="text-center text-xs text-stone-400 mt-4">
              すでにアカウントをお持ちの方は<Link href="/auth/login" className="text-orange-500 underline ml-1">こちら</Link>
            </p>
          </div>
        )}

        {/* メール確認待ち */}
        {step === 'email_sent' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="text-4xl mb-4">📧</div>
            <h2 className="text-lg font-bold text-stone-800 mb-2">確認メールを送りました</h2>
            <p className="text-stone-500 text-sm leading-relaxed">
              <span className="font-medium text-stone-700">{email}</span> に確認メールを送信しました。<br />
              メール内のリンクをクリックするとプロフィール入力に進めます。
            </p>
            <p className="text-xs text-stone-400 mt-4">メールが届かない場合は迷惑メールフォルダをご確認ください。</p>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm text-green-700 font-medium">✓ メールアドレスを確認しました</p>
              </div>

              {/* 所属会社表示 */}
              {selectedCompany && (
                <div className="mb-4 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <p className="text-xs text-stone-400 mb-0.5">所属会社</p>
                  <p className="text-sm font-medium text-stone-700">{selectedCompany.name}</p>
                </div>
              )}
              {isOtherCompany && companyNameInput && (
                <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-500 mb-0.5">所属会社（確認待ち）</p>
                  <p className="text-sm font-medium text-stone-700">{companyNameInput}</p>
                </div>
              )}

              <h2 className="font-bold text-stone-700 mb-4">基本情報</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">氏名 <span className="text-red-400">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      placeholder="姓（例: 山田）"
                      className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <input
                      type="text"
                      value={givenName}
                      onChange={(e) => setGivenName(e.target.value)}
                      placeholder="名（例: 誠）"
                      className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">所属詳細</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="例: 東京支店 営業2課"
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>
            </div>

            {/* 活動エリア */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-stone-700 mb-4">活動エリア</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">コアエリア（主な活動市区町村）</label>
                  <input
                    type="text"
                    value={coreCity}
                    onChange={(e) => setCoreCity(e.target.value)}
                    placeholder="例: 横浜市青葉区"
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-2">
                    対応可能エリア（都道府県）
                    {availablePrefectures.length > 0 && (
                      <span className="ml-2 text-orange-500">{availablePrefectures.length}件選択中</span>
                    )}
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                    {PREFECTURES.map((p) => (
                      <button key={p} type="button"
                        onClick={() => togglePrefecture(p)}
                        className={`px-2 py-1.5 rounded-lg text-xs border transition-colors ${availablePrefectures.includes(p) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-stone-600 border-stone-200 hover:border-orange-300'}`}
                      >{p}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 保有資格 */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-stone-700 mb-3">保有資格</h2>
              <div className="flex flex-wrap gap-2">
                {QUALIFICATION_OPTIONS.map((q) => (
                  <button key={q} type="button"
                    onClick={() => toggleQualification(q)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${qualifications.includes(q) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-stone-600 border-stone-200 hover:border-orange-300'}`}
                  >{q}</button>
                ))}
              </div>
            </div>

            {/* 会話スタイル */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-stone-700 mb-1">会話スタイル</h2>
              <p className="text-xs text-stone-400 mb-5">あなたの営業スタイルを6段階で教えてください</p>
              <div className="space-y-6">
                {SALES_STYLE_AXES.map(({ key, left, right }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs font-medium text-stone-600 mb-2">
                      <span>{left}</span>
                      <span>{right}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5, 6].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSalesStyles({ ...salesStyles, [key]: val })}
                          className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-colors ${salesStyles[key] === val ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-stone-400 border-stone-200 hover:border-orange-300'}`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-stone-300 mt-1 px-0.5">
                      <span>← 強くそう思う</span>
                      <span>強くそう思う →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 得意分野 */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-stone-700 mb-1">得意分野</h2>
              <p className="text-xs text-stone-400 mb-4">
                ご自身が特に相談に乗りやすい分野を選択してください。最大{MAX_SPECIALTIES}つまで選択できます。
              </p>
              <div className="flex flex-wrap gap-2">
                {SPECIALTY_OPTIONS.map((item) => {
                  const selected = specialties.includes(item)
                  const disabled = !selected && specialties.length >= MAX_SPECIALTIES
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleSpecialty(item)}
                      disabled={disabled}
                      className={`px-3 py-2 rounded-xl text-xs border transition-colors ${
                        selected
                          ? 'bg-orange-500 text-white border-orange-500'
                          : disabled
                          ? 'bg-stone-50 text-stone-300 border-stone-100 cursor-not-allowed'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-orange-300'
                      }`}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-stone-400">{specialties.length}/{MAX_SPECIALTIES}つ選択中</p>
                {specialtiesError && (
                  <p className="text-xs text-red-500">{specialtiesError}</p>
                )}
              </div>
            </div>

            {/* 自己紹介 */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-stone-700 mb-3">自己紹介</h2>
              <textarea
                value={bio} onChange={(e) => setBio(e.target.value)}
                rows={4} placeholder="お客様への一言、得意なこと、大切にしていることなど"
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
            </div>

            {step2Error && <p className="text-sm text-red-500 px-1">{step2Error}</p>}
            <button
              onClick={handleProfileSubmit}
              disabled={step2Loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-4 rounded-2xl transition-colors text-sm"
            >
              {step2Loading ? '登録中...' : '登録する'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
