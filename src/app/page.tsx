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

type AiMatchResult = {
  agent_id: string
  score: number
  match_reason: string
}

function formatMatchCopy(text: string): string {
  if (!text) return text
  if (text.endsWith('方')) return `${text}へ`
  return text
}

// ===== ログインゲートモーダル =====
function LoginGateModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-teal-500">🔒</span>
          <h3 className="text-base font-bold text-gray-800">ログインが必要です</h3>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-2">
          名前・顔写真・連絡先など、営業個人が特定できる情報の開示にはログインが必要です。
        </p>
        <p className="text-xs text-gray-400 leading-relaxed mb-5">
          これは営業個人の情報を保護し、開示履歴を正しく管理するためです。
          検索や口コミ傾向の確認は、登録なしでご利用いただけます。
        </p>
        <div className="space-y-2">
          <Link
            href="/auth/login"
            className="block w-full bg-teal-500 hover:bg-teal-400 text-white font-bold py-3 rounded-xl text-sm text-center transition"
          >
            ログインして開示する
          </Link>
          <Link
            href="/auth/login?mode=signup"
            className="block w-full border border-teal-200 text-teal-600 font-semibold py-3 rounded-xl text-sm text-center hover:bg-teal-50 transition"
          >
            無料登録する
          </Link>
          <button
            onClick={onClose}
            className="w-full text-gray-400 hover:text-gray-600 py-2 text-sm transition"
          >
            戻る
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== AIチャットモーダル =====
const AI_CHAT_GREETING = 'こんにちは！どんな住宅営業マンをお探しですか？エリアや希望、不安なことなど、気軽に教えてください。'

function AiSearchModal({
  onClose,
  onSearchComplete,
  agents,
}: {
  onClose: () => void
  onSearchComplete: (query: string, results: AiMatchResult[]) => void
  agents: any[]
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: AI_CHAT_GREETING },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'chat' | 'searching'>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, phase])

  const runSearch = async (summary: string) => {
    setPhase('searching')
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    try {
      const agentData = agents.slice(0, 30).map((a) => ({
        id: a.id,
        company_name: a.company_name,
        area_prefecture: a.area_prefecture,
        specialty_styles: a.specialty_styles,
        ai_summary: a.ai_summary
          ? { communicationStyle: a.ai_summary.communicationStyle, goodMatch: a.ai_summary.goodMatch }
          : undefined,
        bio: a.bio,
      }))
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-match-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ query: summary, agents: agentData }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onSearchComplete(summary, data.results ?? [])
      onClose()
    } catch {
      setPhase('chat')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '候補の検索中にエラーが発生しました。もう一度お試しください。' },
      ])
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading || phase === 'searching') return
    const userText = input.trim()
    setInput('')
    const newMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...messages,
      { role: 'user', content: userText },
    ]
    setMessages(newMessages)
    setLoading(true)

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ messages: newMessages }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMessages([...newMessages, { role: 'assistant', content: data.message }])
      setLoading(false)
      if (data.ready) {
        setTimeout(() => runSearch(data.summary ?? userText), 600)
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }])
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isBusy = loading || phase === 'searching'

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose() }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col"
        style={{ height: 'min(540px, 88vh)' }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <h3 className="text-sm font-bold text-gray-800">AIに相談して探す</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="text-gray-400 hover:text-gray-600 transition disabled:opacity-30 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* チャット本文 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mb-0.5">
                  <span className="text-xs leading-none">✨</span>
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-teal-500 text-white rounded-br-sm'
                    : 'bg-stone-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* タイピングインジケーター */}
          {loading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mb-0.5">
                <span className="text-xs leading-none">✨</span>
              </div>
              <div className="bg-stone-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* 検索中インジケーター */}
          {phase === 'searching' && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mb-0.5">
                <span className="text-xs leading-none">✨</span>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-orange-700 flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin shrink-0" />
                候補を探しています...
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 入力エリア */}
        <div className="px-4 py-3 border-t border-stone-100 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              placeholder="メッセージを入力（Enterで送信）"
              className="flex-1 text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-200 resize-none bg-stone-50 disabled:opacity-50"
              rows={2}
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              className="shrink-0 bg-teal-500 hover:bg-teal-400 disabled:bg-teal-200 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition self-end"
            >
              送信
            </button>
          </div>
          <p className="text-xs text-gray-300 mt-1.5 text-center">Shift+Enterで改行</p>
        </div>
      </div>
    </div>
  )
}

// ===== 詳細パネル（PC右カラム） =====
function DetailPanel({
  agent,
  unlockedData,
  reviews,
  reviewsLoading,
  onViewContact,
}: {
  agent: any
  unlockedData: any | null
  reviews: any[]
  reviewsLoading: boolean
  onViewContact: (agentId: string) => void
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

      {/* 1. 基本情報 */}
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
            {!unlockedData && (
              <p className="text-xs text-stone-400 mt-1.5">
                🔒 氏名・顔写真・連絡先は開示後に表示
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
            <span className="text-teal-500 text-sm">✨</span>
            <p className="text-sm font-bold text-gray-700">AI紹介文</p>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{ai.summary}</p>
          <p className="text-xs text-gray-300 mt-3">※ プロフィール情報をもとにAIが生成した紹介文です</p>
        </div>
      )}

      {/* 3. こんな方に合いそう */}
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

      {/* 5. 口コミ・お客様の声 */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
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

      {/* 7. CTA */}
      <div className="bg-teal-50 rounded-2xl border border-teal-100 p-6">
        <p className="text-sm font-semibold text-gray-700 mb-1">
          {displayName}のプロフィールを確認する
        </p>
        <p className="text-xs text-gray-500 mb-4">
          口コミ全文・提案スタイルの詳細はプロフィールページでご覧いただけます
        </p>
        <div className="space-y-2">
          <Link
            href={`/salesperson/${agent.id}`}
            className="block w-full bg-teal-500 hover:bg-teal-400 text-white font-bold py-3.5 rounded-xl transition text-center text-sm"
          >
            詳しく見る
          </Link>
          {!unlockedData && (
            <button
              onClick={() => onViewContact(agent.id)}
              className="block w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition text-sm"
            >
              名前・連絡先を見る
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== メインページ =====
export default function Home() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
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
  const [showAiModal, setShowAiModal] = useState(false)
  const [showLoginGate, setShowLoginGate] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [aiMode, setAiMode] = useState<{ query: string; results: AiMatchResult[] } | null>(null)

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const searchRef = useRef<HTMLDivElement>(null)

  const scrollToSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleAiSearchComplete = (query: string, results: AiMatchResult[]) => {
    setAiMode({ query, results })
    scrollToSearch()
  }

  const handleViewContact = (agentId: string) => {
    if (!isLoggedIn) {
      setShowLoginGate(true)
    } else {
      router.push(`/salesperson/${agentId}`)
    }
  }

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
        setIsLoggedIn(true)
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
        const bio = (a.bio ?? '').toLowerCase()
        const specialtyText = (a.specialty_styles ?? []).join(' ').toLowerCase()
        if (
          !name.includes(kw) &&
          !company.includes(kw) &&
          !bio.includes(kw) &&
          !specialtyText.includes(kw)
        ) return false
      }
      if (filterPrefecture && a.area_prefecture !== filterPrefecture) return false
      if (filterSpecialty && !(a.specialty_styles ?? []).includes(filterSpecialty)) return false
      if (filterQualification && !(a.qualifications ?? []).includes(filterQualification)) return false
      return true
    })
  }, [agents, unlockedMap, keyword, filterPrefecture, filterSpecialty, filterQualification])

  // AI推薦モード時：推薦エージェントを先頭に並べる
  const displayedAgents = useMemo(() => {
    if (!aiMode) return filteredAgents
    const aiOrder = aiMode.results.map((r) => r.agent_id)
    const aiAgents = aiOrder
      .map((id) => filteredAgents.find((a) => a.id === id))
      .filter(Boolean) as any[]
    const rest = filteredAgents.filter((a) => !aiOrder.includes(a.id))
    return [...aiAgents, ...rest]
  }, [filteredAgents, aiMode])

  const getAiMatchReason = (agentId: string): string | null => {
    if (!aiMode) return null
    return aiMode.results.find((r) => r.agent_id === agentId)?.match_reason ?? null
  }

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

  const stickyDisplayName = selectedAgent
    ? (unlockedMap[selectedAgent.id]
        ? (unlockedMap[selectedAgent.id].real_name ?? (selectedAgent.name_initials ? `${selectedAgent.name_initials} さん` : '---'))
        : (selectedAgent.name_initials ? `${selectedAgent.name_initials} さん` : '---'))
    : ''

  const hasFilter = !!(keyword || filterPrefecture || filterSpecialty || filterQualification)

  return (
    <main className="min-h-screen bg-stone-50">
      <Header />

      {/* ===== ヒーロー ===== */}
      <section className="bg-gradient-to-b from-teal-700 to-teal-600 px-6 py-10 md:py-14">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl md:text-4xl font-black text-white leading-snug mb-4">
            あなたが住宅営業を選ぶ。<br />
            口コミと相性からERABERU
          </h1>
          <p className="text-teal-100 text-sm md:text-base leading-relaxed mb-8 max-w-xl mx-auto">
            ERABERUは、住宅会社や条件だけでなく、実際の口コミや対応スタイルをもとに、
            家づくりを安心して相談できる営業を探せるサービスです。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={scrollToSearch}
              className="w-full sm:w-auto bg-white text-teal-700 font-bold px-7 py-3.5 rounded-xl hover:bg-teal-50 transition text-sm shadow-md"
            >
              条件で探す
            </button>
            <button
              onClick={() => setShowAiModal(true)}
              className="w-full sm:w-auto bg-orange-500 hover:bg-orange-400 text-white font-bold px-7 py-3.5 rounded-xl transition text-sm shadow-md"
            >
              AIに相談して探す
            </button>
          </div>
          <p className="text-teal-200 text-xs mt-4">
            条件が決まっている方は条件検索へ。まだ迷っている方は、AIに相談しながら営業候補を整理できます。
          </p>
        </div>
      </section>

      {/* ===== 検索方法カード ===== */}
      <section id="ai-search" className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* カード1: 条件で探す */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600 text-sm font-bold">🔍</span>
              <h2 className="text-base font-bold text-gray-800">条件で探す</h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              エリア・会社名・得意分野・キーワードなど、探したい条件が決まっている方におすすめです。
            </p>
            <button
              onClick={scrollToSearch}
              className="w-full bg-teal-500 hover:bg-teal-400 text-white font-bold py-3 rounded-xl text-sm transition"
            >
              条件を指定して探す
            </button>
          </div>

          {/* カード2: AIに相談 */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-500 text-sm font-bold">✨</span>
              <h2 className="text-base font-bold text-gray-800">AIに相談して探す</h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              家づくりの希望や不安を話しながら、相性の良さそうな営業候補を一緒に整理します。
            </p>
            <button
              onClick={() => setShowAiModal(true)}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl text-sm transition"
            >
              AIに相談して探す
            </button>
          </div>
        </div>
      </section>

      {/* ===== AI推薦バナー ===== */}
      {aiMode && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-3">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-orange-600 mb-0.5">AIが選んだ候補を表示中</p>
              <p className="text-xs text-gray-600 line-clamp-2">「{aiMode.query}」</p>
            </div>
            <button
              onClick={() => setAiMode(null)}
              className="text-xs text-gray-400 hover:text-gray-600 shrink-0 whitespace-nowrap transition"
            >
              × 解除
            </button>
          </div>
        </div>
      )}

      {/* ===== 検索・絞り込みエリア ===== */}
      <div id="search" ref={searchRef} className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード・会社名・得意分野で検索"
            className="w-full text-sm border border-stone-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-200 bg-white"
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
          {hasFilter && (
            <button
              onClick={() => { setKeyword(''); setFilterPrefecture(''); setFilterSpecialty(''); setFilterQualification('') }}
              className="text-xs text-teal-600 hover:text-teal-500 transition"
            >
              × 絞り込みをリセット
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 px-1">
          {displayedAgents.length}人の営業マンが見つかりました
          {displayedAgents.length !== agents.length && (
            <span className="ml-1">（全{agents.length}人中）</span>
          )}
        </p>
      </div>

      {/* ===== 営業カード一覧 ===== */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-3">

        {/* PC: マスター・詳細レイアウト */}
        <div className="hidden md:flex gap-5 h-[calc(100vh-380px)] min-h-[500px] pb-6">

          {/* 左：カード一覧（42%） */}
          <div className="w-[42%] overflow-y-auto space-y-2.5 slim-scroll">
            {displayedAgents.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-4">👤</p>
                <p className="text-sm">
                  {agents.length === 0 ? '現在登録中の営業マンはいません' : '条件に一致する営業マンが見つかりません'}
                </p>
              </div>
            ) : (
              displayedAgents.map((agent) => {
                const isSelected = selectedId === agent.id
                const unlocked = !!unlockedMap[agent.id]
                const ai = (agent.ai_summary ?? null) as AISummary | null
                const displayName = unlocked
                  ? (unlockedMap[agent.id]?.real_name ?? (agent.name_initials ? `${agent.name_initials} さん` : '---'))
                  : (agent.name_initials ? `${agent.name_initials} さん` : '---')
                const themes: string[] = (agent.specialties ?? []).slice(0, 3)
                const matchCopy = ai?.goodMatch?.[0] ? formatMatchCopy(ai.goodMatch[0]) : null
                const supplementary = ai?.communicationStyle ?? null
                const aiReason = getAiMatchReason(agent.id)

                return (
                  <button
                    key={agent.id}
                    onClick={() => handleSelectAgent(agent.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-all duration-200 ${
                      isSelected
                        ? 'bg-teal-50 border-teal-200 shadow-sm'
                        : 'bg-white border-stone-200 hover:border-teal-200 hover:shadow-sm'
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
                        <span className="text-teal-400 shrink-0 mt-0.5 text-sm">✓</span>
                      )}
                    </div>

                    {aiReason && (
                      <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                        <p className="text-xs text-orange-700 leading-relaxed">
                          <span className="font-bold">AI推薦：</span>{aiReason}
                        </p>
                      </div>
                    )}

                    {!aiReason && matchCopy && (
                      <p className={`text-xs font-semibold mt-3 leading-snug ${
                        isSelected ? 'text-teal-700' : 'text-gray-700'
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
                                ? 'bg-teal-100 text-teal-700 border-teal-200'
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

          {/* 右：詳細パネル（58%） */}
          <div className="flex-1 overflow-y-auto slim-scroll">
            {selectedAgent ? (
              <>
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-stone-100 px-4 py-2.5 flex items-center justify-between mb-3 rounded-t-2xl">
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
                    className="shrink-0 text-xs bg-teal-500 hover:bg-teal-400 text-white font-bold px-3 py-1.5 rounded-lg transition ml-3"
                  >
                    詳細を見る
                  </Link>
                </div>

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
                    onViewContact={handleViewContact}
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
          {displayedAgents.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-4">👤</p>
              <p className="text-sm">
                {agents.length === 0 ? '現在登録中の営業マンはいません' : '条件に一致する営業マンが見つかりません'}
              </p>
            </div>
          ) : (
            displayedAgents.map((agent) => {
              const unlocked = !!unlockedMap[agent.id]
              const ai = (agent.ai_summary ?? null) as AISummary | null
              const matchCopy = ai?.goodMatch?.[0] ? formatMatchCopy(ai.goodMatch[0]) : null
              const aiReason = getAiMatchReason(agent.id)
              return (
                <div key={agent.id} className="bg-white rounded-2xl border border-stone-200 p-5 hover:shadow-sm transition-shadow">
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
                      {!unlocked && (
                        <p className="text-xs text-stone-400 mt-0.5">🔒 氏名・写真は開示後に表示</p>
                      )}
                    </div>
                  </div>
                  {aiReason && (
                    <div className="mb-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                      <p className="text-xs text-orange-700 leading-relaxed">
                        <span className="font-bold">AI推薦：</span>{aiReason}
                      </p>
                    </div>
                  )}
                  {!aiReason && matchCopy && (
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
                        <span key={s} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <Link
                      href={`/salesperson/${agent.id}`}
                      className="flex-1 bg-teal-500 hover:bg-teal-400 text-white font-bold py-2.5 rounded-xl text-sm text-center transition"
                    >
                      詳しく見る
                    </Link>
                    {!unlocked && (
                      <button
                        onClick={() => handleViewContact(agent.id)}
                        className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-bold py-2.5 rounded-xl text-sm transition"
                      >
                        名前・連絡先を見る
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ===== はじめての方へ ===== */}
      <section id="about" className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-16">
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <button
            onClick={() => setShowAbout((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-stone-50 transition"
          >
            <div>
              <h2 className="text-base font-bold text-gray-800">はじめての方へ</h2>
              <p className="text-xs text-gray-500 mt-0.5">ERABERUの使い方・口コミの見方・ログインが必要な理由</p>
            </div>
            <span className="text-gray-400 text-lg ml-4 shrink-0">
              {showAbout ? '▲' : '▼'}
            </span>
          </button>

          {showAbout && (
            <div className="px-6 pb-8 space-y-6 border-t border-stone-100 pt-6">
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">ERABERUとは</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  住宅営業マンを「相性」や「口コミ」から探せるサービスです。
                  「あの住宅会社に決めた、でも担当が合わない」という経験をなくすために生まれました。
                  会社選びではなく、一緒に家づくりを進める担当者を選ぶことができます。
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">営業を相性で探す考え方</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  ERABERUでは、「傾聴型か提案型か」「数字で説明するか感覚で説明するか」など、
                  営業マンのコミュニケーションスタイルを軸に整理しています。
                  あなたの家づくりのスタイルに合った担当者を選ぶことで、安心して相談できる関係が生まれます。
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">条件検索とAI相談検索の違い</h3>
                <div className="space-y-2">
                  <div className="bg-teal-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-teal-700 mb-1">条件で探す</p>
                    <p className="text-xs text-gray-600">エリア・会社名・得意分野など、探したい条件が明確な方に。絞り込みながら一覧を確認できます。</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-orange-600 mb-1">AIに相談して探す</p>
                    <p className="text-xs text-gray-600">「土地探しから一緒に動いてほしい」「押し売りが苦手」など、希望や不安を自由に書いてください。AIが営業選びを整理する手助けをします。</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">口コミの見方</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  ERABERUの口コミは、実際に住宅購入を経験した方からの声をもとにしています。
                  星評価ではなく、「どんな場面で役立ったか」「どんなコミュニケーションスタイルか」といった
                  テキスト中心の情報を重視しています。ランキング形式ではなく、あなたに合った人を選ぶための情報として活用してください。
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">情報開示にはログインが必要な理由</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  氏名・顔写真・連絡先など、営業個人が特定できる情報の閲覧には、ログインが必要です。
                  これは、営業個人の情報を保護し、開示履歴を正しく管理するためです。
                  検索・口コミ傾向の確認・AI相談は、登録なしでご利用いただけます。
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">施主側のメリット</h3>
                <ul className="space-y-1.5">
                  {[
                    '口コミや対応スタイルをもとに、相性の良さそうな営業を事前に確認できる',
                    '「話をよく聞いてくれる」「押しつけ感が少ない」など、実際の声で比較できる',
                    '会社選びと担当者選びを分けて考えられる',
                    '気に入った営業が見つかってからログインすればOK、最初から登録は不要',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-teal-500 shrink-0 mt-0.5">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== モーダル ===== */}
      {showLoginGate && <LoginGateModal onClose={() => setShowLoginGate(false)} />}
      {showAiModal && (
        <AiSearchModal
          onClose={() => setShowAiModal(false)}
          onSearchComplete={handleAiSearchComplete}
          agents={agents}
        />
      )}
    </main>
  )
}
