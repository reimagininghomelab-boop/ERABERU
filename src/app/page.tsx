'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

export default function Home() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [agents, setAgents] = useState<any[]>([])
  const [unlockedMap, setUnlockedMap] = useState<Record<string, any>>({})
  const [keyword, setKeyword] = useState('')
  const [filterPrefecture, setFilterPrefecture] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterQualification, setFilterQualification] = useState('')

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
      if (publicData) setAgents(publicData)

      if (user) {
        const { data: unlocked } = await supabase
          .from('salesperson_profiles')
          .select('id, real_name')
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

  if (checking) return (
    <div className="min-h-screen bg-stone-100" />
  )

  return (
    <main className="min-h-screen bg-stone-100">
      <Header />

      {/* ヒーロー */}
      <div className="bg-gray-900 px-6 pb-10 pt-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-2">
            誠実な営業マンを、<br className="sm:hidden" />あなたが選ぶ。
          </h2>
          <p className="text-gray-400 text-sm">
            住宅営業マンのリアルな評価を確認して、信頼できる一人に指名しよう。
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* フィルターエリア */}
        <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4 mb-6 space-y-3">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="会社名・名前で検索"
            className="w-full text-sm border border-stone-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={filterPrefecture}
              onChange={(e) => setFilterPrefecture(e.target.value)}
              className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            >
              <option value="">エリア（すべて）</option>
              {prefectures.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={filterSpecialty}
              onChange={(e) => setFilterSpecialty(e.target.value)}
              className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            >
              <option value="">得意分野（すべて）</option>
              {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterQualification}
              onChange={(e) => setFilterQualification(e.target.value)}
              className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            >
              <option value="">資格（すべて）</option>
              {qualifications.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          {(keyword || filterPrefecture || filterSpecialty || filterQualification) && (
            <button
              onClick={() => { setKeyword(''); setFilterPrefecture(''); setFilterSpecialty(''); setFilterQualification('') }}
              className="text-xs text-orange-500 hover:text-orange-400 transition"
            >
              × 絞り込みをリセット
            </button>
          )}
        </div>

        {/* 件数 */}
        <p className="text-sm text-gray-400 mb-5">
          {filteredAgents.length}人の営業マンが見つかりました
          {filteredAgents.length !== agents.length && <span className="ml-1">（全{agents.length}人中）</span>}
        </p>

        {/* カード一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAgents.map((agent) => (
            <div key={agent.id} className={`rounded-2xl shadow-sm border p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${unlockedMap[agent.id] ? 'bg-green-100 border-green-400' : 'bg-stone-50 border-stone-200'}`}>

              {/* アイコン＋認証バッジ */}
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                  {agent.profile_image_url
                    ? <img src={agent.profile_image_url} alt="" className="w-full h-full object-cover" />
                    : '👤'}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {unlockedMap[agent.id] && (
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-1 rounded-full">🔓 開示済み</span>
                  )}
                </div>
              </div>

              {/* 会社名・匿名ラベル */}
              <p className="text-xs text-gray-400 mb-0.5">{agent.company_name}</p>
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                {unlockedMap[agent.id]?.real_name ?? (agent.name_initials ? `${agent.name_initials} さん` : '---')}
              </h3>

              {/* エリア */}
              {agent.area_prefecture && (
                <p className="text-xs text-gray-500 mb-3">📍 {agent.area_prefecture}</p>
              )}

              {/* 得意分野タグ */}
              {(agent.specialty_styles ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {agent.specialty_styles.slice(0, 2).map((s: string) => (
                    <span key={s} className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full border border-orange-100">
                      {s}
                    </span>
                  ))}
                  {agent.specialty_styles.length > 2 && (
                    <span className="text-xs text-gray-400">+{agent.specialty_styles.length - 2}</span>
                  )}
                </div>
              )}

              {/* AI得意なサポート */}
              {agent.ai_summary?.strengths?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1.5">✨ 得意なサポート</p>
                  <ul className="space-y-0.5">
                    {agent.ai_summary.strengths.slice(0, 2).map((s: string, i: number) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                        <span className="text-purple-400 shrink-0">・</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ボタン */}
              <Link
                href={`/salesperson/${agent.id}`}
                className="block w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl transition text-sm text-center"
              >
                プロフィールを見る
              </Link>
            </div>
          ))}
        </div>

        {/* データなし */}
        {filteredAgents.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-4">👤</p>
            <p>{agents.length === 0 ? '現在登録中の営業マンはいません' : '条件に一致する営業マンが見つかりません'}</p>
          </div>
        )}
      </div>
    </main>
  )
}
