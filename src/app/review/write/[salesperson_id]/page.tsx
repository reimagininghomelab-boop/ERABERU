'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const PHASES = [
  { value: 'post_contract', label: '契約後', description: '契約締結後の対応について' },
  { value: 'after_start', label: '着工後', description: '着工後の現場対応について' },
  { value: 'after_handover', label: '引渡後', description: '引渡し後のアフターフォローについて' },
] as const

const RATING_LABELS = ['', '不満', 'やや不満', '普通', '満足', 'とても満足']

type Phase = typeof PHASES[number]['value']

export default function WriteReviewPage() {
  const { salesperson_id } = useParams()
  const router = useRouter()

  const [salesperson, setSalesperson] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const [submittedPhases, setSubmittedPhases] = useState<Phase[]>([])
  const [phase, setPhase] = useState<Phase>('post_contract')
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push(`/auth/login?redirect=/review/write/${salesperson_id}`)
        return
      }
      setAccessToken(session.access_token)
      setAuthLoading(false)
    })
  }, [salesperson_id, router])

  useEffect(() => {
    if (authLoading || !accessToken) return
    const load = async () => {
      const supabase = createClient()

      const { data: sp } = await supabase
        .from('safe_salesperson_profiles')
        .select('id, family_name, given_name, real_name, company_name, department')
        .eq('id', salesperson_id)
        .maybeSingle()

      if (!sp) { setNotFound(true); return }
      setSalesperson(sp)

      // 既投稿フェーズを取得
      const { data: reviews } = await supabase
        .from('anonymous_reviews')
        .select('phase')
        .eq('salesperson_id', salesperson_id as string)
        .in('phase', ['post_contract', 'after_start', 'after_handover'])
      if (reviews) {
        setSubmittedPhases(reviews.map((r: any) => r.phase))
      }
    }
    load()
  }, [authLoading, accessToken, salesperson_id])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/review/submit-authenticated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ salesperson_id, phase, rating, content }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '投稿に失敗しました')
        setStep('form')
      } else {
        setDone(true)
      }
    } catch {
      setError('通信エラーが発生しました')
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">認証確認中...</div>
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-4 px-6">
        <span className="text-5xl">🚫</span>
        <p className="text-lg font-bold text-gray-700">営業マンが見つかりません</p>
      </div>
    )
  }

  if (!salesperson) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">読み込み中...</div>
  }

  const displayName = salesperson.family_name && salesperson.given_name
    ? `${salesperson.family_name} ${salesperson.given_name}`
    : salesperson.real_name

  const availablePhases = PHASES.filter((p) => !submittedPhases.includes(p.value))

  if (done) {
    return (
      <main className="min-h-screen bg-stone-100">
        <header className="bg-gray-900 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            <Link href="/" className="text-2xl font-black text-white tracking-tight">ERABERU</Link>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-6">
          <div className="text-center space-y-2">
            <span className="text-5xl block mb-2">✅</span>
            <p className="text-lg font-bold text-gray-700">口コミを投稿しました</p>
            <p className="text-sm text-gray-400">ご協力ありがとうございました。</p>
          </div>
          <Link
            href={`/salesperson/${salesperson_id}`}
            className="block bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 px-8 rounded-xl transition text-sm"
          >
            {displayName}さんのページへ戻る
          </Link>
        </div>
      </main>
    )
  }

  if (availablePhases.length === 0) {
    return (
      <main className="min-h-screen bg-stone-100">
        <header className="bg-gray-900 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            <Link href="/" className="text-2xl font-black text-white tracking-tight">ERABERU</Link>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4 px-6 text-center">
          <span className="text-5xl">✔️</span>
          <p className="text-lg font-bold text-gray-700">すべてのフェーズの口コミを投稿済みです</p>
          <p className="text-sm text-gray-400">契約後・着工後・引渡後の口コミはそれぞれ1件ずつ投稿できます。</p>
          <Link href={`/salesperson/${salesperson_id}`} className="text-sm text-orange-500 hover:underline mt-2">
            {displayName}さんのページへ
          </Link>
        </div>
      </main>
    )
  }

  // フェーズが未選択 or 投稿済みなら最初の利用可能フェーズへ
  const currentPhase = availablePhases.find((p) => p.value === phase) ?? availablePhases[0]

  return (
    <main className="min-h-screen bg-stone-100">
      <header className="bg-gray-900 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <Link href="/" className="text-2xl font-black text-white tracking-tight">ERABERU</Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-10 space-y-6">

        {/* ヘッダー */}
        <div className="text-center space-y-1">
          <div className="inline-block bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1 rounded-full mb-2">
            口コミ投稿
          </div>
          <p className="text-xl font-bold text-gray-800">{displayName}</p>
          <p className="text-sm text-gray-500">{salesperson.company_name}
            {salesperson.department && `・${salesperson.department}`}
          </p>
        </div>

        {/* ステップインジケーター */}
        <div className="flex items-center justify-center gap-2">
          {(['form', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-stone-200" />}
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-orange-500' : 'text-gray-300'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {i + 1}
                </span>
                {s === 'form' ? '入力' : '確認'}
              </div>
            </div>
          ))}
        </div>

        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">

            {/* フェーズ選択 */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                フェーズ <span className="text-red-400">*</span>
              </p>
              <div className="space-y-2">
                {availablePhases.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPhase(p.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition ${
                      phase === p.value
                        ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium'
                        : 'border-stone-200 text-gray-600 hover:border-stone-300'
                    }`}
                  >
                    <span className="font-bold">{p.label}</span>
                    <span className="text-xs text-gray-400 ml-2">{p.description}</span>
                  </button>
                ))}
                {submittedPhases.length > 0 && (
                  <p className="text-xs text-gray-400 pt-1">
                    ※ {submittedPhases.map((v) => PHASES.find((p) => p.value === v)?.label).join('・')}は投稿済みです
                  </p>
                )}
              </div>
            </div>

            {/* 評価 */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                評価 <span className="text-red-400">*</span>
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={`text-3xl transition-transform hover:scale-110 ${star <= rating ? 'text-amber-400' : 'text-gray-200'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              {rating > 0 && <p className="text-xs text-gray-400 mt-1">{RATING_LABELS[rating]}</p>}
            </div>

            {/* コメント */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                コメント <span className="text-red-400">*</span>
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`${displayName}さんの${currentPhase.label}の対応はいかがでしたか？`}
                rows={5}
                className="w-full text-sm border border-stone-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <p className="text-xs text-gray-300 mt-1 text-right">{content.length} 文字</p>
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

            <button
              onClick={() => { setPhase(phase || currentPhase.value); setStep('confirm') }}
              disabled={rating === 0 || !content.trim()}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition text-sm"
            >
              入力内容を確認する
            </button>

            <p className="text-xs text-gray-300 text-center leading-relaxed">
              投稿された口コミは有料開示ユーザーのみ閲覧できます。<br />
              個人を特定できる情報は記載しないようにしてください。
            </p>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-4">
              <p className="text-sm font-bold text-gray-700">投稿内容の確認</p>

              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between py-3 border-b border-stone-100">
                  <p className="text-xs text-gray-400 w-16 shrink-0">フェーズ</p>
                  <p className="text-gray-700 font-medium">{PHASES.find((p) => p.value === phase)?.label}</p>
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

            {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

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
                disabled={submitting}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl transition text-sm"
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
