'use client'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

const SALES_STYLE_AXES = [
  { key: 'listening_proposing', left: '傾聴型', right: '提案型', label: '相談の進め方' },
  { key: 'numbers_feeling', left: '数字で説明', right: '感覚で説明', label: '説明の傾向' },
] as const

const PHASE_LABELS: Record<string, string> = {
  pre_contract: '契約前',
  post_contract: '契約後',
  after_start: '着工後',
  after_handover: '引渡後',
}

// レビュー本文から多い声キーワードを抽出
const KEYWORD_PATTERNS = [
  { label: '説明がわかりやすい', re: /わかりやす|説明.*丁寧|丁寧.*説明/ },
  { label: '話をよく聞いてくれる', re: /聞いてくれ|ヒアリング|話を聞/ },
  { label: '押しつけ感が少ない', re: /押しつけ|無理に|強引|押し付け/ },
  { label: '返信が早い', re: /返信.*早|連絡.*早|レスポンス.*早|早い.*返信/ },
  { label: '比較しやすい提案', re: /比較|選択肢|複数の候補|他社との/ },
  { label: '引渡し後も相談しやすい', re: /引渡|アフター|入居後|竣工後/ },
  { label: '安心して任せられる', re: /安心|信頼|頼れる|任せ/ },
  { label: '提案が丁寧', re: /提案.*丁寧|丁寧.*提案|細かく提案/ },
]

function extractKeywords(reviews: { content: string }[]): string[] {
  if (reviews.length === 0) return []
  const allText = reviews.map((r) => r.content).join(' ')
  return KEYWORD_PATTERNS
    .filter(({ re }) => re.test(allText))
    .map(({ label }) => label)
    .slice(0, 5)
}

type AISummary = {
  summary?: string
  goodMatch?: string[]
  communicationStyle?: string
  strengths?: string[]
}

function formatMatchCopy(text: string): string {
  if (!text) return text
  if (text.endsWith('方')) return `${text}へ`
  return text
}

function DetailPanel({
  agent,
  unlockedData,
  reviews,
  reviewsLoading,
}: {
  agent: any
  unlockedData: any | null
  reviews: any[]
  reviewsLoading: boolean
}) {
  const ai = (agent.ai_summary ?? null) as AISummary | null
  const salesStyles = (agent.sales_styles ?? {}) as Record<string, number>

  const displayName = unlockedData
    ? (unlockedData.family_name && unlockedData.given_name
        ? `${unlockedData.family_name} ${unlockedData.given_name}`
        : unlockedData.real_name ?? '---')
    : (agent.name_initials ? `${agent.name_initials} さん` : '---')

  const consultationThemes: string[] =
    (agent.specialties ?? []).length > 0 ? agent.specialties : (ai?.strengths ?? [])

  const matchCopy = ai?.goodMatch?.[0] ? formatMatchCopy(ai.goodMatch[0]) : null

  const hasSourceInfo =
    (agent.specialty_styles ?? []).length > 0 ||
    SALES_STYLE_AXES.some(({ key }) => salesStyles[key] !== undefined)

  const reviewKeywords = extractKeywords(reviews)

  const mostRecentDate = reviews[0]
    ? new Date(reviews[0].created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })
    : null

  return (
    <div className="space-y-4 pr-1">

      {/* 1. 基本情報＋相性コピー＋補足文 */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shrink-0">
            {unlockedData && agent.profile_image_url
              ? <img src={agent.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-4xl">👤</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">{agent.company_name}</p>
            <p className="text-xl font-bold text-gray-800">{displayName}</p>
            {agent.area_prefecture && (
              <p className="text-sm text-gray-500 mt-1">📍 {agent.area_prefecture}</p>
            )}
            {(agent.available_prefectures ?? []).length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                対応：{(agent.available_prefectures as string[]).join('・')}
              </p>
            )}
          </div>
        </div>

        {(matchCopy || ai?.communicationStyle) && (
          <div className="mt-5 pt-4 border-t border-stone-100">
            {matchCopy && (
              <p className="text-sm font-semibold text-gray-700 mb-2 leading-snug">{matchCopy}</p>
            )}
            {ai?.communicationStyle && (
              <p className="text-sm text-gray-600 leading-relaxed">{ai.communicationStyle}</p>
            )}
          </div>
        )}

        {((agent.specialty_styles ?? []).length > 0 || (agent.qualifications ?? []).length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {(agent.specialty_styles as string[] ?? []).map((s) => (
              <span key={s} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-1 rounded-full">
                {s}
              </span>
            ))}
            {(agent.qualifications as string[] ?? []).map((q) => (
              <span key={q} className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">
                {q}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2. AI紹介文 */}
      {ai?.summary && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-500 text-sm">✨</span>
            <p className="text-sm font-bold text-gray-700">AI紹介文</p>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{ai.summary}</p>
          <p className="text-xs text-gray-300 mt-3">※ プロフィール情報をもとにAIが生成した紹介文です</p>
        </div>
      )}

      {/* 3. この方はこんな方に合いそう（控えめ） */}
      {ai?.goodMatch && ai.goodMatch.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
          <p className="text-xs font-bold text-amber-700 mb-2">この方はこんな方に合いそう</p>
          <ul className="space-y-1">
            {ai.goodMatch.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-800 leading-relaxed">
                <span className="text-amber-400 shrink-0 mt-0.5">・</span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. 相談しやすいテーマ */}
      {consultationThemes.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <p className="text-sm font-bold text-gray-700 mb-3">相談しやすいテーマ</p>
          <div className="flex flex-wrap gap-2">
            {consultationThemes.map((theme, i) => (
              <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-100 px-3 py-1.5 rounded-xl">
                {theme}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 5. 口コミ・お客様の声（星評価なし） */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        {/* ヘッダー：件数＋直近時期 */}
        <div className="flex items-baseline gap-3 mb-4">
          <p className="text-sm font-bold text-gray-700">口コミ・お客様の声</p>
          {!reviewsLoading && reviews.length > 0 && (
            <span className="text-xs text-gray-400">{reviews.length}件</span>
          )}
          {mostRecentDate && (
            <span className="text-xs text-gray-400 ml-auto">直近：{mostRecentDate}</span>
          )}
        </div>

        {reviewsLoading ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-gray-400">まだ口コミはありません</p>
        ) : (
          <>
            {/* 口コミで多い声 */}
            {reviewKeywords.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-2">口コミで多い声</p>
                <div className="flex flex-wrap gap-1.5">
                  {reviewKeywords.map((k, i) => (
                    <span key={i} className="text-xs bg-stone-100 text-gray-600 px-2.5 py-1 rounded-full">
                      · {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 代表的な口コミ本文（フェーズラベル付き、星なし） */}
            <div className="space-y-3">
              {reviews.slice(0, 4).map((r) => (
                <div key={r.id} className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                  {r.phase && PHASE_LABELS[r.phase] && (
                    <span className="inline-block text-xs text-stone-500 border border-stone-200 bg-white px-2 py-0.5 rounded-full mb-2">
                      {PHASE_LABELS[r.phase]}
                    </span>
                  )}
                  <p className="text-sm text-gray-700 leading-relaxed">「{r.content}」</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 6. 根拠情報 */}
      {hasSourceInfo && (
        <div className="bg-stone-50 rounded-2xl border border-stone-100 p-5">
          <p className="text-xs font-bold text-gray-400 mb-3">この紹介文のもとになった情報</p>
          <div className="space-y-2">
            {SALES_STYLE_AXES.map(({ key, left, right, label }) => {
              const val = salesStyles[key]
              if (val === undefined) return null
              return (
                <div key={key} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-400 shrink-0 w-24">{label}：</span>
                  <span>{Number(val) <= 3 ? left : right}</span>
                </div>
              )
            })}
            {(agent.specialty_styles ?? []).length > 0 && (
              <div className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-gray-400 shrink-0 w-24">得意分野：</span>
                <span>{(agent.specialty_styles as string[]).join(' / ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. CTA（ソフトな白背景） */}
      <div className="bg-green-50 rounded-2xl border border-green-100 p-6">
        <p className="text-sm font-semibold text-gray-700 mb-1">
          {displayName}に相談してみる
        </p>
        <p className="text-xs text-gray-500 mb-4">
          口コミ詳細・実名はオファー後にご確認いただけます
        </p>
        <Link
          href={`/salesperson/${agent.id}`}
          className="block w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3.5 rounded-xl transition text-center text-sm"
        >
          詳細を見る・オファーする
        </Link>
      </div>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [agents, setAgents] = useState<any[]>([])
  const [unlockedMap, setUnlockedMap] = useState<Record<string, any>>({})
  const [keyword, setKeyword] = useState('')
  const [filterPrefecture, setFilterPrefecture] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterQualification, setFilterQualification] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedReviews, setSelectedReviews] = useState<any[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const fetchReviewsForAgent = useCallback(async (agentId: string) => {
    setReviewsLoading(true)
    setSelectedReviews([])
    const supabase = createClient()
    const { data } = await supabase
      .from('anonymous_reviews')
      .select('id, content, phase, created_at')
      .eq('salesperson_id', agentId)
      .eq('status', 'visible')
      .order('created_at', { ascending: false })
      .limit(6)
    setSelectedReviews(data ?? [])
    setReviewsLoading(false)
  }, [])

  const handleSelectAgent = useCallback((agentId: string) => {
    if (selectedIdRef.current === agentId) return
    setDetailVisible(false)
    setTimeout(() => {
      setSelectedId(agentId)
      fetchReviewsForAgent(agentId)
      setDetailVisible(true)
    }, 150)
  }, [fetchReviewsForAgent])

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      window.location.href = '/auth/reset' + window.location.hash
      return
    }
    if (window.location.hash.includes('type=signup')) {
      window.location.href = '/salesperson/register' + window.location.hash
      return
    }

    const supabase = createClient()
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: ownProfile } = await supabase
          .from('salesperson_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (ownProfile) {
          router.replace('/salesperson/dashboard')
          return
        }
      }

      const { data: publicData } = await supabase.from('safe_salesperson_profiles').select('*')
      if (publicData) {
        setAgents(publicData)
        if (publicData.length > 0) {
          const firstId = publicData[0].id
          setSelectedId(firstId)
          setDetailVisible(true)
          fetchReviewsForAgent(firstId)
        }
      }

      if (user) {
        const { data: unlocked } = await supabase
          .from('salesperson_profiles')
          .select('id, real_name, family_name, given_name')
        if (unlocked) {
          const map: Record<string, any> = {}
          unlocked.forEach((u) => { map[u.id] = u })
          setUnlockedMap(map)
        }
      }

      setChecking(false)
    }

    load()
  }, [])

  const prefectures = useMemo(() =>
    [...new Set(agents.map((a) => a.area_prefecture).filter(Boolean))].sort()
  , [agents])

  const specialties = useMemo(() =>
    [...new Set(agents.flatMap((a) => a.specialty_styles ?? []))].sort()
  , [agents])

  const qualifications = useMemo(() =>
    [...new Set(agents.flatMap((a) => a.qualifications ?? []))].sort()
  , [agents])

  const filteredAgents = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return agents.filter((a) => {
      if (kw) {
        const name = (unlockedMap[a.id]?.real_name ?? '').toLowerCase()
        const company = (a.company_name ?? '').toLowerCase()
        if (!name.includes(kw) && !company.includes(kw)) return false
      }
      if (filterPrefecture && a.area_prefecture !== filterPrefecture) return false
      if (filterSpecialty && !(a.specialty_styles ?? []).includes(filterSpecialty)) return false
      if (filterQualification && !(a.qualifications ?? []).includes(filterQualification)) return false
      return true
    })
  }, [agents, unlockedMap, keyword, filterPrefecture, filterSpecialty, filterQualification])

  useEffect(() => {
    if (checking || agents.length === 0) return
    if (filteredAgents.length === 0) {
      setSelectedId(null)
      setSelectedReviews([])
      setDetailVisible(false)
      return
    }
    const stillValid = filteredAgents.find((a) => a.id === selectedIdRef.current)
    if (!stillValid) {
      const firstId = filteredAgents[0].id
      setSelectedId(firstId)
      fetchReviewsForAgent(firstId)
      setDetailVisible(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAgents, checking])

  if (checking) return <div className="min-h-screen bg-stone-50" />

  const selectedAgent = selectedId ? (agents.find((a) => a.id === selectedId) ?? null) : null

  // 右パネルstickyヘッダー用のdisplayName
  const stickyDisplayName = selectedAgent
    ? (unlockedMap[selectedAgent.id]
        ? (unlockedMap[selectedAgent.id].real_name ?? (selectedAgent.name_initials ? `${selectedAgent.name_initials} さん` : '---'))
        : (selectedAgent.name_initials ? `${selectedAgent.name_initials} さん` : '---'))
    : ''

  return (
    <main className="min-h-screen bg-stone-50">
      <Header />

      {/* Hero */}
      <div className="bg-gray-900 px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-1.5">
            誠実な営業マンを、<br className="sm:hidden" />あなたが選ぶ。
          </h2>
          <p className="text-gray-400 text-sm">
            住宅営業マンのリアルな評価を確認して、信頼できる一人に指名しよう。
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6">
        {/* フィルター */}
        <div className="py-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="会社名で検索"
              className="w-full text-sm border border-stone-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-200 bg-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={filterPrefecture}
                onChange={(e) => setFilterPrefecture(e.target.value)}
                className="text-sm border border-stone-200 rounded-xl px-3 py-2 focus:outline-none bg-white text-gray-600"
              >
                <option value="">エリア（すべて）</option>
                {prefectures.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterSpecialty}
                onChange={(e) => setFilterSpecialty(e.target.value)}
                className="text-sm border border-stone-200 rounded-xl px-3 py-2 focus:outline-none bg-white text-gray-600"
              >
                <option value="">得意分野（すべて）</option>
                {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterQualification}
                onChange={(e) => setFilterQualification(e.target.value)}
                className="text-sm border border-stone-200 rounded-xl px-3 py-2 focus:outline-none bg-white text-gray-600"
              >
                <option value="">資格（すべて）</option>
                {qualifications.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            {(keyword || filterPrefecture || filterSpecialty || filterQualification) && (
              <button
                onClick={() => { setKeyword(''); setFilterPrefecture(''); setFilterSpecialty(''); setFilterQualification('') }}
                className="text-xs text-green-600 hover:text-green-500 transition"
              >
                × 絞り込みをリセット
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2 px-1">
            {filteredAgents.length}人の営業マンが見つかりました
            {filteredAgents.length !== agents.length && (
              <span className="ml-1">（全{agents.length}人中）</span>
            )}
          </p>
        </div>

        {/* PC: マスター・詳細レイアウト */}
        <div className="hidden md:flex gap-5 h-[calc(100vh-340px)] min-h-[500px] pb-6">

          {/* 左：カード一覧（42%） */}
          <div className="w-[42%] overflow-y-auto space-y-2.5 slim-scroll">
            {filteredAgents.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-4">👤</p>
                <p className="text-sm">
                  {agents.length === 0 ? '現在登録中の営業マンはいません' : '条件に一致する営業マンが見つかりません'}
                </p>
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const isSelected = selectedId === agent.id
                const unlocked = !!unlockedMap[agent.id]
                const ai = (agent.ai_summary ?? null) as AISummary | null
                const displayName = unlocked
                  ? (unlockedMap[agent.id]?.real_name ?? (agent.name_initials ? `${agent.name_initials} さん` : '---'))
                  : (agent.name_initials ? `${agent.name_initials} さん` : '---')
                const themes: string[] = (agent.specialties ?? []).slice(0, 3)
                const matchCopy = ai?.goodMatch?.[0] ? formatMatchCopy(ai.goodMatch[0]) : null
                const supplementary = ai?.communicationStyle ?? null

                return (
                  <button
                    key={agent.id}
                    onClick={() => handleSelectAgent(agent.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-all duration-200 ${
                      isSelected
                        ? 'bg-green-50 border-green-200 shadow-sm'
                        : 'bg-white border-stone-200 hover:border-green-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shrink-0">
                        {unlocked && agent.profile_image_url
                          ? <img src={agent.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-xl">👤</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 truncate">{agent.company_name}</p>
                        <p className="text-sm font-bold text-gray-800 truncate">{displayName}</p>
                        {agent.area_prefecture && (
                          <p className="text-xs text-gray-500">📍 {agent.area_prefecture}</p>
                        )}
                      </div>
                      {isSelected && (
                        <span className="text-green-400 shrink-0 mt-0.5 text-sm">✓</span>
                      )}
                    </div>

                    {matchCopy && (
                      <p className={`text-xs font-semibold mt-3 leading-snug ${
                        isSelected ? 'text-green-700' : 'text-gray-700'
                      }`}>
                        {matchCopy}
                      </p>
                    )}

                    {supplementary && (
                      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">
                        {supplementary}
                      </p>
                    )}

                    {themes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {themes.map((t) => (
                          <span
                            key={t}
                            className={`text-xs px-2 py-0.5 rounded-full border ${
                              isSelected
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : 'bg-stone-50 text-gray-500 border-stone-100'
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* 右：詳細パネル（58%）—— stickyヘッダーはアニメラッパーの外に置く */}
          <div className="flex-1 overflow-y-auto slim-scroll">
            {selectedAgent ? (
              <>
                {/* Sticky mini-header（スクロール中も「誰の詳細か」を表示） */}
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-stone-100 px-4 py-2.5 -mx-0 flex items-center justify-between mb-3 rounded-t-2xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shrink-0">
                      {unlockedMap[selectedAgent.id] && selectedAgent.profile_image_url
                        ? <img src={selectedAgent.profile_image_url} alt="" className="w-full h-full object-cover" />
                        : <span className="text-sm">👤</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 truncate leading-none">{selectedAgent.company_name}</p>
                      <p className="text-sm font-bold text-gray-800 truncate leading-snug">{stickyDisplayName}</p>
                    </div>
                  </div>
                  <Link
                    href={`/salesperson/${selectedAgent.id}`}
                    className="shrink-0 text-xs bg-orange-500 hover:bg-orange-400 text-white font-bold px-3 py-1.5 rounded-lg transition ml-3"
                  >
                    詳細・相談する
                  </Link>
                </div>

                {/* アニメーション付きコンテンツ */}
                <div
                  style={{
                    opacity: detailVisible ? 1 : 0,
                    transform: detailVisible ? 'translateY(0px)' : 'translateY(8px)',
                    transition: 'opacity 200ms ease, transform 200ms ease',
                  }}
                >
                  <DetailPanel
                    agent={selectedAgent}
                    unlockedData={unlockedMap[selectedAgent.id] ?? null}
                    reviews={selectedReviews}
                    reviewsLoading={reviewsLoading}
                  />
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <p className="text-sm">左から営業マンを選んでください</p>
              </div>
            )}
          </div>
        </div>

        {/* モバイル：カード一覧 */}
        <div className="md:hidden pt-2 space-y-4 pb-8">
          {filteredAgents.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-4">👤</p>
              <p className="text-sm">
                {agents.length === 0 ? '現在登録中の営業マンはいません' : '条件に一致する営業マンが見つかりません'}
              </p>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const unlocked = !!unlockedMap[agent.id]
              const ai = (agent.ai_summary ?? null) as AISummary | null
              const matchCopy = ai?.goodMatch?.[0] ? formatMatchCopy(ai.goodMatch[0]) : null
              return (
                <Link key={agent.id} href={`/salesperson/${agent.id}`}>
                  <div className="bg-white rounded-2xl border border-stone-200 p-5 hover:shadow-sm transition-shadow">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shrink-0">
                        {unlocked && agent.profile_image_url
                          ? <img src={agent.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-2xl">👤</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{agent.company_name}</p>
                        <p className="text-base font-bold text-gray-800">
                          {unlocked
                            ? (unlockedMap[agent.id]?.real_name ?? '---')
                            : (agent.name_initials ? `${agent.name_initials} さん` : '---')}
                        </p>
                        {agent.area_prefecture && (
                          <p className="text-xs text-gray-500">📍 {agent.area_prefecture}</p>
                        )}
                      </div>
                    </div>
                    {matchCopy && (
                      <p className="text-sm font-semibold text-gray-700 mb-1.5">{matchCopy}</p>
                    )}
                    {ai?.communicationStyle && (
                      <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                        {ai.communicationStyle}
                      </p>
                    )}
                    {(agent.specialties ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(agent.specialties as string[]).slice(0, 3).map((s) => (
                          <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}
