'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function AnonymousReviewPage() {
  const { token } = useParams()
  const [salesperson, setSalesperson] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

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
        .select('id, company_name, department, qr_token, status')
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
    if (rating === 0 || !content.trim()) return
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
      } else {
        setDone(true)
      }
    } catch {
      setError('通信エラーが発生しました')
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

  if (done) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-4 px-6">
        <span className="text-5xl">✅</span>
        <p className="text-lg font-bold text-gray-700">口コミを受け付けました</p>
        <p className="text-sm text-gray-400 text-center">
          確認後に公開されます。ご協力ありがとうございました。
        </p>
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
          <p className="text-xl font-bold text-gray-800">{salesperson.company_name}</p>
          {salesperson.department && (
            <p className="text-sm text-gray-500">{salesperson.department}</p>
          )}
          <p className="text-xs text-gray-400 pt-1">
            会員登録なしで投稿できます。内容確認後に公開されます。
          </p>
        </div>

        {/* フォーム */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">

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
                  className={`text-3xl transition-transform hover:scale-110 ${
                    star <= rating ? 'text-amber-400' : 'text-gray-200'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {['', '不満', 'やや不満', '普通', '満足', 'とても満足'][rating]}
              </p>
            )}
          </div>

          {/* コメント */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">
              コメント <span className="text-red-400">*</span>
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="この営業マンとの打ち合わせはいかがでしたか？率直なご意見をお聞かせください。"
              rows={5}
              className="w-full text-sm border border-stone-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-gray-300 mt-1 text-right">{content.length} 文字</p>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={rating === 0 || !content.trim() || submitting}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition text-sm"
          >
            {submitting ? '送信中...' : '口コミを投稿する'}
          </button>

          <p className="text-xs text-gray-300 text-center leading-relaxed">
            投稿された口コミは管理者が確認してから公開されます。<br />
            個人を特定できる情報は記載しないようにしてください。
          </p>
        </div>
      </div>
    </main>
  )
}
