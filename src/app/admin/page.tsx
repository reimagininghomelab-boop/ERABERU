'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

const ADMIN_EMAILS = ['reimagining.home.lab@gmail.com', '1989yo55@gmail.com']

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<any[]>([])
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
        router.replace('/')
        return
      }

      const [{ data: reviewData }, { data: agentData }] = await Promise.all([
        supabase
          .from('contract_reviews')
          .select('id, salesperson_id, user_id, rating, content, meeting_status, contract_price, is_approved, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('safe_salesperson_profiles')
          .select('id, company_name'),
      ])

      if (reviewData) setReviews(reviewData)
      if (agentData) {
        const map: Record<string, string> = {}
        agentData.forEach((a) => { map[a.id] = a.company_name })
        setAgentMap(map)
      }
      setLoading(false)
    }

    load()
  }, [])

  const handleApprove = async (reviewId: string) => {
    setApprovingId(reviewId)
    const supabase = createClient()
    const { error } = await supabase
      .from('contract_reviews')
      .update({ is_approved: true })
      .eq('id', reviewId)
    if (!error) {
      setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, is_approved: true } : r))
    }
    setApprovingId(null)
  }

  const handleReject = async (reviewId: string) => {
    setApprovingId(reviewId)
    const supabase = createClient()
    const { error } = await supabase
      .from('contract_reviews')
      .update({ is_approved: false })
      .eq('id', reviewId)
    if (!error) {
      setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, is_approved: false } : r))
    }
    setApprovingId(null)
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
      読み込み中...
    </div>
  )

  const pending = reviews.filter((r) => !r.is_approved)
  const approved = reviews.filter((r) => r.is_approved)
  const displayed = tab === 'pending' ? pending : approved

  return (
    <main className="min-h-screen bg-stone-100">
      <Header backButton />

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">口コミ管理</h1>
          <span className="text-xs bg-orange-100 text-orange-600 px-3 py-1 rounded-full font-medium">管理者専用</span>
        </div>

        {/* タブ */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'pending'
                ? 'bg-orange-500 text-white'
                : 'bg-stone-50 text-gray-500 border border-stone-200 hover:border-orange-300'
            }`}
          >
            非公開
            {pending.length > 0 && (
              <span className="ml-2 bg-white text-orange-500 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {pending.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('approved')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'approved'
                ? 'bg-green-500 text-white'
                : 'bg-stone-50 text-gray-500 border border-stone-200 hover:border-green-300'
            }`}
          >
            公開中
            <span className="ml-2 text-xs opacity-70">{approved.length}</span>
          </button>
        </div>

        {/* 口コミ一覧 */}
        {displayed.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-3xl mb-3">✓</p>
            <p className="text-sm">{tab === 'pending' ? '非公開の口コミはありません' : '公開中の口コミはありません'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayed.map((r) => (
              <div key={r.id} className="bg-stone-50 rounded-2xl border border-stone-200 p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">営業マン</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {agentMap[r.salesperson_id] ?? r.salesperson_id}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>

                <div className="space-y-2 mb-4">
                  {r.rating && (
                    <p className="text-sm text-amber-400">
                      {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                    </p>
                  )}
                  {r.meeting_status && (
                    <p className="text-xs text-gray-500">📋 {r.meeting_status}</p>
                  )}
                  {r.contract_price && (
                    <p className="text-xs text-gray-500">
                      成約価格: {(r.contract_price / 10000).toLocaleString()}万円
                    </p>
                  )}
                  <p className="text-sm text-gray-700 leading-relaxed">{r.content}</p>
                </div>

                <div className="flex gap-2">
                  {!r.is_approved ? (
                    <button
                      onClick={() => handleApprove(r.id)}
                      disabled={approvingId === r.id}
                      className="flex-1 bg-green-500 hover:bg-green-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
                    >
                      {approvingId === r.id ? '処理中...' : '公開する'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReject(r.id)}
                      disabled={approvingId === r.id}
                      className="flex-1 bg-stone-200 hover:bg-stone-300 disabled:opacity-50 text-gray-500 font-bold py-2.5 rounded-xl transition text-sm"
                    >
                      {approvingId === r.id ? '処理中...' : '非公開にする'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
