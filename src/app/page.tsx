'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'

export default function Home() {
  const [agents, setAgents] = useState<any[]>([])
  const [unlockedMap, setUnlockedMap] = useState<Record<string, any>>({})

  useEffect(() => {
    const supabase = createClient()

    // パスワードリセットのリンクでトップに来た場合にリダイレクト
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/auth/reset'
      }
    })

    const load = async () => {
      const { data: publicData } = await supabase.from('safe_salesperson_profiles').select('*')
      if (publicData) setAgents(publicData)

      const { data: { user } } = await supabase.auth.getUser()
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
    }

    load()
  }, [])

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
        {/* 件数 */}
        <p className="text-sm text-gray-400 mb-5">{agents.length}人の営業マンが登録中</p>

        {/* カード一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent, index) => (
            <div key={agent.id} className={`rounded-2xl shadow-sm border p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${unlockedMap[agent.id] ? 'bg-green-100 border-green-400' : 'bg-stone-50 border-stone-200'}`}>

              {/* アイコン＋認証バッジ */}
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-2xl">
                  👤
                </div>
                <div className="flex flex-col items-end gap-1">
                  {unlockedMap[agent.id] && (
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-1 rounded-full">🔓 開示済み</span>
                  )}
                  {agent.is_verified
                    ? <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-1 rounded-full">✓ 認証済み</span>
                    : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-1 rounded-full">未認証</span>
                  }
                </div>
              </div>

              {/* 会社名・匿名ラベル */}
              <p className="text-xs text-gray-400 mb-0.5">{agent.company_name}</p>
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                {unlockedMap[agent.id]?.real_name ?? `営業マン ${String.fromCharCode(65 + index)}`}
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
        {agents.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-4">👤</p>
            <p>現在登録中の営業マンはいません</p>
          </div>
        )}
      </div>
    </main>
  )
}
