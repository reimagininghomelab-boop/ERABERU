'use client'
import { useEffect, useState } from 'react'
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

const SALES_STYLE_AXES = [
  { key: 'listening_proposing', left: '傾聴型', right: '提案型' },
  { key: 'numbers_feeling', left: '数字で説明', right: '感覚で説明' },
]

type Company = { id: string; name: string; domains: string[] }

export default function SalespersonRegisterPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [step, setStep] = useState<1 | 2 | 'email_sent'>(1)
  const [initializing, setInitializing] = useState(true)
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null)

  // Step 1
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
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
  const [salesStyles, setSalesStyles] = useState<Record<string, number>>({
    listening_proposing: 3,
    numbers_feeling: 3,
  })
  const [bio, setBio] = useState('')
  const [step2Loading, setStep2Loading] = useState(false)
  const [step2Error, setStep2Error] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const loadCompanies = async () => {
      const { data } = await supabase.from('companies').select('id, name, domains').order('name')
      if (data) setCompanies(data)
    }

    const checkSession = async (userId: string) => {
      const { data: profile } = await supabase
        .from('salesperson_profiles')
        .select('id, status, company_id, companies(id, name, domains)')
        .eq('user_id', userId)
        .maybeSingle()

      if (profile?.status === 'active') {
        router.replace('/salesperson/dashboard')
        return
      }

      if (profile?.status === 'pending_email') {
        setPendingProfileId(profile.id)
        const company = profile.companies as any
        if (company) { setSelectedCompany(company); setSelectedCompanyId(company.id) }
      } else {
        const pendingCompanyId = localStorage.getItem('pending_company_id')
        if (pendingCompanyId) setSelectedCompanyId(pendingCompanyId)
        localStorage.removeItem('pending_company_id')
      }

      setStep(2)
      setInitializing(false)
    }

    loadCompanies()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await checkSession(session.user.id)
      } else {
        setInitializing(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // companies ロード後に selectedCompanyId から selectedCompany を復元
  useEffect(() => {
    if (companies.length > 0 && selectedCompanyId && !selectedCompany) {
      const c = companies.find((c) => c.id === selectedCompanyId)
      if (c) setSelectedCompany(c)
    }
  }, [companies, selectedCompanyId])

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

  const handleAccountSubmit = async () => {
    setStep1Error('')
    if (!selectedCompanyId) { setStep1Error('会社を選択してください'); return }
    if (!email || !password) { setStep1Error('メールアドレスとパスワードを入力してください'); return }
    if (password.length < 6) { setStep1Error('パスワードは6文字以上で入力してください'); return }

    const company = companies.find((c) => c.id === selectedCompanyId)
    const domain = email.split('@')[1]?.toLowerCase()
    if (!company || !domain || !company.domains.includes(domain)) {
      setStep1Error(`選択した会社のメールアドレスを使用してください（例: yourname@${company?.domains[0] ?? 'company.co.jp'}）`)
      return
    }

    setStep1Loading(true)
    const supabase = createClient()

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/salesperson/register`,
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

    localStorage.setItem('pending_company_id', selectedCompanyId)

    setStep1Loading(false)
    setStep('email_sent')
  }

  const handleProfileSubmit = async () => {
    setStep2Error('')
    if (!familyName || !givenName) { setStep2Error('姓と名を入力してください'); return }

    setStep2Loading(true)
    const supabase = createClient()

    const { data: { user }, error: getUserError } = await supabase.auth.getUser()
    if (getUserError || !user) {
      setStep2Error('セッションが失われました。メールのリンクから再度アクセスしてください。')
      setStep2Loading(false)
      return
    }

    if (!selectedCompanyId) {
      setStep2Error('会社情報が取得できませんでした。ページを再読み込みしてください。')
      setStep2Loading(false)
      return
    }

    const profileData = {
      family_name: familyName,
      given_name: givenName,
      real_name: `${familyName} ${givenName}`,
      company_id: selectedCompanyId,
      department: department || null,
      core_city: coreCity || null,
      available_prefectures: availablePrefectures,
      qualifications: qualifications,
      sales_styles: salesStyles,
      bio: bio || null,
      status: 'active',
    }

    let saveError = null
    if (pendingProfileId) {
      const { error } = await supabase
        .from('salesperson_profiles')
        .update(profileData)
        .eq('id', pendingProfileId)
      saveError = error
    } else {
      const { error } = await supabase
        .from('salesperson_profiles')
        .insert({ user_id: user.id, ...profileData })
      saveError = error
    }

    if (saveError) {
      setStep2Error('登録に失敗しました: ' + saveError.message)
      setStep2Loading(false)
      return
    }

    setDone(true)
    setStep2Loading(false)
  }

  if (initializing) return <div className="min-h-screen bg-stone-100" />

  if (done) {
    return (
      <main className="min-h-screen bg-stone-100">
        <Header />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <div className="bg-white rounded-2xl shadow-sm p-10">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-stone-800 mb-3">登録が完了しました</h2>
            <p className="text-stone-500 text-sm leading-relaxed mb-6">
              プロフィールが公開されました。<br />
              ダッシュボードから掲載状況や口コミを確認できます。
            </p>
            <Link href="/salesperson/dashboard" className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition text-sm">
              ダッシュボードへ
            </Link>
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
          <p className="text-stone-500 text-sm mt-1">会社のメールアドレスで登録してください。</p>
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
                  onChange={(e) => {
                    setSelectedCompanyId(e.target.value)
                    setSelectedCompany(companies.find((c) => c.id === e.target.value) ?? null)
                  }}
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                >
                  <option value="">会社を選択してください</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {selectedCompany && (
                  <p className="text-xs text-stone-400 mt-1">使用可能ドメイン: {selectedCompany.domains.map((d) => `@${d}`).join('、')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">会社メールアドレス <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={selectedCompany ? `yourname@${selectedCompany.domains[0]}` : 'example@company.co.jp'}
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
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

              {/* 所属会社（読み取り専用） */}
              {selectedCompany && (
                <div className="mb-4 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <p className="text-xs text-stone-400 mb-0.5">所属会社（メール認証済み）</p>
                  <p className="text-sm font-medium text-stone-700">{selectedCompany.name}</p>
                </div>
              )}

              <h2 className="font-bold text-stone-700 mb-4">基本情報</h2>
              <div className="space-y-4">

                {/* ② 姓・名 */}
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

                {/* ⑤ 所属詳細 */}
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

            {/* ⑥ 活動エリア */}
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

            {/* ⑦ 会話スタイル */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-stone-700 mb-1">会話スタイル</h2>
              <p className="text-xs text-stone-400 mb-5">あなたの営業スタイルを5段階で教えてください</p>
              <div className="space-y-6">
                {SALES_STYLE_AXES.map(({ key, left, right }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs font-medium text-stone-600 mb-2">
                      <span>{left}</span>
                      <span>{right}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((val) => (
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
              {step2Loading ? '登録中...' : '登録して公開する'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
