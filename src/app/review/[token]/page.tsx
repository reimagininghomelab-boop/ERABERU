'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Step = 'salesperson-confirm' | 'email' | 'email-sent' | 'verifying' | 'form' | 'confirm'

const PHASES = [
  { value: 'pre_contract',   label: '検討・商談中', description: '契約前の打ち合わせについて' },
  { value: 'post_contract',  label: '契約後',       description: '契約後の対応について' },
  { value: 'after_start',    label: '着工後',       description: '着工後の現場対応について' },
  { value: 'after_handover', label: '引渡後',       description: '引渡し後のアフターフォローについて' },
] as const

type Phase = typeof PHASES[number]['value']

const RATING_LABELS = ['', '不満', 'やや不満', '普通', '満足', 'とても満足']

export default function AnonymousReviewPage() {
  const { token } = useParams()
  const [salesperson, setSalesperson] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('salesperson-confirm')
  const [email, setEmail] = useState('')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [sendingOtp, setSendingOtp] = useState(false)

  const [phase, setPhase] = useState<Phase>('pre_contract')
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [consentAccepted, setConsentAccepted] = useState(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('v') === '1') {
      processEmailVerification()
    } else {
      load()
    }
  }, [token])

  const load = async () => {
    const supabase = createClient()
    const { data } = await supabase.rpc('get_salesperson_by_qr_token', { p_token: token as string })
    const salespersonData = Array.isArray(data) ? data[0] : null

    if (!salespersonData) {
      setNotFound(true)
    } else {
      setSalesperson(salespersonData)
      setStep('salesperson-confirm')
    }
    setLoading(false)
  }

  const processEmailVerification = async () => {
    setStep('verifying')
    const supabase = createClient()

    // Supabase がURLフラグメントを処理するまで少し待つ
    await new Promise(resolve => setTimeout(resolve, 800))

    const { data: { session } } = await supabase.auth.getSession()

    // URLをクリーンアップ
    window.history.replaceState({}, '', `/review/${token}`)

    if (!session?.access_token || !session?.user?.email) {
      await load()
      setError('メール認証に失敗しました。もう一度お試しください。')
      setStep('email')
      return
    }

    // access_token を保持しておき、フォーム送信時にサーバーで検証させる
    // signOut はここではなく投稿成功後に行う（先にsignOutするとtokenが無効になるため）
    const token_jwt = session.access_token

    const { data } = await supabase.rpc('get_salesperson_by_qr_token', { p_token: token as string })
    const salespersonData = Array.isArray(data) ? data[0] : null

    if (!salespersonData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setSalesperson(salespersonData)
    setAccessToken(token_jwt)
    setStep('form')
    setLoading(false)
  }

  const sendOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('正しいメールアドレスを入力してください')
      return
    }
    setSendingOtp(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/review/${token}?v=1`,
          shouldCreateUser: true,
        },
      })

      if (otpError) throw otpError
      setStep('email-sent')
    } catch {
      setError('メールの送信に失敗しました。もう一度お試しください。')
    } finally {
      setSendingOtp(false)
    }
  }

  const handleSubmit = async () => {
    if (!accessToken) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/review/submit-email-verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, content, phase, access_token: accessToken, consentAccepted }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.duplicate) {
          setAlreadySubmitted(true)
        } else {
          setError(json.error ?? '投稿に失敗しました')
          setStep('form')
        }
      } else {
        // 投稿成功後にサインアウト（先にするとaccess_tokenが無効になるため）
        const supabase = createClient()
        await supabase.auth.signOut()
        setDone(true)
      }
    } catch {
      setError('通信エラーが発生しました')
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }

  // ローディング
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
        {step === 'verifying' ? 'メール認証を確認中...' : '読み込み中...'}
      </div>
    )
  }

  // QR無効
  if (notFound) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-4 px-6">
        <span className="text-5xl">🚫</span>
        <p className="text-lg font-bold text-gray-700">このQRコードは無効です</p>
        <p className="text-sm text-gray-400 text-center">
          QRコードが再発行されたか、URLが正しくない可能性があります。<br />
          担当者に新しいQRコードを発行してもらってください。
        </p>
      </div>
    )
  }

  // 投稿済み
  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-6 px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-8 space-y-4 text-center">
          <span className="text-4xl block">📧</span>
          <p className="text-base font-bold text-gray-700">投稿済みの口コミがあります</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            このメールアドレスでは、すでにこの担当者への口コミが投稿されています。<br />
            内容の修正や削除を希望する場合は、お問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  const displayName = salesperson
    ? (salesperson.family_name && salesperson.given_name
        ? `${salesperson.family_name} ${salesperson.given_name}`
        : salesperson.real_name)
    : ''

  // 投稿完了
  if (done) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center space-y-2">
          <span className="text-5xl block mb-2">✅</span>
          <p className="text-lg font-bold text-gray-700">口コミを受け付けました</p>
          <p className="text-sm text-gray-400">
            確認後に公開されます。ご協力ありがとうございました。
          </p>
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-1">ERABERUに会員登録する</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              住宅営業マンを口コミで選べるサービスです。登録・利用は無料です。
            </p>
          </div>
          <a
            href={`/auth/login?from=qr&mode=signup`}
            className="block w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition text-sm text-center"
          >
            無料で会員登録する
          </a>
          <a
            href={`/auth/login?from=qr`}
            className="block w-full text-center text-xs text-gray-400 hover:text-gray-600 transition"
          >
            すでにアカウントをお持ちの方はログイン
          </a>
        </div>
      </div>
    )
  }

  // ステップ数（UI表示用）
  const STEPS: Step[] = ['salesperson-confirm', 'email', 'form', 'confirm']
  const stepIndex = STEPS.indexOf(step === 'email-sent' ? 'email' : step)

  return (
    <main className="min-h-screen bg-stone-100">
      <div className="max-w-lg mx-auto px-6 py-10 space-y-6">

        {/* ヘッダー */}
        <div className="text-center space-y-1">
          <div className="inline-block bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1 rounded-full mb-2">
            口コミ投稿
          </div>
          <p className="text-xl font-bold text-gray-800">{displayName}</p>
          <p className="text-sm text-gray-500">
            {salesperson?.company_name}
            {salesperson?.department && `・${salesperson.department}`}
          </p>
        </div>

        {/* ステップインジケーター */}
        {step !== 'email-sent' && (
          <div className="flex items-center justify-center gap-1">
            {['担当者確認', 'メール認証', '口コミ入力', '確認'].map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={`flex items-center gap-1 text-xs font-medium ${i === stepIndex ? 'text-orange-500' : i < stepIndex ? 'text-gray-400' : 'text-gray-300'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < stepIndex ? 'bg-gray-300 text-white' : i === stepIndex ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>{i + 1}</span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < 3 && <div className="w-4 h-px bg-stone-200 mx-0.5" />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 1: 担当者確認 */}
        {step === 'salesperson-confirm' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-bold text-gray-700">口コミ対象の担当者</p>
              <div className="bg-stone-50 rounded-xl p-4 space-y-1">
                <p className="text-base font-bold text-gray-800">{displayName}</p>
                <p className="text-sm text-gray-500">
                  {salesperson?.company_name}
                  {salesperson?.department && ` / ${salesperson.department}`}
                </p>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                上記の担当者に対して口コミを投稿します。お間違えでなければ、下のボタンを押してください。
              </p>
            </div>

            <button
              onClick={() => setStep('email')}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-4 rounded-xl transition text-sm"
            >
              この担当者への口コミを投稿する
            </button>
          </div>
        )}

        {/* STEP 2: メールアドレス入力 */}
        {step === 'email' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">本人確認のためのメール認証</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-700 leading-relaxed">
                  メールアドレスは、口コミの本人確認・重複投稿防止のためだけに使用します。営業担当者や住宅会社に開示されることはありません。
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium">
                メールアドレス <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                placeholder="example@email.com"
                className="w-full text-sm text-gray-800 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
            )}

            <button
              onClick={sendOtp}
              disabled={sendingOtp || !email.trim()}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition text-sm"
            >
              {sendingOtp ? '送信中...' : '認証メールを送る'}
            </button>

            <button
              onClick={() => { setStep('salesperson-confirm'); setError('') }}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition py-1"
            >
              戻る
            </button>
          </div>
        )}

        {/* STEP 2b: メール送信済み */}
        {step === 'email-sent' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 text-center space-y-4">
            <span className="text-5xl block">📧</span>
            <div className="space-y-2">
              <p className="text-base font-bold text-gray-700">認証メールを送信しました</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                <span className="font-medium text-gray-700">{email}</span><br />
                に認証リンクを送りました。メールを開いてリンクをタップしてください。
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-left">
              <p className="text-xs text-amber-700 leading-relaxed">
                メールが届かない場合は、迷惑メールフォルダをご確認ください。
                数分待っても届かない場合は、もう一度お試しください。
              </p>
            </div>
            <button
              onClick={() => { setStep('email'); setError('') }}
              className="text-xs text-gray-400 hover:text-gray-600 transition"
            >
              メールアドレスを変更する
            </button>
          </div>
        )}

        {/* STEP 3: 口コミ入力フォーム */}
        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">

            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2">
              <p className="text-xs text-green-700">
                この口コミは、メール認証済みの投稿として扱われます。
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                投稿するフェーズ <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PHASES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPhase(p.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition ${
                      phase === p.value
                        ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium'
                        : 'border-stone-200 text-gray-600 hover:border-stone-300'
                    }`}
                  >
                    <p className="font-medium text-xs">{p.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                評価 <span className="text-red-400">*</span>
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={`text-3xl transition-transform hover:scale-110 ${
                      star <= rating ? 'text-amber-400' : 'text-gray-200'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-xs text-gray-400 mt-1">{RATING_LABELS[rating]}</p>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                コメント <span className="text-red-400">*</span>
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`${displayName}さんとの打ち合わせはいかがでしたか？率直なご意見をお聞かせください。`}
                rows={5}
                className="w-full text-sm text-gray-800 border border-stone-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <p className="text-xs text-gray-300 mt-1 text-right">{content.length} 文字</p>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
            )}

            <button
              onClick={() => setStep('confirm')}
              disabled={rating === 0 || !content.trim()}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition text-sm"
            >
              入力内容を確認する
            </button>

            <p className="text-xs text-gray-300 text-center leading-relaxed">
              投稿された口コミは管理者が確認してから公開されます。<br />
              個人を特定できる情報は記載しないようにしてください。
            </p>
          </div>
        )}

        {/* STEP 4: 確認画面 */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-4">
              <p className="text-sm font-bold text-gray-700">投稿内容の確認</p>

              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between py-3 border-b border-stone-100">
                  <p className="text-xs text-gray-400 w-16 shrink-0">フェーズ</p>
                  <p className="text-gray-700 font-medium">{PHASES.find(p => p.value === phase)?.label}</p>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-stone-100">
                  <p className="text-xs text-gray-400 w-16 shrink-0">評価</p>
                  <div className="text-right">
                    <p className="text-amber-400 text-lg tracking-wide">
                      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{RATING_LABELS[rating]}</p>
                  </div>
                </div>

                <div className="py-3">
                  <p className="text-xs text-gray-400 mb-2">コメント</p>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                投稿後の編集・削除はできません。内容をご確認のうえ送信してください。
              </p>
            </div>

            {/* 同意UI */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-gray-700">投稿前にご確認ください</p>
              <ul className="text-xs text-gray-600 leading-relaxed space-y-1.5 list-disc list-inside">
                <li>投稿内容は、営業担当者のプロフィール表示、口コミ要約、サービス改善に利用される場合があります。</li>
                <li>投稿した文章そのものが、あなたの許可なく住宅会社に個別提供されたり、書籍・広告等に掲載されたりすることはありません。</li>
                <li>投稿内容は、個人が特定されないよう配慮したうえで、統計化・要約化された分析データとして営業改善等に活用される場合があります。</li>
                <li>口コミ等の情報はAIその他の自動処理技術により紹介文・要約文等の作成に利用される場合があります。</li>
                <li>個人を特定できる情報、事実確認が困難な断定表現、誹謗中傷、虚偽の内容、実体験に基づかない投稿は掲載できません。</li>
              </ul>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0"
                />
                <span className="text-xs text-gray-700 leading-relaxed">
                  上記の内容を確認し、
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">利用規約</a>・
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">プライバシーポリシー</a>
                  に同意して投稿します。
                </span>
              </label>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('form'); setError('') }}
                disabled={submitting}
                className="flex-1 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-gray-600 font-bold py-4 rounded-xl transition text-sm"
              >
                修正する
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !consentAccepted}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition text-sm"
              >
                {submitting ? '送信中...' : '投稿する'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
