'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'
import { QRCodeSVG } from 'qrcode.react'

const ADMIN_EMAILS = ['reimagining.home.lab@gmail.com', '1989yo55@gmail.com']

const SALESPERSON_COLUMNS = 'id, real_name, family_name, given_name, company_name, area_prefecture, experience_years, bio, status, is_visible, is_verified, ai_summary, qr_token, created_at'

// 管理者が行える営業の状態遷移（これ以外の遷移は画面から行わない）
const STATUS_TRANSITIONS = {
  approve: { from: 'pending', to: 'active', label: '承認' },
  hide: { from: 'active', to: 'admin_hidden', label: '非公開' },
  republish: { from: 'admin_hidden', to: 'active', label: '再公開' },
} as const
type StatusAction = keyof typeof STATUS_TRANSITIONS

type SalespersonCategory = 'pending' | 'public' | 'selfHidden' | 'adminHidden' | 'other'
type SalespersonState = { status?: string | null; is_visible?: boolean | null }

// どの営業も必ずいずれか1区分に入る（判定できないものは other）
const classifySalesperson = (a: SalespersonState): SalespersonCategory => {
  if (a.status === 'pending') return 'pending'
  if (a.status === 'active' && a.is_visible === true) return 'public'
  if (a.status === 'active' && a.is_visible === false) return 'selfHidden'
  if (a.status === 'admin_hidden') return 'adminHidden'
  return 'other'
}

type StatusNotice = { type: 'success' | 'error' | 'warning'; message: string }

const STALE_CARD_MESSAGE = 'このカードの表示は古い可能性があります。ページを再読み込みしてください。'

// 営業一覧を取得する。例外も含めて失敗は error 文言で返し、他のデータ取得を止めない
const fetchApplications = async () => {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('salesperson_profiles')
      .select(SALESPERSON_COLUMNS)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[admin] salesperson_profiles load error', { code: error.code, message: error.message })
      return { data: null, error: `営業マン一覧の読み込みに失敗しました（${error.code || 'unknown'}）。` }
    }
    return { data: data ?? [], error: null }
  } catch (e) {
    console.error('[admin] salesperson_profiles load exception', e)
    return { data: null, error: '営業マン一覧の読み込み中にエラーが発生しました。' }
  }
}

const HIDE_CONFIRM_MESSAGE = [
  'この営業マンを管理者非公開にしますか？',
  '',
  '・検索結果・詳細ページに表示されなくなります',
  '・QRコード経由の口コミ投稿ができなくなります',
  '・「再公開」で公開状態に戻せます',
].join('\n')

/*
 * TODO: BtoBデータ出力機能を将来実装する際の制限ポリシー
 *
 * 禁止:
 *   - 個別口コミ本文の原文CSV出力
 *   - 単一 review_id に紐づくローデータ提供
 *   - 投稿者属性と本文の直接セット提供
 *   - 住宅会社による投稿者の特定・再識別・照合・個別接触につながる粒度の出力
 *
 * 集計最小値:
 *   - 単一条件: 5件未満は非表示
 *   - 複合条件 (地域+会社+時期+担当者+予算帯など): 10件未満は非表示
 *
 * 提供単位:
 *   - 初期BtoB提供は担当者単位ではなく、会社・支店・エリア単位の傾向に留める
 *
 * 提供目的:
 *   - 営業改善、教育、顧客対応品質向上、組織改善に限定
 *   - 人事評価・懲戒・報復・個別責任追及を主目的とする利用を想定しない
 *
 * 実装時は review_consents テーブルの同意バージョンと目的を照合すること
 */

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<any[]>([])
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'superseded' | 'salesperson' | 'offers'>('pending')
  const [applications, setApplications] = useState<any[]>([])
  const [applicationsLoadError, setApplicationsLoadError] = useState<string | null>(null)
  const [applicationsRetrying, setApplicationsRetrying] = useState(false)
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Record<string, boolean>>({})
  const [statusNotices, setStatusNotices] = useState<Record<string, StatusNotice>>({})
  // 再取得に失敗し、表示が古い可能性があるカード（最新行を取得できるまで状態変更を禁止する）
  const [staleIds, setStaleIds] = useState<Record<string, boolean>>({})
  // 状態変更・再取得の進行中ロック。state は再描画まで反映されないため、重複判定は ref で同期的に行う
  const statusLockRef = useRef<Set<string>>(new Set())
  const [offers, setOffers] = useState<any[]>([])
  const [aiGeneratingId, setAiGeneratingId] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<Record<string, { summary: string; goodMatch: string[]; communicationStyle: string; strengths: string[]; caution: string }>>({})
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({})
  const [anonReviews, setAnonReviews] = useState<any[]>([])
  const [anonApprovingId, setAnonApprovingId] = useState<string | null>(null)
  const [qrReissuingId, setQrReissuingId] = useState<string | null>(null)
  const [qrTokenMap, setQrTokenMap] = useState<Record<string, string>>({})

  const applyApplications = (appData: typeof applications) => {
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

  const handleRetryApplications = async () => {
    if (applicationsRetrying) return
    setApplicationsRetrying(true)
    const result = await fetchApplications()
    if (result.data) {
      applyApplications(result.data)
      setApplicationsLoadError(null)
      // 一覧全体を取り直したので、表示が古い可能性のあったカードの操作制限を解除する
      const staleKeys = Object.keys(staleIds)
      setStaleIds({})
      setStatusNotices((prev) => { const next = { ...prev }; staleKeys.forEach((k) => delete next[k]); return next })
    } else {
      setApplicationsLoadError(result.error)
    }
    setApplicationsRetrying(false)
  }

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
        router.replace('/')
        return
      }
      const [{ data: reviewData }, { data: agentData }, applicationsResult, { data: anonData }, { data: offerData }] = await Promise.all([
        supabase
          .from('contract_reviews')
          .select('id, salesperson_id, user_id, rating, content, meeting_status, contract_price, is_approved, first_approved_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('safe_salesperson_profiles')
          .select('id, company_name'),
        fetchApplications(),
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
      if (applicationsResult.error) setApplicationsLoadError(applicationsResult.error)
      if (applicationsResult.data) applyApplications(applicationsResult.data)
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

  // DB から最新行を取得して一覧に反映する。取得できた場合のみ true
  const refetchApplication = async (appId: string): Promise<boolean> => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('salesperson_profiles')
        .select(SALESPERSON_COLUMNS)
        .eq('id', appId)
        .maybeSingle()
      if (error) {
        console.error('[admin] salesperson_profiles refetch error', { code: error.code, message: error.message })
        return false
      }
      if (!data) return false
      setApplications((prev) => prev.map((a) => a.id === appId ? data : a))
      return true
    } catch (e) {
      console.error('[admin] salesperson_profiles refetch exception', e)
      return false
    }
  }

  const lockStatus = (appId: string) => {
    statusLockRef.current.add(appId)
    setStatusUpdatingIds((prev) => ({ ...prev, [appId]: true }))
  }

  const unlockStatus = (appId: string) => {
    statusLockRef.current.delete(appId)
    setStatusUpdatingIds((prev) => { const next = { ...prev }; delete next[appId]; return next })
  }

  const handleChangeStatus = async (appId: string, action: StatusAction) => {
    // 同じ営業の処理が進行中、または表示が古い可能性がある間は受け付けない。異なる営業の操作は妨げない
    if (statusLockRef.current.has(appId) || staleIds[appId]) return
    const transition = STATUS_TRANSITIONS[action]
    if (action === 'hide' && !confirm(HIDE_CONFIRM_MESSAGE)) return
    if (statusLockRef.current.has(appId)) return

    lockStatus(appId)
    setStatusNotices((prev) => { const next = { ...prev }; delete next[appId]; return next })

    try {
      // applied: 更新を確認 / rejected: 更新されていない / unknown: 通信エラー等で反映されたか不明
      let outcome: 'applied' | 'rejected' | 'unknown'
      let message: string
      try {
        const supabase = createClient()
        // 変更前 status も条件に含め、他の操作で状態が変わっていた場合は更新しない
        const { data, error, status } = await supabase
          .from('salesperson_profiles')
          .update({ status: transition.to })
          .eq('id', appId)
          .eq('status', transition.from)
          .select('id, status, is_visible')
          .maybeSingle()

        if (error) {
          console.error('[admin] salesperson status update error', { status, code: error.code, message: error.message })
          if (status === 0 || status >= 502) {
            // 応答なし・ゲートウェイエラーは DB に届いたか判断できない
            outcome = 'unknown'
            message = `通信エラーのため、${transition.label}が反映されたか確認できませんでした。`
          } else {
            outcome = 'rejected'
            message = error.code === '42501'
              ? `${transition.label}できませんでした。この操作の権限がありません。`
              : `${transition.label}に失敗しました（${error.code || 'unknown'}）。`
          }
        } else if (!data || data.status !== transition.to) {
          // 0件: 権限（RLS）による除外か、他の操作による状態変更のどちらかで、画面からは区別できない
          outcome = 'rejected'
          message = `${transition.label}を確認できませんでした。権限がないか、他の操作で状態が変更された可能性があります。`
        } else {
          outcome = 'applied'
          message = data.status === 'active' && data.is_visible === false
            ? `${transition.label}しました。本人が非公開に設定しているため、検索には表示されません。`
            : `${transition.label}しました。`
        }
      } catch {
        outcome = 'unknown'
        message = `通信エラーのため、${transition.label}が反映されたか確認できませんでした。`
      }

      const refetched = await refetchApplication(appId)
      let notice: StatusNotice
      if (refetched) {
        notice = outcome === 'applied'
          ? { type: 'success', message }
          : outcome === 'rejected'
            ? { type: 'error', message: `${message} 最新の状態を表示しています。` }
            : { type: 'warning', message: `${message} 最新の状態を表示しています。結果はカードの表示で確認してください。` }
      } else {
        setStaleIds((prev) => ({ ...prev, [appId]: true }))
        notice = outcome === 'applied'
          ? { type: 'warning', message: `DBの更新結果を確認しましたが、最新の表示を取得できませんでした。${STALE_CARD_MESSAGE}` }
          : { type: outcome === 'rejected' ? 'error' : 'warning', message: `${message} 最新の表示を取得できませんでした。${STALE_CARD_MESSAGE}` }
      }
      setStatusNotices((prev) => ({ ...prev, [appId]: notice }))
    } finally {
      unlockStatus(appId)
    }
  }

  // 表示が古い可能性のあるカードを再取得する。取得できれば状態変更の禁止を解除する
  const handleRefetchCard = async (appId: string) => {
    if (statusLockRef.current.has(appId)) return
    lockStatus(appId)
    try {
      const refetched = await refetchApplication(appId)
      if (refetched) {
        setStaleIds((prev) => { const next = { ...prev }; delete next[appId]; return next })
        setStatusNotices((prev) => ({ ...prev, [appId]: { type: 'success', message: '最新の状態を取得しました。' } }))
      } else {
        setStatusNotices((prev) => ({ ...prev, [appId]: { type: 'warning', message: `最新の表示を取得できませんでした。${STALE_CARD_MESSAGE}` } }))
      }
    } finally {
      unlockStatus(appId)
    }
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
            担当者管理
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

        {/* 担当者管理 */}
        {tab === 'salesperson' && (() => {
          const groups: { key: SalespersonCategory; title: string; titleColor: string; apps: typeof applications }[] = [
            { key: 'pending', title: '承認待ち', titleColor: 'text-blue-600', apps: [] },
            { key: 'public', title: '公開中', titleColor: 'text-green-600', apps: [] },
            { key: 'selfHidden', title: '本人非公開', titleColor: 'text-gray-700', apps: [] },
            { key: 'adminHidden', title: '管理者非公開', titleColor: 'text-orange-600', apps: [] },
            { key: 'other', title: 'その他', titleColor: 'text-gray-600', apps: [] },
          ]
          applications.forEach((a) => {
            groups.find((g) => g.key === classifySalesperson(a))!.apps.push(a)
          })

          // その他区分に入る status の表示名（未知の値はそのまま表示）
          const otherStatusLabel: Record<string, string> = {
            suspended: '一時停止',
            rejected: '審査否認',
            banned: 'BAN',
            retired: '退会',
          }
          const categoryBadge: Record<SalespersonCategory, { label: string; color: string }> = {
            pending: { label: '承認待ち', color: 'bg-blue-100 text-blue-600' },
            public: { label: '公開中', color: 'bg-green-100 text-green-600' },
            selfHidden: { label: '本人非公開', color: 'bg-gray-100 text-gray-700' },
            adminHidden: { label: '管理者非公開', color: 'bg-orange-100 text-orange-600' },
            other: { label: '', color: 'bg-stone-100 text-stone-600' },
          }
          const badgeFor = (a: SalespersonState) => {
            const category = classifySalesperson(a)
            if (category !== 'other') return categoryBadge[category]
            const label = a.status
              ? (otherStatusLabel[a.status] ?? a.status)
              : '不明'
            return { label: a.status === 'active' ? '表示設定不明' : label, color: categoryBadge.other.color }
          }

          const renderCard = (a: any) => {
            const badge = badgeFor(a)
            const isUpdating = !!statusUpdatingIds[a.id]
            const isStale = !!staleIds[a.id]
            const statusDisabled = isUpdating || isStale
            const notice = statusNotices[a.id]
            const statusAction: StatusAction | null =
              a.status === 'pending' ? 'approve'
              : a.status === 'active' ? 'hide'
              : a.status === 'admin_hidden' ? 'republish'
              : null
            return (
            <div key={a.id} className="bg-stone-50 rounded-2xl border border-stone-200 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{a.real_name}</p>
                  <p className="text-xs text-gray-700 mt-0.5">{a.company_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_verified ? 'bg-teal-50 text-teal-700' : 'bg-stone-100 text-stone-500'}`}>
                    {a.is_verified ? '認証済み' : '未認証'}
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
                {statusAction === 'hide' && (
                  <button
                    onClick={() => handleChangeStatus(a.id, 'hide')}
                    disabled={statusDisabled}
                    className="flex-1 bg-stone-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    {isUpdating ? '処理中...' : '非公開にする'}
                  </button>
                )}
                {(statusAction === 'approve' || statusAction === 'republish') && (
                  <button
                    onClick={() => handleChangeStatus(a.id, statusAction)}
                    disabled={statusDisabled}
                    className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-200 disabled:text-gray-500 text-white font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    {isUpdating ? '処理中...' : statusAction === 'approve' ? '承認' : '再公開'}
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

              {notice && (
                <p className={`text-xs mt-2 ${notice.type === 'success' ? 'text-green-600' : notice.type === 'warning' ? 'text-amber-600' : 'text-red-500'}`}>
                  {notice.message}
                </p>
              )}
              {isStale && (
                <button
                  onClick={() => handleRefetchCard(a.id)}
                  disabled={isUpdating}
                  className="mt-2 text-xs text-amber-700 border border-amber-300 px-2.5 py-1 rounded-lg transition hover:bg-amber-50 disabled:opacity-50"
                >
                  {isUpdating ? '取得中...' : '最新の状態を再取得'}
                </button>
              )}
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
          }

          if (applicationsLoadError) {
            return (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 space-y-3">
                <p className="text-sm font-semibold text-red-600">{applicationsLoadError}</p>
                <button
                  onClick={handleRetryApplications}
                  disabled={applicationsRetrying}
                  className="text-xs text-red-600 border border-red-300 px-3 py-1.5 rounded-lg transition hover:bg-red-100 disabled:opacity-50"
                >
                  {applicationsRetrying ? '再試行中...' : '再試行'}
                </button>
              </div>
            )
          }

          return (
            <div className="space-y-6">
              {applications.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {groups.map((g) => (
                    <span key={g.key} className="text-xs bg-stone-50 border border-stone-200 px-3 py-1 rounded-full text-gray-700">
                      {g.title} <span className="font-bold">{g.apps.length}</span>
                    </span>
                  ))}
                </div>
              )}
              {groups.filter((g) => g.apps.length > 0).map((g) => (
                <div key={g.key}>
                  <p className={`text-xs font-bold mb-3 ${g.titleColor}`}>{g.title}（{g.apps.length}件）</p>
                  <div className="space-y-4">{g.apps.map(renderCard)}</div>
                </div>
              ))}
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
