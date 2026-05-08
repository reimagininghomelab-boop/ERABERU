'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

// ── SVG map layout ────────────────────────────────────────────────
const PX = 56
const PY = 42
const IW = 390
const IH = 260
const VW = IW + PX * 2
const VH = IH + PY * 2
const R  = 14
const CLUSTER_DIST = 34

function mx(v: number) { return PX + ((v - 1) / 4) * IW }
function my(v: number) { return PY + ((5 - v) / 4) * IH }

const DOT_COLORS = ['#3B82F6', '#818CF8', '#A855F7', '#EC4899', '#F97316']
const DOT_BG     = ['#EFF6FF', '#EEF2FF', '#FAF5FF', '#FDF2F8', '#FFF7ED']
function lpLabel(v: number) { return v <= 2 ? '傾聴・寄り添い型' : v >= 4 ? '提案・リード型' : 'バランス型' }
function nfLabel(v: number) { return v >= 4 ? '感覚・イメージ重視' : v <= 2 ? 'データ・数字重視' : 'バランス型' }
function lpShort(v: number) { return v <= 2 ? '傾聴型' : v >= 4 ? '提案型' : 'バランス' }
function nfShort(v: number) { return v >= 4 ? '感覚型' : v <= 2 ? 'データ型' : 'バランス' }

type AgentPlot = {
  num: number
  id: string
  displayName: string
  company: string
  dept: string | null
  specialty: string[]
  qualifications: string[]
  isVerified: boolean
  isFavorited: boolean
  lp: number; nf: number
  specialtyTags: string[]
  sx: number; sy: number; sc: string; sbg: string
  bx: number | null; by: number | null; bc: string | null
  buyerCount: number
}

type Tab = 'unlocked' | 'favorites'
type BuyerStyle = { lp: number; nf: number }

const QUADRANTS = [
  { cx: PX + IW * 0.25, cy: PY + IH * 0.18, label: '感覚×傾聴',  sub: '共感・寄り添い型' },
  { cx: PX + IW * 0.75, cy: PY + IH * 0.18, label: '感覚×提案',  sub: 'ビジョン提案型' },
  { cx: PX + IW * 0.25, cy: PY + IH * 0.82, label: 'データ×傾聴', sub: '論理サポート型' },
  { cx: PX + IW * 0.75, cy: PY + IH * 0.82, label: 'データ×提案', sub: '分析リード型' },
]

export default function StyleMapPage() {
  const router = useRouter()
  const [agents, setAgents]         = useState<AgentPlot[]>([])
  const [loading, setLoading]       = useState(true)
  const [notLoggedIn, setNotLoggedIn] = useState(false)
  const [tab, setTab]               = useState<Tab>('unlocked')
  const [hoverId, setHoverId]       = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [buyerStyle, setBuyerStyle] = useState<BuyerStyle | null>(null)
  const [showDiag, setShowDiag]     = useState(false)
  const [diagLp, setDiagLp]         = useState(3)
  const [diagNf, setDiagNf]         = useState(3)
  const [clusterAgents, setClusterAgents] = useState<AgentPlot[]>([])
  const [clusterCenter, setClusterCenter] = useState<{ x: number; y: number } | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setNotLoggedIn(true); setLoading(false); return }

      // 営業アカウントはダッシュボードへ
      const { data: ownProfile } = await supabase
        .from('salesperson_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (ownProfile) { router.replace('/salesperson/dashboard'); return }

      // 開示済みプロフィール取得（RLSが自動的に自分が解除したものだけ返す）
      const { data: profiles } = await supabase
        .from('salesperson_profiles')
        .select('id, real_name, family_name, given_name, company_name, department, specialty_styles, specialty_tags, qualifications, sales_styles, is_verified')
        .not('sales_styles', 'eq', '{}')
        .order('company_name')

      // 施主評価平均
      const { data: buyerAvgs } = await supabase
        .from('buyer_style_averages')
        .select('salesperson_id, avg_lp, avg_nf, avg_td, review_count')

      const avgMap: Record<string, { lp: number; nf: number; td: number; count: number }> = {}
      for (const row of (buyerAvgs ?? []) as any[]) {
        avgMap[row.salesperson_id] = {
          lp: Number(row.avg_lp), nf: Number(row.avg_nf),
          td: Number(row.avg_td), count: Number(row.review_count),
        }
      }

      // お気に入り
      const { data: favs } = await supabase
        .from('favorites')
        .select('salesperson_id')
        .eq('user_id', user.id)
      const favSet = new Set((favs ?? []).map((f: any) => f.salesperson_id))

      const validProfiles = ((profiles ?? []) as any[]).filter(
        (a) => a.sales_styles?.listening_proposing
      )

      const plots: AgentPlot[] = validProfiles.map((a, i) => {
        const ss = a.sales_styles as Record<string, number>
        const lp = ss.listening_proposing ?? 3
        const nf = ss.numbers_feeling ?? 3
        const sc = DOT_COLORS[i % DOT_COLORS.length]
        const sbg = DOT_BG[i % DOT_BG.length]
        const avg = avgMap[a.id]
        const displayName = (a.family_name && a.given_name)
          ? `${a.family_name} ${a.given_name}`
          : (a.real_name ?? a.company_name)
        return {
          num: i + 1,
          id: a.id,
          displayName,
          company: a.company_name ?? '—',
          dept: a.department ?? null,
          specialty: a.specialty_styles ?? [],
          specialtyTags: a.specialty_tags ?? [],
          qualifications: a.qualifications ?? [],
          isVerified: a.is_verified ?? false,
          isFavorited: favSet.has(a.id),
          lp, nf,
          sx: mx(lp), sy: my(nf), sc, sbg,
          bx: avg ? mx(avg.lp) : null,
          by: avg ? my(avg.nf) : null,
          bc: avg ? sc : null,
          buyerCount: avg?.count ?? 0,
        }
      })

      setAgents(plots)
      setLoading(false)
    }
    load()
  }, [])

  const visibleAgents = tab === 'favorites'
    ? agents.filter((a) => a.isFavorited)
    : agents

  const selected = agents.find((a) => a.id === selectedId) ?? null
  const hasFavorites = agents.some((a) => a.isFavorited)

  const handleDot = (id: string) => setSelectedId((prev) => prev === id ? null : id)

  const showCluster = (id: string) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setHoverId(id)
    const hovered = visibleAgents.find((a) => a.id === id)
    if (!hovered) return
    const nearby = visibleAgents.filter((a) =>
      Math.sqrt(Math.pow(a.sx - hovered.sx, 2) + Math.pow(a.sy - hovered.sy, 2)) <= CLUSTER_DIST
    )
    if (nearby.length >= 2) {
      const cx = nearby.reduce((s, a) => s + a.sx, 0) / nearby.length
      const cy = nearby.reduce((s, a) => s + a.sy, 0) / nearby.length
      setClusterAgents(nearby)
      setClusterCenter({ x: cx, y: cy })
    } else {
      setClusterAgents([])
      setClusterCenter(null)
    }
  }

  const hideCluster = () => {
    hideTimerRef.current = setTimeout(() => {
      setHoverId(null)
      setClusterAgents([])
      setClusterCenter(null)
    }, 200)
  }

  const onPopoverEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }

  if (loading) return <div className="min-h-screen bg-stone-100" />

  if (notLoggedIn) {
    return (
      <main className="min-h-screen bg-stone-100">
        <Header />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-lg font-bold text-stone-700 mb-2">ログインが必要です</h2>
          <p className="text-stone-500 text-sm mb-6">スタイルマップは開示済みの営業マンを比較する機能です。</p>
          <Link href="/auth/login" className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition text-sm">
            ログインする
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-100">
      <Header />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-800">会話スタイルマップ</h1>
            <p className="text-stone-500 text-sm mt-1">
              開示済みの営業マンのスタイル傾向と施主評価を比較できます。
            </p>
          </div>
          {/* タブ切り替え */}
          <div className="flex bg-white border border-stone-200 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setTab('unlocked'); setSelectedId(null) }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'unlocked'
                  ? 'bg-stone-800 text-white'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              開示済み（{agents.length}）
            </button>
            <button
              onClick={() => { setTab('favorites'); setSelectedId(null) }}
              disabled={!hasFavorites}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'favorites'
                  ? 'bg-rose-500 text-white'
                  : hasFavorites
                    ? 'text-stone-500 hover:text-rose-500'
                    : 'text-stone-300 cursor-not-allowed'
              }`}
            >
              ♥ お気に入り（{agents.filter((a) => a.isFavorited).length}）
            </button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <p className="text-4xl mb-4">🗺️</p>
            <p className="mb-4">まだ開示済みの営業マンがいません</p>
            <Link href="/" className="text-sm text-orange-500 hover:text-orange-400">
              営業マン一覧へ
            </Link>
          </div>
        ) : visibleAgents.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <p className="text-4xl mb-4">♡</p>
            <p className="mb-3">お気に入りに追加した営業マンがいません</p>
            <button onClick={() => setTab('unlocked')} className="text-sm text-orange-500 hover:text-orange-400">
              全員を表示
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5">

            {/* ── 左: 営業リスト + 凡例 ── */}
            <div className="lg:w-52 flex-shrink-0 space-y-3">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
                  {tab === 'favorites' ? 'お気に入り' : '開示済み'}
                </p>
                <div className="mb-3">
                  <button
                    onClick={() => setShowDiag(true)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors ${
                      buyerStyle
                        ? 'bg-amber-50 border border-amber-200 text-amber-700'
                        : 'bg-stone-50 border border-stone-200 text-stone-500 hover:border-orange-200'
                    }`}
                  >
                    <span>⭐</span>
                    <span>{buyerStyle ? 'あなたの好み（変更）' : 'あなたの好みを入力'}</span>
                  </button>
                </div>
              <div className="space-y-1">
                  {visibleAgents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleDot(a.id)}
                      onMouseEnter={() => setHoverId(a.id)}
                      onMouseLeave={() => setHoverId(null)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-all ${
                        selectedId === a.id
                          ? 'bg-stone-100 border border-stone-300'
                          : 'border border-transparent hover:bg-stone-50'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style={{ backgroundColor: a.sc }}
                      >
                        {a.num}
                      </span>
                      <span className="truncate text-stone-700 text-xs font-medium flex-1">{a.displayName}</span>
                      {a.isFavorited && <span className="text-rose-400 text-xs flex-shrink-0">♥</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* 凡例 */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4">
                <p className="text-xs font-semibold text-stone-400 mb-2">凡例</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <svg width="18" height="10"><circle cx="9" cy="5" r="4.5" fill="#78716C" /></svg>
                    <span className="text-xs text-stone-400">自己評価</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="18" height="10"><circle cx="9" cy="5" r="4.5" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
                    <span className="text-xs text-stone-400">施主評価平均</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 中央: SVG マップ ── */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3">
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${VW} ${VH}`}
                    className="w-full max-w-full"
                    style={{ minWidth: 300, display: 'block' }}
                  >
                    {/* Grid */}
                    {[0.25, 0.5, 0.75].map((t) => (
                      <g key={t}>
                        <line x1={PX + t * IW} y1={PY} x2={PX + t * IW} y2={PY + IH} stroke="#F5F5F4" strokeWidth="1" />
                        <line x1={PX} y1={PY + t * IH} x2={PX + IW} y2={PY + t * IH} stroke="#F5F5F4" strokeWidth="1" />
                      </g>
                    ))}
                    <line x1={PX + IW / 2} y1={PY} x2={PX + IW / 2} y2={PY + IH} stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="5 4" />
                    <line x1={PX} y1={PY + IH / 2} x2={PX + IW} y2={PY + IH / 2} stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="5 4" />
                    <rect x={PX} y={PY} width={IW} height={IH} rx="6" fill="none" stroke="#E7E5E4" strokeWidth="1" />

                    {/* 象限ラベル */}
                    {QUADRANTS.map(({ cx, cy, label, sub }) => (
                      <g key={label}>
                        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fill="#D4CFC9" fontWeight="600">{label}</text>
                        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="8" fill="#D4CFC9">{sub}</text>
                      </g>
                    ))}

                    {/* 軸ラベル */}
                    <text x={PX + 4}      y={PY - 12} fontSize="11" fill="#78716C" fontWeight="600" textAnchor="start">傾聴型</text>
                    <text x={PX + IW - 4} y={PY - 12} fontSize="11" fill="#78716C" fontWeight="600" textAnchor="end">提案型</text>
                    <text x={PX + 4}      y={PY - 24} fontSize="9"  fill="#B5AFA8" textAnchor="start">話を聞く・寄り添う</text>
                    <text x={PX + IW - 4} y={PY - 24} fontSize="9"  fill="#B5AFA8" textAnchor="end">提案主導・アイデア提示</text>
                    <text x={PX - 4}      y={PY + 6}  fontSize="9"  fill="#B5AFA8" textAnchor="end">感覚・雰囲気</text>
                    <text x={PX - 4}      y={PY + IH - 6} fontSize="9" fill="#B5AFA8" textAnchor="end">数字・根拠</text>
                    <text
                      x={PX - 10} y={PY + IH / 2}
                      fontSize="10" fill="#78716C" fontWeight="600"
                      textAnchor="middle" dominantBaseline="central"
                      transform={`rotate(-90, ${PX - 10}, ${PY + IH / 2})`}
                    >
                      感覚・イメージ ↑ 数字・データ
                    </text>

                    {/* ── 営業ドット ── */}
                    {visibleAgents.map((a) => {
                      const isSelected = selectedId === a.id
                      const isHovered  = hoverId === a.id
                      const isFaded    = (selectedId !== null || hoverId !== null) && !isSelected && !isHovered
                      const isActive   = isSelected || isHovered

                      return (
                        <g key={a.id}>
                          {/* 自己↔施主 接続線（ホバー・選択時） */}
                          {isActive && a.bx !== null && a.by !== null && (
                            <line
                              x1={a.sx} y1={a.sy} x2={a.bx} y2={a.by}
                              stroke={a.sc} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"
                            />
                          )}
                          {/* 施主評価平均（点線円） */}
                          {a.bx !== null && a.by !== null && (
                            <circle
                              cx={a.bx} cy={a.by} r={R}
                              fill="none" stroke={a.bc ?? a.sc} strokeWidth="2" strokeDasharray="5 3"
                              opacity={isFaded ? 0.08 : 0.55}
                              style={{ transition: 'opacity 0.2s' }}
                            />
                          )}
                          {/* ホバーリング */}
                          {isActive && (
                            <circle cx={a.sx} cy={a.sy} r={R + 6} fill={a.sc} opacity="0.12" style={{ pointerEvents: 'none' }} />
                          )}
                          {/* 自己評価（実線円） */}
                          <circle
                            cx={a.sx} cy={a.sy} r={R}
                            fill={isFaded ? '#D6D3D1' : a.sc}
                            opacity={isFaded ? 0.2 : 1}
                            style={{ transition: 'all 0.18s ease', cursor: 'pointer' }}
                            onClick={() => handleDot(a.id)}
                            onMouseEnter={() => showCluster(a.id)}
                            onMouseLeave={() => hideCluster()}
                          />
                          {/* 番号 */}
                          <text
                            x={a.sx} y={a.sy}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize="9" fontWeight="800" fill="white"
                            opacity={isFaded ? 0.2 : 1}
                            style={{ pointerEvents: 'none', transition: 'opacity 0.18s', userSelect: 'none' }}
                          >
                            {a.num}
                          </text>
                          {/* お気に入りマーク */}
                          {a.isFavorited && (
                            <text
                              x={a.sx + R - 2} y={a.sy - R + 2}
                              fontSize="8" textAnchor="middle" dominantBaseline="central"
                              fill="#F43F5E"
                              opacity={isFaded ? 0.2 : 1}
                              style={{ pointerEvents: 'none', transition: 'opacity 0.18s' }}
                            >
                              ♥
                            </text>
                          )}
                        </g>
                      )
                    })}
                    {/* ── クラスター吹き出し ── */}
                    {clusterCenter && clusterAgents.length >= 2 && (() => {
                      const PW = 172
                      const rowH = 26
                      const padV = 10
                      const PH = padV * 2 + clusterAgents.length * rowH
                      const AH = 9
                      const cx = Math.max(PX + PW / 2, Math.min(clusterCenter.x, PX + IW - PW / 2))
                      const above = clusterCenter.y - R - AH - PH > PY + 10
                      const bx = cx - PW / 2
                      const by = above ? clusterCenter.y - R - AH - PH : clusterCenter.y + R + AH
                      const ax = clusterCenter.x
                      return (
                        <g
                          style={{ cursor: 'default' }}
                          onMouseEnter={onPopoverEnter}
                          onMouseLeave={hideCluster}
                        >
                          {/* 吹き出し矢印（先に描いて枠で上書き） */}
                          {above ? (
                            <polygon
                              points={`${ax},${clusterCenter.y - R - 2} ${ax - 7},${by + PH} ${ax + 7},${by + PH}`}
                              fill="white" stroke="#E7E5E4" strokeWidth="1"
                            />
                          ) : (
                            <polygon
                              points={`${ax},${clusterCenter.y + R + 2} ${ax - 7},${by} ${ax + 7},${by}`}
                              fill="white" stroke="#E7E5E4" strokeWidth="1"
                            />
                          )}
                          {/* 背景矩形 */}
                          <rect
                            x={bx} y={by} width={PW} height={PH} rx="9"
                            fill="white" stroke="#E7E5E4" strokeWidth="1"
                            style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.13))' }}
                          />
                          {/* 行 */}
                          {clusterAgents.map((a, i) => {
                            const ry = by + padV + i * rowH + rowH / 2
                            const nameStr = a.displayName.length > 12 ? a.displayName.slice(0, 11) + '…' : a.displayName
                            return (
                              <g
                                key={a.id}
                                style={{ cursor: 'pointer' }}
                                onClick={() => { handleDot(a.id); setClusterAgents([]); setClusterCenter(null) }}
                              >
                                <rect x={bx + 1} y={by + padV + i * rowH} width={PW - 2} height={rowH} fill="transparent"
                                  rx={i === 0 ? '8' : i === clusterAgents.length - 1 ? '8' : '0'} />
                                <circle cx={bx + 20} cy={ry} r={9} fill={a.sc} />
                                <text x={bx + 20} y={ry} textAnchor="middle" dominantBaseline="central"
                                  fontSize="8" fontWeight="800" fill="white" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                  {a.num}
                                </text>
                                <text x={bx + 34} y={ry - 5} fontSize="9.5" fontWeight="600" fill="#292524"
                                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                  {nameStr}
                                </text>
                                <text x={bx + 34} y={ry + 7} fontSize="8" fill="#A8A29E"
                                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                  {lpShort(a.lp)} / {nfShort(a.nf)}
                                </text>
                              </g>
                            )
                          })}
                        </g>
                      )
                    })()}
                    {/* ── 施主の好み（⭐） ── */}
                    {buyerStyle && (
                      <g style={{ pointerEvents: 'none' }}>
                        <circle
                          cx={mx(buyerStyle.lp)} cy={my(buyerStyle.nf)} r={R + 4}
                          fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 2" opacity="0.6"
                        />
                        <text x={mx(buyerStyle.lp)} y={my(buyerStyle.nf)} textAnchor="middle" dominantBaseline="central" fontSize="14">⭐</text>
                        <text x={mx(buyerStyle.lp)} y={my(buyerStyle.nf) + R + 10} textAnchor="middle" fontSize="8" fill="#92400E">あなた</text>
                      </g>
                    )}
                  </svg>
                </div>
              </div>
            </div>

            {/* ── 右: 詳細パネル ── */}
            {selected && (
              <div className="lg:w-60 flex-shrink-0">
                <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 lg:sticky lg:top-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style={{ backgroundColor: selected.sc }}
                      >
                        {selected.num}
                      </span>
                      {selected.isFavorited && (
                        <span className="text-xs bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full border border-rose-100">♥</span>
                      )}
                      {selected.isVerified && (
                        <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full">✓</span>
                      )}
                    </div>
                    <button onClick={() => setSelectedId(null)} className="text-stone-300 hover:text-stone-500 transition text-xl leading-none">×</button>
                  </div>

                  <p className="font-bold text-stone-800 leading-tight text-base">{selected.displayName}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{selected.company}</p>
                  {selected.dept && <p className="text-xs text-stone-400">{selected.dept}</p>}

                  {/* スタイルサマリー */}
                  <div className="mt-4 rounded-xl p-3 text-xs space-y-1" style={{ backgroundColor: selected.sbg }}>
                    <p className="font-semibold" style={{ color: selected.sc }}>打合せスタイル</p>
                    <p className="text-stone-600">{lpLabel(selected.lp)} × {nfLabel(selected.nf)}</p>
                  </div>

                  {/* 2軸バー */}
                  <div className="mt-4 space-y-3">
                    {[
                      { label: '傾聴 ↔ 提案', self: selected.lp },
                      { label: 'データ ↔ 感覚', self: selected.nf },
                    ].map(({ label, self }) => (
                      <div key={label}>
                        <div className="flex justify-between text-xs text-stone-400 mb-1">
                          <span>{label}</span>
                          <span className="font-mono text-stone-500">{self}/5</span>
                        </div>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <div
                              key={v}
                              className="flex-1 h-1.5 rounded-full"
                              style={{ backgroundColor: v <= self ? selected.sc : '#E7E5E4' }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {selected.buyerCount > 0 && (
                      <p className="text-xs text-stone-400 pt-1">
                        施主評価 {selected.buyerCount}件の平均をマップに表示中
                      </p>
                    )}
                  </div>

                  {/* 得意分野タグ */}
                  {selected.specialtyTags.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-stone-400 mb-1.5">得意分野</p>
                      <div className="flex flex-wrap gap-1">
                        {selected.specialtyTags.map((s) => (
                          <span key={s} className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full border border-orange-100">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* あなたとの距離感 */}
                  {buyerStyle && (() => {
                    const d = Math.sqrt(
                      Math.pow(selected.lp - buyerStyle.lp, 2) +
                      Math.pow(selected.nf - buyerStyle.nf, 2)
                    )
                    const score = Math.round((1 - d / Math.sqrt(32)) * 100)
                    const label = score >= 80 ? 'とても近い' : score >= 60 ? 'やや近い' : score >= 40 ? '中程度' : '離れている'
                    return (
                      <div className="mt-4">
                        <p className="text-xs text-stone-400 mb-2">あなたとの距離感</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                            <div className="bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${score}%` }} />
                          </div>
                          <span className="text-xs text-stone-500 whitespace-nowrap">{label}</span>
                        </div>
                      </div>
                    )
                  })()}

                  <Link
                    href={`/salesperson/${selected.id}`}
                    className="mt-5 block w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm text-center transition"
                  >
                    プロフィールを見る
                  </Link>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
      {/* ── 施主好み診断モーダル ── */}
      {showDiag && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDiag(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-stone-800">あなたの打合せスタイルの好み</h3>
                <p className="text-xs text-stone-400 mt-0.5">⭐ がマップに表示されます</p>
              </div>
              <button onClick={() => setShowDiag(false)} className="text-stone-300 hover:text-stone-500 text-2xl leading-none ml-3">×</button>
            </div>
            <div className="space-y-5">
              {[
                { label: '話し方', left: '話を聞いてほしい', right: '提案を多くほしい', val: diagLp, set: setDiagLp },
                { label: '説明スタイル', left: 'データ・数字で', right: 'イメージ・感覚で', val: diagNf, set: setDiagNf },
              ].map(({ label, left, right, val, set }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-stone-600 mb-2">{label}</p>
                  <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                    <span>{left}</span><span>{right}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        onClick={() => set(v)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          val === v
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-stone-50 text-stone-400 border-stone-200 hover:border-orange-300'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setBuyerStyle({ lp: diagLp, nf: diagNf }); setShowDiag(false) }}
              className="w-full mt-5 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition"
            >
              マップに表示する ⭐
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
