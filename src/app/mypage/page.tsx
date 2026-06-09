'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

const PHASES = [
  { value: 'pre_contract', label: '契約前', icon: '📋', note: 'QRコードから投稿' },
  { value: 'post_contract', label: '契約後', icon: '✍️' },
  { value: 'after_start', label: '着工後', icon: '🏗️' },
  { value: 'after_handover', label: '引渡後', icon: '🏠' },
] as const

type PhaseValue = typeof PHASES[number]['value']

type Review = {
  id: string
  salesperson_id: string
  phase: PhaseValue
  rating: number | null
  content: string
  status: string
  created_at: string
}

type Salesperson = {
  id: string
  company_name: string
  name_initials: string | null
  profile_image_url: string | null
}

type SalespersonGroup = {
  salesperson: Salesperson
  submittedPhases: PhaseValue[]
  availablePhases: { value: PhaseValue; label: string; icon: string }[]
  reviews: Review[]
}

export default function MyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<SalespersonGroup[]>([])
  const [unlockedSalespersonIds, setUnlockedSalespersonIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      // 自分が投稿した口コミ（superseded を除く）
      const { data: myReviews } = await supabase
        .from('anonymous_reviews')
        .select('id, salesperson_id, phase, rating, content, status, created_at')
        .eq('user_id', user.id)
        .neq('status', 'superseded')
        .order('created_at', { ascending: false })

      // 開示済み営業マンIDを取得
      const { data: unlocked } = await supabase
        .from('unlocked_profiles')
        .select('agent_id')
        .eq('buyer_id', user.id)
      const unlockedIds = new Set((unlocked ?? []).map((u: any) => u.agent_id as string))
      setUnlockedSalespersonIds(unlockedIds)

      if (!myReviews || myReviews.length === 0) { setLoading(false); return }

      // 対象の営業マン情報を取得
      const spIds = [...new Set(myReviews.map((r) => r.salesperson_id))]
      const { data: salespeople } = await supabase
        .from('safe_salesperson_profiles')
        .select('id, company_name, name_initials, profile_image_url')
        .in('id', spIds)

      const spMap: Record<string, Salesperson> = {}
      ;(salespeople ?? []).forEach((sp: Salesperson) => { spMap[sp.id] = sp })

      // 営業マンごとにグループ化
      const groupMap: Record<string, Review[]> = {}
      myReviews.forEach((r: Review) => {
        if (!groupMap[r.salesperson_id]) groupMap[r.salesperson_id] = []
        groupMap[r.salesperson_id].push(r)
      })

      const writablePhases = PHASES.filter((p) => p.value !== 'pre_contract')

      const result: SalespersonGroup[] = spIds
        .filter((id) => spMap[id])
        .map((id) => {
          const reviews = groupMap[id] ?? []
          const submittedPhases = reviews.map((r) => r.phase)
          const availablePhases = writablePhases
            .filter((p) => !submittedPhases.includes(p.value))
            .map((p) => ({ value: p.value, label: p.label, icon: p.icon ?? '' }))
          return { salesperson: spMap[id], submittedPhases, availablePhases, reviews }
        })

      setGroups(result)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">読み込み中...</div>

  return (
    <main className="min-h-screen bg-stone-100">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">マイページ</h1>
          <p className="text-xs text-gray-500 mt-1">投稿済み口コミの確認と追加投稿ができます</p>
        </div>

        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center space-y-3">
            <p className="text-3xl">📋</p>
            <p className="text-sm font-bold text-gray-600">まだ口コミを投稿していません</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              担当営業から受け取ったQRコードを読み取るか、<br />
              担当営業のプロフィールページから口コミを投稿できます。
            </p>
            <Link href="/search" className="inline-block mt-2 text-sm text-teal-600 hover:underline">
              営業マンを探す →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ salesperson, submittedPhases, availablePhases, reviews }) => {
              const isUnlocked = unlockedSalespersonIds.has(salesperson.id)
              const displayName = salesperson.name_initials ? `${salesperson.name_initials} さん` : '---'

              return (
                <div key={salesperson.id} className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
                  {/* 営業マン情報 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-100 flex items-center justify-center shrink-0">
                        {isUnlocked && salesperson.profile_image_url
                          ? <img src={salesperson.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-2xl">👤</span>}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{salesperson.company_name}</p>
                        <p className="text-sm font-bold text-gray-800">{displayName}</p>
                      </div>
                    </div>
                    <Link
                      href={`/salesperson/${salesperson.id}`}
                      className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition"
                    >
                      プロフィールへ
                    </Link>
                  </div>

                  {/* 投稿済みフェーズ */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500">投稿済み口コミ</p>
                    {reviews.map((r) => {
                      const phase = PHASES.find((p) => p.value === r.phase)
                      return (
                        <div key={r.id} className="bg-stone-50 rounded-xl border border-stone-100 p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs bg-white border border-stone-200 text-stone-600 px-2 py-0.5 rounded-full">
                              {phase?.icon} {phase?.label ?? r.phase}
                            </span>
                            {r.status === 'visible'
                              ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">公開中</span>
                              : r.status === 'hidden'
                              ? <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">非表示</span>
                              : <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">確認待ち</span>
                            }
                          </div>
                          {r.rating && (
                            <p className="text-xs text-amber-400 mb-1">
                              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                            </p>
                          )}
                          <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{r.content}</p>
                          <p className="text-xs text-gray-400 mt-1.5">
                            {new Date(r.created_at).toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {/* 追加投稿できるフェーズ */}
                  {availablePhases.length > 0 && (
                    <div className="pt-3 border-t border-stone-100 space-y-2">
                      <p className="text-xs font-bold text-gray-500">追加で投稿できるフェーズ</p>
                      {availablePhases.map((p) => (
                        <Link
                          key={p.value}
                          href={`/review/write/${salesperson.id}`}
                          className="flex items-center justify-between px-4 py-3 rounded-xl border border-teal-100 bg-teal-50 hover:bg-teal-100 transition"
                        >
                          <span className="text-sm text-teal-700 font-medium">
                            {p.icon} {p.label}の口コミを投稿する
                          </span>
                          <span className="text-teal-500 text-sm">→</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {availablePhases.length === 0 && (
                    <div className="pt-3 border-t border-stone-100">
                      <p className="text-xs text-gray-400 text-center">すべてのフェーズの口コミを投稿済みです ✓</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 口コミについて */}
        <div className="bg-stone-50 rounded-xl border border-stone-200 px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-bold text-gray-600">口コミ投稿について：</span>
            契約前の口コミは営業担当から受け取ったQRコードから投稿できます。
            契約後・着工後・引渡後の口コミはこのページまたは営業プロフィールページから投稿できます。
          </p>
        </div>
      </div>
    </main>
  )
}
