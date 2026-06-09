'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

// ── SVG constants ─────────────────────────────────────────
const PX = 60, PY = 60          // 外側パディング
const IW = 480, IH = 340        // 横長マップ
const VW = IW + PX * 2, VH = IH + PY * 2
const R = 16, CLUSTER_DIST = 36
const IP = R + 6                // 内側パディング（端ドットがはみ出ない）
const CX = PX + IW / 2, CY = PY + IH / 2
const GR = Math.max(IW, IH) * 0.88

// 象限とは独立した営業ドット用カラーパレット
const DOT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#D97706', '#EC4899', '#84CC16', '#6366F1',
]

function mx(v: number) { return PX + IP + ((v - 1) / 5) * (IW - 2 * IP) }
function my(v: number) { return PY + IP + ((6 - v) / 5) * (IH - 2 * IP) }

function lpShort(v: number) { return v <= 2 ? '傾聴型' : v >= 5 ? '提案型' : 'バランス' }
function nfShort(v: number) { return v >= 5 ? '感覚型' : v <= 2 ? 'データ型' : 'バランス' }

function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// 詳細パネルのタイプバッジ用（6段階: 中点=3.5）
function quadrantKey(lp: number, nf: number) {
  if (lp < 3.5 && nf > 3.5) return 'tl'
  if (lp >= 3.5 && nf > 3.5) return 'tr'
  if (lp < 3.5 && nf <= 3.5) return 'bl'
  return 'br'
}

// ツールチップ幅・高さ
const TT_W = 198, TT_H = 48

// 左右パディング(PX=60)の中央にラベルを配置 → 両側の視覚的間隔が対称になる
const LABEL_LX = Math.round(PX / 2)        // = 30（左パディング中央）
const LABEL_RX = VW - Math.round(PX / 2)   // = 570（右パディング中央）

const QUADRANT_DEFS = [
  {
    key: 'tl', label: '共感伴走タイプ', color: '#E07828',
    anchor: 'start' as const,
    tx: LABEL_LX, ty: PY + 14,         // マップ外・左側・上から下へ
    ttx: PX + 8,  tty: PY + 12,
    desc: ['気持ちや理想の暮らしに寄り添いながら、', '安心して話を進めてくれる。'],
  },
  {
    key: 'tr', label: '感性提案タイプ', color: '#CC1468',
    anchor: 'start' as const,
    tx: LABEL_RX, ty: PY + 14,         // マップ外・右側・上から下へ
    ttx: PX + IW - TT_W - 8, tty: PY + 12,
    desc: ['暮らしのイメージやデザインの方向性を', '広げる提案をしてくれる。'],
  },
  {
    key: 'bl', label: '整理伴走タイプ', color: '#0A9487',
    anchor: 'end' as const,
    tx: LABEL_LX, ty: PY + IH - 14,   // マップ外・左側・下から上へ
    ttx: PX + 8,  tty: PY + IH - TT_H - 12,
    desc: ['数字や条件を整理しながら、', '施主の考えを引き出してくれる。'],
  },
  {
    key: 'br', label: '戦略提案タイプ', color: '#3545C8',
    anchor: 'end' as const,
    tx: LABEL_RX, ty: PY + IH - 14,   // マップ外・右側・下から上へ
    ttx: PX + IW - TT_W - 8, tty: PY + IH - TT_H - 12,
    desc: ['根拠や比較をもとに、', '判断しやすい提案をしてくれる。'],
  },
]

// 重なり時のずれオフセット（2枚目・3枚目）
const STACK_OFFSETS: [number, number][] = [[5, -4], [-5, -4]]

type AgentPlot = {
  num: number; id: string; displayName: string
  company: string; dept: string | null
  specialtyTags: string[]; isVerified: boolean; isFavorited: boolean
  lp: number; nf: number; sx: number; sy: number; sc: string
}
type Tab = 'unlocked' | 'favorites'
type BuyerStyle = { lp: number; nf: number }

export default function StyleMapPage() {
  const router = useRouter()
  const [agents, setAgents]               = useState<AgentPlot[]>([])
  const [loading, setLoading]             = useState(true)
  const [notLoggedIn, setNotLoggedIn]     = useState(false)
  const [tab, setTab]                     = useState<Tab>('unlocked')
  const [hoverId, setHoverId]             = useState<string | null>(null)
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [buyerStyle, setBuyerStyle]       = useState<BuyerStyle | null>(null)
  const [showDiag, setShowDiag]           = useState(false)
  const [diagLp, setDiagLp]               = useState(3)
  const [diagNf, setDiagNf]               = useState(3)
  const [clusterAgents, setClusterAgents] = useState<AgentPlot[]>([])
  const [clusterCenter, setClusterCenter] = useState<{ x: number; y: number } | null>(null)
  const [hoveredQ, setHoveredQ]           = useState<string | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setNotLoggedIn(true); setLoading(false); return }

      const { data: ownProfile } = await supabase
        .from('salesperson_profiles').select('id').eq('user_id', user.id).maybeSingle()
      if (ownProfile) { router.replace('/salesperson/dashboard'); return }

      const { data: profiles } = await supabase
        .from('salesperson_profiles')
        .select('id, real_name, family_name, given_name, company_name, department, specialty_tags, sales_styles, is_verified')
        .not('sales_styles', 'eq', '{}')
        .order('company_name')

      const { data: favs } = await supabase
        .from('favorites').select('salesperson_id').eq('user_id', user.id)
      const favSet = new Set((favs ?? []).map((f: any) => f.salesperson_id))

      const plots: AgentPlot[] = ((profiles ?? []) as any[])
        .filter((a) => a.sales_styles?.listening_proposing)
        .map((a, i) => {
          const ss = a.sales_styles as Record<string, number>
          const lp = ss.listening_proposing ?? 3
          const nf = ss.numbers_feeling ?? 3
          const displayName = (a.family_name && a.given_name)
            ? `${a.family_name} ${a.given_name}` : (a.real_name ?? a.company_name)
          return {
            num: i + 1, id: a.id, displayName,
            company: a.company_name ?? '—', dept: a.department ?? null,
            specialtyTags: a.specialty_tags ?? [],
            isVerified: a.is_verified ?? false,
            isFavorited: favSet.has(a.id),
            lp, nf, sx: mx(lp), sy: my(nf),
            // 象限と無関係なパレット色
            sc: DOT_COLORS[i % DOT_COLORS.length],
          }
        })

      setAgents(plots)
      setLoading(false)
    }
    load()
  }, [])

  const visibleAgents = tab === 'favorites' ? agents.filter((a) => a.isFavorited) : agents
  const selected = agents.find((a) => a.id === selectedId) ?? null
  const hasFavorites = agents.some((a) => a.isFavorited)
  const handleDot = (id: string) => setSelectedId((prev) => prev === id ? null : id)

  // 同一座標の重なりマップ（ピクセル単位で丸めて判定）
  const overlapMap = new Map<string, AgentPlot[]>()
  for (const a of visibleAgents) {
    const key = `${Math.round(a.sx)},${Math.round(a.sy)}`
    const g = overlapMap.get(key) ?? []
    g.push(a)
    overlapMap.set(key, g)
  }

  const showCluster = (id: string) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setHoverId(id)
    const hovered = visibleAgents.find((a) => a.id === id)
    if (!hovered) return
    const nearby = visibleAgents.filter((a) =>
      Math.hypot(a.sx - hovered.sx, a.sy - hovered.sy) <= CLUSTER_DIST
    )
    if (nearby.length >= 2) {
      setClusterAgents(nearby)
      setClusterCenter({
        x: nearby.reduce((s, a) => s + a.sx, 0) / nearby.length,
        y: nearby.reduce((s, a) => s + a.sy, 0) / nearby.length,
      })
    } else {
      setClusterAgents([])
      setClusterCenter(null)
    }
  }

  const hideCluster = () => {
    hideTimerRef.current = setTimeout(() => {
      setHoverId(null); setClusterAgents([]); setClusterCenter(null)
    }, 200)
  }
  const onPopoverEnter = () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }

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

  const hqDef = QUADRANT_DEFS.find((q) => q.key === hoveredQ)

  return (
    <main className="min-h-screen bg-stone-100">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── ヘッダー行 ── */}
        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-800">会話スタイルマップ</h1>
            <p className="text-stone-500 text-sm mt-1">開示済みの営業マンのスタイル傾向を比較できます。</p>
          </div>
          <div className="flex bg-white border border-stone-200 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setTab('unlocked'); setSelectedId(null) }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'unlocked' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-700'}`}
            >
              開示済み（{agents.length}）
            </button>
            <button
              onClick={() => { setTab('favorites'); setSelectedId(null) }}
              disabled={!hasFavorites}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'favorites' ? 'bg-rose-500 text-white' : hasFavorites ? 'text-stone-500 hover:text-rose-500' : 'text-stone-300 cursor-not-allowed'}`}
            >
              ♥ お気に入り（{agents.filter((a) => a.isFavorited).length}）
            </button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <p className="text-4xl mb-4">🗺️</p>
            <p className="mb-4">まだ開示済みの営業マンがいません</p>
            <Link href="/" className="text-sm text-orange-500 hover:text-orange-400">営業マン一覧へ</Link>
          </div>
        ) : visibleAgents.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <p className="text-4xl mb-4">♡</p>
            <p className="mb-3">お気に入りに追加した営業マンがいません</p>
            <button onClick={() => setTab('unlocked')} className="text-sm text-orange-500 hover:text-orange-400">全員を表示</button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5">

            {/* ── 左: 営業リスト ── */}
            <div className="lg:w-52 flex-shrink-0 space-y-3">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
                  {tab === 'favorites' ? 'お気に入り' : '開示済み'}
                </p>
                <div className="mb-3">
                  <button
                    onClick={() => setShowDiag(true)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors ${buyerStyle ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-stone-50 border border-stone-200 text-stone-500 hover:border-orange-200'}`}
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
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-all ${selectedId === a.id ? 'bg-stone-100 border border-stone-300' : 'border border-transparent hover:bg-stone-50'}`}
                    >
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style={{ backgroundColor: a.sc }}>{a.num}</span>
                      <span className="truncate text-stone-700 text-xs font-medium flex-1">{a.displayName}</span>
                      {a.isFavorited && <span className="text-rose-400 text-xs flex-shrink-0">♥</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* タイプ凡例 */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4">
                <p className="text-xs font-semibold text-stone-400 mb-2">タイプ別</p>
                <div className="space-y-1.5">
                  {QUADRANT_DEFS.map((q) => (
                    <div key={q.key} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: q.color }} />
                      <span className="text-xs text-stone-500">{q.label}</span>
                    </div>
                  ))}
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
                    <defs>
                      {/* 象限グラデーション */}
                      <radialGradient id="g-tl" cx={PX} cy={PY} r={GR} gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FFB84D" stopOpacity="0.38" />
                        <stop offset="65%" stopColor="#FFB84D" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#FFB84D" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="g-tr" cx={PX + IW} cy={PY} r={GR} gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FF3D78" stopOpacity="0.38" />
                        <stop offset="65%" stopColor="#FF3D78" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#FF3D78" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="g-bl" cx={PX} cy={PY + IH} r={GR} gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#1ECFB0" stopOpacity="0.38" />
                        <stop offset="65%" stopColor="#1ECFB0" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#1ECFB0" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="g-br" cx={PX + IW} cy={PY + IH} r={GR} gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#5868FF" stopOpacity="0.38" />
                        <stop offset="65%" stopColor="#5868FF" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#5868FF" stopOpacity="0" />
                      </radialGradient>
                      {/* 矢印マーカー */}
                      <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5"
                        markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="#1A1A2E" />
                      </marker>
                    </defs>

                    {/* 背景 */}
                    <rect x={PX} y={PY} width={IW} height={IH} rx="14" fill="white" />
                    <rect x={PX} y={PY} width={IW} height={IH} rx="14" fill="url(#g-tl)" />
                    <rect x={PX} y={PY} width={IW} height={IH} rx="14" fill="url(#g-tr)" />
                    <rect x={PX} y={PY} width={IW} height={IH} rx="14" fill="url(#g-bl)" />
                    <rect x={PX} y={PY} width={IW} height={IH} rx="14" fill="url(#g-br)" />
                    <rect x={PX} y={PY} width={IW} height={IH} rx="14" fill="none" stroke="#D8D5D0" strokeWidth="1" />

                    {/* サブグリッド */}
                    {[0.25, 0.75].map((t) => (
                      <g key={t}>
                        <line x1={PX + t * IW} y1={PY + 2} x2={PX + t * IW} y2={PY + IH - 2}
                          stroke="rgba(0,0,0,0.07)" strokeWidth="1" strokeDasharray="3 4" />
                        <line x1={PX + 2} y1={PY + t * IH} x2={PX + IW - 2} y2={PY + t * IH}
                          stroke="rgba(0,0,0,0.07)" strokeWidth="1" strokeDasharray="3 4" />
                      </g>
                    ))}

                    {/* 中央軸 */}
                    <line x1={PX + 10} y1={CY} x2={PX + IW - 10} y2={CY}
                      stroke="#1A1A2E" strokeWidth="2.5"
                      markerStart="url(#arr)" markerEnd="url(#arr)" />
                    <line x1={CX} y1={PY + IH - 10} x2={CX} y2={PY + 10}
                      stroke="#1A1A2E" strokeWidth="2.5"
                      markerStart="url(#arr)" markerEnd="url(#arr)" />

                    {/* 軸ラベル */}
                    <text x={CX} y={PY + 14} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1A1A2E">イメージ重視</text>
                    <text x={CX} y={PY + IH - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1A1A2E">根拠重視</text>
                    <text x={PX + 14} y={CY - 9} textAnchor="start" fontSize="13" fontWeight="700" fill="#1A1A2E">傾聴型</text>
                    <text x={PX + IW - 14} y={CY - 9} textAnchor="end" fontSize="13" fontWeight="700" fill="#1A1A2E">提案型</text>

                    {/* 象限タイプ名（縦書き・ホバーで説明表示） */}
                    {QUADRANT_DEFS.map((q) => (
                      <text
                        key={q.key}
                        x={q.tx} y={q.ty}
                        textAnchor={q.anchor}
                        fontSize="15" fontWeight="700" fill={q.color}
                        style={{
                          writingMode: 'vertical-rl',
                          cursor: 'default',
                          userSelect: 'none',
                        }}
                        onMouseEnter={() => setHoveredQ(q.key)}
                        onMouseLeave={() => setHoveredQ(null)}
                      >
                        {q.label}
                      </text>
                    ))}

                    {/* ── 営業ドット（重なり表現含む） ── */}
                    {visibleAgents.map((a) => {
                      const posKey = `${Math.round(a.sx)},${Math.round(a.sy)}`
                      const group = overlapMap.get(posKey) ?? [a]
                      const isPrimary = group[0].id === a.id

                      const isSelected = selectedId === a.id
                      const isHovered  = hoverId === a.id
                      const isFaded    = (selectedId !== null || hoverId !== null) && !isSelected && !isHovered
                      const isActive   = isSelected || isHovered

                      return (
                        <g key={a.id}>
                          {/* 重なりがある場合：背後にずれた丸（プライマリのみ描画） */}
                          {isPrimary && group.length > 1 && group.slice(1, 3).map((other, gi) => {
                            const [dx, dy] = STACK_OFFSETS[gi]
                            return (
                              <circle key={`stack-${other.id}`}
                                cx={a.sx + dx} cy={a.sy + dy} r={R}
                                fill={other.sc}
                                opacity={isFaded ? 0.06 : 0.38}
                                style={{ pointerEvents: 'none', transition: 'opacity 0.18s' }}
                              />
                            )
                          })}

                          {/* ホバーリング */}
                          {isActive && (
                            <circle cx={a.sx} cy={a.sy} r={R + 7} fill={a.sc} opacity="0.15"
                              style={{ pointerEvents: 'none' }} />
                          )}

                          {/* メイン円 */}
                          <circle
                            cx={a.sx} cy={a.sy} r={R}
                            fill={isFaded ? '#C8C4C0' : a.sc}
                            opacity={isFaded ? 0.22 : 1}
                            style={{ transition: 'all 0.18s ease', cursor: 'pointer' }}
                            onClick={() => handleDot(a.id)}
                            onMouseEnter={() => showCluster(a.id)}
                            onMouseLeave={() => hideCluster()}
                          />

                          {/* 番号 */}
                          <text
                            x={a.sx} y={a.sy}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize="10" fontWeight="800" fill="white"
                            opacity={isFaded ? 0.22 : 1}
                            style={{ pointerEvents: 'none', transition: 'opacity 0.18s', userSelect: 'none' }}
                          >
                            {a.num}
                          </text>

                          {/* お気に入りマーク */}
                          {a.isFavorited && (
                            <text x={a.sx + R - 2} y={a.sy - R + 2}
                              fontSize="8" textAnchor="middle" dominantBaseline="central"
                              fill="#F43F5E" opacity={isFaded ? 0.22 : 1}
                              style={{ pointerEvents: 'none', transition: 'opacity 0.18s' }}>
                              ♥
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {/* ── クラスター吹き出し ── */}
                    {clusterCenter && clusterAgents.length >= 2 && (() => {
                      const PW = 172, rowH = 26, padV = 10
                      const PH = padV * 2 + clusterAgents.length * rowH
                      const AH = 9
                      const pcx = Math.max(PX + PW / 2, Math.min(clusterCenter.x, PX + IW - PW / 2))
                      const above = clusterCenter.y - R - AH - PH > PY + 10
                      const bx = pcx - PW / 2
                      const by = above ? clusterCenter.y - R - AH - PH : clusterCenter.y + R + AH
                      const ax = clusterCenter.x
                      return (
                        <g style={{ cursor: 'default' }} onMouseEnter={onPopoverEnter} onMouseLeave={hideCluster}>
                          {above ? (
                            <polygon points={`${ax},${clusterCenter.y - R - 2} ${ax - 7},${by + PH} ${ax + 7},${by + PH}`}
                              fill="white" stroke="#E7E5E4" strokeWidth="1" />
                          ) : (
                            <polygon points={`${ax},${clusterCenter.y + R + 2} ${ax - 7},${by} ${ax + 7},${by}`}
                              fill="white" stroke="#E7E5E4" strokeWidth="1" />
                          )}
                          <rect x={bx} y={by} width={PW} height={PH} rx="9"
                            fill="white" stroke="#E7E5E4" strokeWidth="1"
                            style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.13))' }} />
                          {clusterAgents.map((a, i) => {
                            const ry = by + padV + i * rowH + rowH / 2
                            const nameStr = a.displayName.length > 12 ? a.displayName.slice(0, 11) + '…' : a.displayName
                            return (
                              <g key={a.id} style={{ cursor: 'pointer' }}
                                onClick={() => { handleDot(a.id); setClusterAgents([]); setClusterCenter(null) }}>
                                <rect x={bx + 1} y={by + padV + i * rowH} width={PW - 2} height={rowH} fill="transparent" />
                                <circle cx={bx + 20} cy={ry} r={9} fill={a.sc} />
                                <text x={bx + 20} y={ry} textAnchor="middle" dominantBaseline="central"
                                  fontSize="8" fontWeight="800" fill="white"
                                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
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

                    {/* ── あなたの好み（⭐） ── */}
                    {buyerStyle && (
                      <g style={{ pointerEvents: 'none' }}>
                        <circle cx={mx(buyerStyle.lp)} cy={my(buyerStyle.nf)} r={R + 5}
                          fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="3 2" opacity="0.7" />
                        <text x={mx(buyerStyle.lp)} y={my(buyerStyle.nf)}
                          textAnchor="middle" dominantBaseline="central" fontSize="15">⭐</text>
                        <text x={mx(buyerStyle.lp)} y={my(buyerStyle.nf) + R + 12}
                          textAnchor="middle" fontSize="8.5" fill="#92400E">あなた</text>
                      </g>
                    )}

                    {/* ── 象限ツールチップ（ドットより前面に表示） ── */}
                    {hqDef && (() => {
                      const PAD = 9
                      const tx = hqDef.ttx, ty = hqDef.tty
                      return (
                        <g style={{ pointerEvents: 'none' }}>
                          <rect x={tx} y={ty} width={TT_W} height={TT_H} rx="7"
                            fill="rgba(15,15,35,0.87)" />
                          {hqDef.desc.map((line, i) => (
                            <text key={i} x={tx + PAD} y={ty + PAD + 10 + i * 17}
                              fontSize="9.5" fill="rgba(255,255,255,0.92)"
                              style={{ userSelect: 'none' }}>
                              {line}
                            </text>
                          ))}
                        </g>
                      )
                    })()}
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
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style={{ backgroundColor: selected.sc }}>{selected.num}</span>
                      {selected.isFavorited && (
                        <span className="text-xs bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full border border-rose-100">♥</span>
                      )}
                      {selected.isVerified && (
                        <span
                          className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full cursor-help"
                          title="登録メールのドメインが、選択された会社の登録ドメインと一致しています。本人性・現在の在籍をERABERUが保証するものではありません。"
                        >
                          ✓ 会社ドメイン一致
                        </span>
                      )}
                    </div>
                    <button onClick={() => setSelectedId(null)} className="text-stone-300 hover:text-stone-500 transition text-xl leading-none">×</button>
                  </div>

                  <p className="font-bold text-stone-800 leading-tight text-base">{selected.displayName}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{selected.company}</p>
                  {selected.dept && <p className="text-xs text-stone-400">{selected.dept}</p>}

                  {/* タイプバッジ（象限色を使用） */}
                  {(() => {
                    const qDef = QUADRANT_DEFS.find((q) => q.key === quadrantKey(selected.lp, selected.nf)) ?? QUADRANT_DEFS[3]
                    return (
                      <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: hexAlpha(qDef.color, 0.08) }}>
                        <p className="font-bold" style={{ color: qDef.color }}>{qDef.label}</p>
                        <p className="text-stone-500 mt-1 leading-relaxed">{qDef.desc.join('')}</p>
                      </div>
                    )
                  })()}

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
                          {[1, 2, 3, 4, 5, 6].map((v) => (
                            <div key={v} className="flex-1 h-1.5 rounded-full"
                              style={{ backgroundColor: v <= self ? selected.sc : '#E7E5E4' }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 得意分野 */}
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
                    const d = Math.hypot(selected.lp - buyerStyle.lp, selected.nf - buyerStyle.nf)
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
                    {[1, 2, 3, 4, 5, 6].map((v) => (
                      <button key={v} onClick={() => set(v)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${val === v ? 'bg-orange-500 text-white border-orange-500' : 'bg-stone-50 text-stone-400 border-stone-200 hover:border-orange-300'}`}>
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
