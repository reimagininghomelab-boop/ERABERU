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
  const [tab, setTab] = useState<'pending' | 'approved' | 'salesperson' | 'suspended'>('pending')
  const [applications, setApplications] = useState<any[]>([])
  const [processingAppId, setProcessingAppId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
        router.replace('/')
        return
      }

      const [{ data: reviewData }, { data: agentData }, { data: appData }] = await Promise.all([
        supabase
          .from('contract_reviews')
          .select('id, salesperson_id, user_id, rating, content, meeting_status, contract_price, is_approved, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('safe_salesperson_profiles')
          .select('id, company_name'),
        supabase
          .from('salesperson_profiles')
          .select('id, real_name, company_name, area_prefecture, experience_years, bio, status, created_at')
          .not('user_id', 'is', null)
          .order('created_at', { ascending: false }),
      ])

      if (reviewData) setReviews(reviewData)
      if (agentData) {
        const map: Record<string, string> = {}
        agentData.forEach((a) => { map[a.id] = a.company_name })
        setAgentMap(map)
      }
      if (appData) setApplications(appData)
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

  const handleApproveApplication = async (appId: string) => {
    setProcessingAppId(appId)
    const supabase = createClient()
    const { error } = await supabase
      .from('salesperson_profiles')
      .update({ status: 'active' })
      .eq('id', appId)
    if (!error) {
      setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: 'active' } : a))
    }
    setProcessingAppId(null)
  }

  const handleRejectApplication = async (appId: string) => {
    if (!confirm('この申請を審査否認しますか？')) return
    setProcessingAppId(appId)
    const supabase = createClient()
    const { error } = await supabase
      .from('salesperson_profiles')
      .update({ status: 'rejected' })
      .eq('id', appId)
    if (!error) {
      setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: 'rejected' } : a))
    }
    setProcessingAppId(null)
  }

  const handleSuspend = async (appId: string) => {
    if (!confirm('この営業マンを一時停止しますか？')) return
    setProcessingAppId(appId)
    const supabase = createClient()
    const { error } = await supabase
      .from('salesperson_profiles')
      .update({ status: 'suspended' })
      .eq('id', appId)
    if (!error) {
      setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: 'suspended' } : a))
    }
    setProcessingAppId(null)
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
      読み込み中...
    </div>
  )

  const pending = reviews.filter((r) => !r.is_approved)
  const approved = reviews.filter((r) => r.is_approved)

  return (
    <main className="min-h-screen bg-stone-100">
      <Header backButton />

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">管理画面</h1>
          <span className="text-xs bg-orange-100 text-orange-600 px-3 py-1 rounded-full font-medium">管理者専用</span>
        </div>

        {/* タブ */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'pending'
                ? 'bg-orange-500 text-white'
                : 'bg-stone-50 text-gray-500 border border-stone-200 hover:border-orange-300'
            }`}
          >
            口コミ（非公開）
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
            口コミ（公開中）
            <span className="ml-2 text-xs opacity-70">{approved.length}</span>
          </button>
          <button
            onClick={() => setTab('salesperson')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'salesperson'
                ? 'bg-blue-500 text-white'
                : 'bg-stone-50 text-gray-500 border border-stone-200 hover:border-blue-300'
            }`}
          >
            営業マン申請
            {applications.filter((a) => a.status === 'pending').length > 0 && (
              <span className="ml-2 bg-white text-blue-500 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {applications.filter((a) => a.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {/* 口コミ一覧 */}
        {tab !== 'salesperson' && (() => {
          const displayed = tab === 'pending' ? pending : approved
          return displayed.length === 0 ? (
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
          )
        })()}

        {/* 営業マン管理 */}
        {tab === 'salesperson' && (() => {
          const pendingApps = applications.filter((a) => a.status === 'pending')
          const activeApps = applications.filter((a) => a.status === 'active')
          const otherApps = applications.filter((a) => ['rejected', 'suspended', 'banned', 'retired'].includes(a.status))

          const statusLabel: Record<string, string> = {
            pending: '審査中',
            active: '公開中',
            suspended: '一時停止',
            rejected: '審査否認',
            banned: 'BAN',
            retired: '退会',
          }
          const statusColor: Record<string, string> = {
            pending: 'bg-amber-100 text-amber-600',
            active: 'bg-green-100 text-green-600',
            suspended: 'bg-gray-100 text-gray-500',
            rejected: 'bg-red-100 text-red-500',
            banned: 'bg-red-200 text-red-700',
            retired: 'bg-stone-100 text-stone-400',
          }

          const renderCard = (a: any) => (
            <div key={a.id} className="bg-stone-50 rounded-2xl border border-stone-200 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{a.real_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.company_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[a.status] ?? 'bg-stone-100 text-stone-400'}`}>
                    {statusLabel[a.status] ?? a.status}
                  </span>
                  <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('ja-JP')}</p>
                </div>
              </div>

              <div className="space-y-1 mb-4 text-xs text-gray-500">
                {a.area_prefecture && <p>📍 {a.area_prefecture}</p>}
                {a.experience_years && <p>🕐 経験 {a.experience_years}年</p>}
                {a.bio && <p className="text-sm text-gray-700 leading-relaxed mt-2 line-clamp-3">{a.bio}</p>}
              </div>

              <div className="flex gap-2">
                {a.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApproveApplication(a.id)}
                      disabled={processingAppId === a.id}
                      className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
                    >
                      {processingAppId === a.id ? '処理中...' : '承認して公開'}
                    </button>
                    <button
                      onClick={() => handleRejectApplication(a.id)}
                      disabled={processingAppId === a.id}
                      className="flex-1 bg-stone-200 hover:bg-red-100 hover:text-red-500 disabled:opacity-50 text-gray-500 font-bold py-2.5 rounded-xl transition text-sm"
                    >
                      {processingAppId === a.id ? '処理中...' : '審査否認'}
                    </button>
                  </>
                )}
                {a.status === 'active' && (
                  <button
                    onClick={() => handleSuspend(a.id)}
                    disabled={processingAppId === a.id}
                    className="flex-1 bg-stone-200 hover:bg-amber-100 hover:text-amber-600 disabled:opacity-50 text-gray-500 font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    {processingAppId === a.id ? '処理中...' : '一時停止'}
                  </button>
                )}
                {(a.status === 'suspended' || a.status === 'rejected') && (
                  <button
                    onClick={() => handleApproveApplication(a.id)}
                    disabled={processingAppId === a.id}
                    className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    {processingAppId === a.id ? '処理中...' : '再公開'}
                  </button>
                )}
              </div>
            </div>
          )

          return (
            <div className="space-y-6">
              {pendingApps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-600 mb-3">審査待ち（{pendingApps.length}件）</p>
                  <div className="space-y-4">{pendingApps.map(renderCard)}</div>
                </div>
              )}
              {activeApps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-green-600 mb-3">公開中（{activeApps.length}件）</p>
                  <div className="space-y-4">{activeApps.map(renderCard)}</div>
                </div>
              )}
              {otherApps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-3">その他（{otherApps.length}件）</p>
                  <div className="space-y-4">{otherApps.map(renderCard)}</div>
                </div>
              )}
              {applications.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <p className="text-3xl mb-3">✓</p>
                  <p className="text-sm">営業マンの登録はありません</p>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </main>
  )
}
