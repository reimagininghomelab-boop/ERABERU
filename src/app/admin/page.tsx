'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'
import { QRCodeSVG } from 'qrcode.react'

const ADMIN_EMAILS = ['reimagining.home.lab@gmail.com', '1989yo55@gmail.com']

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<any[]>([])
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'superseded' | 'salesperson' | 'offers'>('pending')
  const [applications, setApplications] = useState<any[]>([])
  const [processingAppId, setProcessingAppId] = useState<string | null>(null)
  const [offers, setOffers] = useState<any[]>([])
  const [aiGeneratingId, setAiGeneratingId] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<Record<string, { summary: string; goodMatch: string[]; communicationStyle: string; strengths: string[]; caution: string }>>({})
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({})
  const [anonReviews, setAnonReviews] = useState<any[]>([])
  const [anonApprovingId, setAnonApprovingId] = useState<string | null>(null)
  const [qrReissuingId, setQrReissuingId] = useState<string | null>(null)
  const [qrTokenMap, setQrTokenMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
        router.replace('/')
        return
      }
      const [{ data: reviewData }, { data: agentData }, { data: appData }, { data: anonData }, { data: offerData }] = await Promise.all([
        supabase
          .from('contract_reviews')
          .select('id, salesperson_id, user_id, rating, content, meeting_status, contract_price, is_approved, first_approved_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('safe_salesperson_profiles')
          .select('id, company_name'),
        supabase
          .from('salesperson_profiles')
          .select('id, real_name, family_name, given_name, company_name, area_prefecture, experience_years, bio, status, ai_summary, qr_token, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('anonymous_reviews')
          .select('id, salesperson_id, rating, content, phase, source, status, is_approved, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('offers')
          .select('id, buyer_id, salesperson_id, area, timing, message, contact_name, contact_email, status, created_at')
          .order('created_at', { ascending: false }),
      ])

      if (reviewData) setReviews(reviewData)
      if (agentData) {
        const map: Record<string, string> = {}
        agentData.forEach((a) => { map[a.id] = a.company_name })
        setAgentMap(map)
      }
      if (appData) {
        setApplications(appData)
        const tokenMap: Record<string, string> = {}
        const nameMap: Record<string, string> = {}
        appData.forEach((a) => {
          if (a.qr_token) tokenMap[a.id] = a.qr_token
          const name = (a.family_name && a.given_name)
            ? `${a.family_name} ${a.given_name}`
            : (a.real_name ?? '')
          nameMap[a.id] = name ? `${name}（${a.company_name}）` : a.company_name
        })
        setQrTokenMap(tokenMap)
        setAgentMap((prev) => ({ ...prev, ...nameMap }))
      }
      if (anonData) setAnonReviews(anonData)
      if (offerData) setOffers(offerData)
      setLoading(false)
    }

    load()
  }, [])

  const handleApprove = async (reviewId: string) => {
    setApprovingId(reviewId)
    const supabase = createClient()
    const review = reviews.find((r) => r.id === reviewId)
    const isFirstApproval = !review?.first_approved_at
    const now = new Date().toISOString()

    const updatePayload: Record<string, unknown> = { is_approved: true }
    if (isFirstApproval) updatePayload.first_approved_at = now

    const { error } = await supabase
      .from('contract_reviews')
      .update(updatePayload)
      .eq('id', reviewId)

    if (!error) {
      setReviews((prev) => prev.map((r) =>
        r.id === reviewId
          ? { ...r, is_approved: true, first_approved_at: r.first_approved_at ?? now }
          : r
      ))
      // 初回承認のみ自動再生成チェックをバックグラウンドで実行
      if (isFirstApproval && review?.salesperson_id) {
        fetch('/api/ai/auto-regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salespersonId: review.salesperson_id }),
        }).catch(() => {})
      }
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


  const handleGenerateAiIntro = async (appId: string) => {
    setAiGeneratingId(appId)
    setAiErrors((prev) => { const next = { ...prev }; delete next[appId]; return next })
    try {
      const res = await fetch('/api/ai/sales-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salespersonId: appId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiErrors((prev) => ({ ...prev, [appId]: data.error ?? 'エラーが発生しました' }))
        if (res.status === 422) {
          // データ不足でサーバー側が ai_summary を削除したのでローカル状態も消す
          setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, ai_summary: null } : a))
          setAiResults((prev) => { const next = { ...prev }; delete next[appId]; return next })
        }
      } else {
        setAiResults((prev) => ({ ...prev, [appId]: data.result }))
      }
    } catch {
      setAiErrors((prev) => ({ ...prev, [appId]: '通信エラーが発生しました' }))
    }
    setAiGeneratingId(null)
  }

  const handleAnonShow = async (reviewId: string) => {
    setAnonApprovingId(reviewId)
    const supabase = createClient()
    const { error } = await supabase
      .from('anonymous_reviews')
      .update({ status: 'visible' })
      .eq('id', reviewId)
    if (!error) {
      setAnonReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, status: 'visible', is_approved: true } : r))
    }
    setAnonApprovingId(null)
  }

  const handleAnonHide = async (reviewId: string) => {
    setAnonApprovingId(reviewId)
    const supabase = createClient()
    const { error } = await supabase
      .from('anonymous_reviews')
      .update({ status: 'hidden' })
      .eq('id', reviewId)
    if (!error) {
      setAnonReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, status: 'hidden', is_approved: false } : r))
    }
    setAnonApprovingId(null)
  }

  const handleReissueQr = async (salespersonId: string) => {
    if (!confirm('QRコードを再発行します。以前のQRコードからの投稿ができなくなります。続けますか？')) return
    setQrReissuingId(salespersonId)
    try {
      const newToken = crypto.randomUUID()
      const supabase = createClient()
      const { error } = await supabase
        .from('salesperson_profiles')
        .update({ qr_token: newToken })
        .eq('id', salespersonId)
      if (!error) {
        setQrTokenMap((prev) => ({ ...prev, [salespersonId]: newToken }))
      }
    } catch {
      // silent
    }
    setQrReissuingId(null)
  }

  const handleMakePrivate = async (appId: string) => {
    if (!confirm('この営業マンを非公開にしますか？')) return
    setProcessingAppId(appId)
    const supabase = createClient()
    const { error } = await supabase
      .from('salesperson_profiles')
      .update({ status: 'pending' })
      .eq('id', appId)
    if (!error) {
      setApplications((prev) => prev.map((a) => a.id === appId ? { ...a, status: 'pending' } : a))
    }
    setProcessingAppId(null)
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-600">
      読み込み中...
    </div>
  )

  const allReviews = [
    ...reviews.map((r) => ({ ...r, _type: 'contract' as const })),
    ...anonReviews.map((r) => ({ ...r, _type: 'qr' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const isSuperseded = (r: any) => r._type === 'qr' && r.status === 'superseded'
  const isVisible = (r: any) => r._type === 'qr' ? r.status === 'visible' : r.is_approved
  const superseded = allReviews.filter((r) => isSuperseded(r))
  const pending = allReviews.filter((r) => !isVisible(r) && !isSuperseded(r))
  const approved = allReviews.filter((r) => isVisible(r))

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
                : 'bg-stone-50 text-gray-700 border border-stone-200 hover:border-orange-300'
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
                : 'bg-stone-50 text-gray-700 border border-stone-200 hover:border-green-300'
            }`}
          >
            口コミ（公開中）
            <span className="ml-2 text-xs opacity-70">{approved.length}</span>
          </button>
          <button
            onClick={() => setTab('superseded')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'superseded'
                ? 'bg-gray-500 text-white'
                : 'bg-stone-50 text-gray-700 border border-stone-200 hover:border-gray-300'
            }`}
          >
            上書き済み
            {superseded.length > 0 && (
              <span className="ml-2 text-xs opacity-70">{superseded.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('salesperson')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'salesperson'
                ? 'bg-blue-500 text-white'
                : 'bg-stone-50 text-gray-700 border border-stone-200 hover:border-blue-300'
            }`}
          >
            営業マン申請
            {applications.filter((a) => a.status === 'pending').length > 0 && (
              <span className="ml-2 bg-white text-blue-500 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {applications.filter((a) => a.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('offers')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'offers'
                ? 'bg-teal-500 text-white'
                : 'bg-stone-50 text-gray-700 border border-stone-200 hover:border-teal-300'
            }`}
          >
            オファー
            {offers.filter((o) => o.status === 'new').length > 0 && (
              <span className="ml-2 bg-white text-teal-600 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {offers.filter((o) => o.status === 'new').length}
              </span>
            )}
          </button>
        </div>

        {/* 口コミ一覧（成約 + QR統合） */}
        {tab !== 'salesperson' && tab !== 'superseded' && (() => {
          const displayed = tab === 'pending' ? pending : approved
          const isProcessing = (r: any) =>
            r._type === 'qr' ? anonApprovingId === r.id : approvingId === r.id

          const handleToggle = (r: any) => {
            if (r._type === 'qr') {
              r.status === 'hidden' ? handleAnonShow(r.id) : handleAnonHide(r.id)
            } else {
              r.is_approved ? handleReject(r.id) : handleApprove(r.id)
            }
          }

          return displayed.length === 0 ? (
            <div className="text-center py-20 text-gray-600">
              <p className="text-3xl mb-3">✓</p>
              <p className="text-sm">{tab === 'pending' ? '非公開の口コミはありません' : '公開中の口コミはありません'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayed.map((r) => (
                <div key={`${r._type}-${r.id}`} className="bg-stone-50 rounded-2xl border border-stone-200 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-600 mb-0.5">営業マン</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {agentMap[r.salesperson_id] ?? r.salesperson_id}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {r._type === 'qr' && (
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">QR</span>
                      )}
                      <p className="text-xs text-gray-600">
                        {new Date(r.created_at).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {r.rating && (
                      <p className="text-sm text-amber-400">
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </p>
                    )}
                    {r.meeting_status && (
                      <p className="text-xs text-gray-700">📋 {r.meeting_status}</p>
                    )}
                    {r.contract_price && (
                      <p className="text-xs text-gray-700">
                        成約価格: {(r.contract_price / 10000).toLocaleString()}万円
                      </p>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{r.content}</p>
                  </div>

                  <div className="flex gap-2">
                    {(r._type === 'qr' ? r.status === 'hidden' : !r.is_approved) ? (
                      <button
                        onClick={() => handleToggle(r)}
                        disabled={isProcessing(r)}
                        className="flex-1 bg-green-500 hover:bg-green-400 disabled:bg-gray-200 disabled:text-gray-500 text-white font-bold py-2.5 rounded-xl transition text-sm"
                      >
                        {isProcessing(r) ? '処理中...' : '表示する'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggle(r)}
                        disabled={isProcessing(r)}
                        className="flex-1 bg-stone-200 hover:bg-stone-300 disabled:opacity-50 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm"
                      >
                        {isProcessing(r) ? '処理中...' : r._type === 'qr' ? '非表示にする' : '非公開にする'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* 上書き済み口コミ（管理者専用） */}
        {tab === 'superseded' && (
          superseded.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-3xl mb-3">📦</p>
              <p className="text-sm">上書き済みの口コミはありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-400 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2">
                新しい口コミに上書きされた旧バージョンです。データは保持されていますが、営業側・施主側には表示されません。
              </p>
              {superseded.map((r) => (
                <div key={`superseded-${r.id}`} className="bg-stone-50 rounded-2xl border border-stone-200 p-6 opacity-70">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-600 mb-0.5">営業マン</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {agentMap[r.salesperson_id] ?? r.salesperson_id}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">上書き済み</span>
                      {r.phase && (
                        <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{r.phase}</span>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(r.created_at).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {r.rating && (
                      <p className="text-sm text-amber-300">
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 leading-relaxed">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* 営業マン管理 */}
        {tab === 'salesperson' && (() => {
          const privateApps = applications.filter((a) => a.status === 'pending')
          const activeApps = applications.filter((a) => a.status === 'active')
          const otherApps = applications.filter((a) => ['rejected', 'suspended', 'banned', 'retired'].includes(a.status))

          const statusLabel: Record<string, string> = {
            pending: '非公開',
            active: '公開中',
            suspended: '一時停止',
            rejected: '審査否認',
            banned: 'BAN',
            retired: '退会',
          }
          const statusColor: Record<string, string> = {
            pending: 'bg-gray-100 text-gray-700',
            active: 'bg-green-100 text-green-600',
            suspended: 'bg-gray-100 text-gray-700',
            rejected: 'bg-red-100 text-red-500',
            banned: 'bg-red-200 text-red-700',
            retired: 'bg-stone-100 text-stone-600',
          }

          const renderCard = (a: any) => (
            <div key={a.id} className="bg-stone-50 rounded-2xl border border-stone-200 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{a.real_name}</p>
                  <p className="text-xs text-gray-700 mt-0.5">{a.company_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[a.status] ?? 'bg-stone-100 text-stone-600'}`}>
                    {statusLabel[a.status] ?? a.status}
                  </span>
                  <p className="text-xs text-gray-600">{new Date(a.created_at).toLocaleDateString('ja-JP')}</p>
                </div>
              </div>

              <div className="space-y-1 mb-4 text-xs text-gray-700">
                {a.area_prefecture && <p>📍 {a.area_prefecture}</p>}
                {a.experience_years && <p>🕐 経験 {a.experience_years}年</p>}
                {a.bio && <p className="text-sm text-gray-700 leading-relaxed mt-2 line-clamp-3">{a.bio}</p>}
              </div>

              {/* QRコード */}
              {a.status === 'active' && qrTokenMap[a.id] && (
                <div className="mb-4 p-4 bg-white rounded-xl border border-stone-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-gray-700">口コミ用QRコード</p>
                    <button
                      onClick={() => handleReissueQr(a.id)}
                      disabled={qrReissuingId === a.id}
                      className="text-xs text-red-400 hover:text-red-500 border border-red-200 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                    >
                      {qrReissuingId === a.id ? '再発行中...' : 'QR再発行'}
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <QRCodeSVG
                      value={`${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eigyo-no-tsuchihyo.vercel.app'}/review/${qrTokenMap[a.id]}`}
                      size={80}
                      bgColor="#ffffff"
                      fgColor="#1c1917"
                    />
                    <p className="text-xs text-gray-600 break-all">
                      {`/review/${qrTokenMap[a.id]}`}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {a.status === 'active' && (
                  <button
                    onClick={() => handleMakePrivate(a.id)}
                    disabled={processingAppId === a.id}
                    className="flex-1 bg-stone-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    {processingAppId === a.id ? '処理中...' : '非公開にする'}
                  </button>
                )}
                {a.status === 'pending' && (
                  <button
                    onClick={() => handleApproveApplication(a.id)}
                    disabled={processingAppId === a.id}
                    className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-200 disabled:text-gray-500 text-white font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    {processingAppId === a.id ? '処理中...' : '再公開'}
                  </button>
                )}
                <button
                  onClick={() => handleGenerateAiIntro(a.id)}
                  disabled={aiGeneratingId === a.id}
                  className="flex-1 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-200 disabled:text-gray-500 text-white font-bold py-2.5 rounded-xl transition text-sm"
                >
                  {aiGeneratingId === a.id ? 'AI生成中...' : a.ai_summary ? '✨ AI紹介文を再生成' : '✨ AI紹介文を生成'}
                </button>
              </div>

              {aiErrors[a.id] && (
                <p className="text-xs text-red-500 mt-2">{aiErrors[a.id]}</p>
              )}
              {(() => {
                const r = aiResults[a.id] ?? (a.ai_summary as { summary: string; goodMatch: string[]; communicationStyle: string; strengths: string[] } | null)
                if (!r) return null
                const isNew = !!aiResults[a.id]
                return (
                  <div className="mt-3 p-4 bg-purple-50 border border-purple-100 rounded-xl text-xs space-y-3">
                    <p className="font-bold text-purple-700">
                      AI紹介文{isNew ? '（生成完了）' : '（保存済み）'}
                    </p>
                    <div>
                      <p className="font-medium text-gray-700 mb-1">この営業マンの雰囲気</p>
                      <p className="text-gray-700 leading-relaxed">{r.summary}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700 mb-1">相性がよさそうな方</p>
                      <p className="text-gray-600">{r.goodMatch.join('、')}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700 mb-1">会話スタイル</p>
                      <p className="text-gray-600">{r.communicationStyle}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700 mb-1">得意なサポート</p>
                      <p className="text-gray-600">{r.strengths.join('、')}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          )

          return (
            <div className="space-y-6">
              {activeApps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-green-600 mb-3">公開中（{activeApps.length}件）</p>
                  <div className="space-y-4">{activeApps.map(renderCard)}</div>
                </div>
              )}
              {privateApps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-3">非公開（{privateApps.length}件）</p>
                  <div className="space-y-4">{privateApps.map(renderCard)}</div>
                </div>
              )}
              {otherApps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-3">その他（{otherApps.length}件）</p>
                  <div className="space-y-4">{otherApps.map(renderCard)}</div>
                </div>
              )}
              {applications.length === 0 && (
                <div className="text-center py-20 text-gray-600">
                  <p className="text-3xl mb-3">✓</p>
                  <p className="text-sm">営業マンの登録はありません</p>
                </div>
              )}
            </div>
          )
        })()}

        {/* オファー一覧 */}
        {tab === 'offers' && (
          offers.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-3xl mb-3">📬</p>
              <p className="text-sm">オファーはまだありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              {offers.map((o) => (
                <div key={o.id} className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">宛先営業マン</p>
                      <p className="text-sm font-semibold text-gray-800">{agentMap[o.salesperson_id] ?? o.salesperson_id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === 'new' ? 'bg-teal-100 text-teal-700' : 'bg-stone-100 text-stone-500'}`}>
                        {o.status === 'new' ? '新着' : o.status === 'done' ? '対応済み' : o.status}
                      </span>
                      <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('ja-JP')}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {o.area && <p className="text-xs text-gray-600">📍 検討エリア：{o.area}</p>}
                    {o.timing && <p className="text-xs text-gray-600">🕐 建築予定：{o.timing}</p>}
                    <div className="bg-white rounded-xl border border-stone-100 px-4 py-3 mt-2">
                      <p className="text-xs text-gray-400 mb-1">相談内容</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{o.message}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-stone-100 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-1">連絡先</p>
                      <p className="text-sm text-gray-700">{o.contact_name}　{o.contact_email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  )
}
