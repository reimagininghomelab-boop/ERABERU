'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const RATING_LABELS = ['', '不満', 'やや不満', '普通', '満足', 'とても満足']

export default function AnonymousReviewPage() {
  const { token } = useParams()
  const [salesperson, setSalesperson] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('salesperson_profiles')
        .select('id, family_name, given_name, real_name, company_name, department, qr_token, status')
        .eq('qr_token', token)
        .eq('status', 'active')
        .maybeSingle()

      if (!data) {
        setNotFound(true)
      } else {
        setSalesperson(data)
      }
      setLoading(false)
    }
    load()
  }, [token])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, content }),
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

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
        読み込み中...
      </div>
    )
  }

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

  const displayName = salesperson.family_name && salesperson.given_name
    ? `${salesperson.family_name} ${salesperson.given_name}`
    : salesperson.real_name

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

  return (
    <main className="min-h-screen bg-stone-100">
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
          <p className="text-xs text-gray-400 pt-1">
            会員登録なしで投稿できます。内容確認後に公開されます。
          </p>
        </div>

        {/* ステップインジケーター */}
        <div className="flex items-center justify-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'form' ? 'text-orange-500' : 'text-gray-300'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'form' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>1</span>
            入力
          </div>
          <div className="w-8 h-px bg-stone-200" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'confirm' ? 'text-orange-500' : 'text-gray-300'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'confirm' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
            確認
          </div>
        </div>

        {/* 入力フォーム */}
        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">

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
                className="w-full text-sm border border-stone-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
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

        {/* 確認画面 */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-4">
              <p className="text-sm font-bold text-gray-700">投稿内容の確認</p>

              <div className="space-y-4 text-sm">
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
