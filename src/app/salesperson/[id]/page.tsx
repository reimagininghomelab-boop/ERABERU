'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'
import type { User } from '@supabase/supabase-js'

export default function SalespersonDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [agent, setAgent] = useState<any>(null)
  const [unlockedData, setUnlockedData] = useState<any>(null)
  const [user, setUser] = useState<User | null>(null)
  const [paying, setPaying] = useState(false)
  const [reviews, setReviews] = useState<any[]>([])

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      // 公開情報を取得
      const { data: publicData } = await supabase
        .from('safe_salesperson_profiles')
        .select('*')
        .eq('id', id)
        .single()
      if (publicData) setAgent(publicData)

      // ログイン済みなら開示済みデータも取得（RLSで許可された場合のみ返る）
      if (user) {
        const { data: full } = await supabase
          .from('salesperson_profiles')
          .select('real_name, bio, experience_years, contract_count')
          .eq('id', id)
          .single()
        if (full) {
          setUnlockedData(full)
          const { data: reviewData } = await supabase
            .from('contract_reviews')
            .select('contract_price, content, created_at')
            .eq('salesperson_id', id)
            .order('created_at', { ascending: false })
          if (reviewData) setReviews(reviewData)
        }
      }
    }

    load()
  }, [id])

  const handleOffer = async () => {
    if (!user) return
    setPaying(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      'https://jydawtmlshofviszztbu.supabase.co/functions/v1/create-checkout-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ salesperson_id: id, user_id: user.id }),
      }
    )
    const { url, error } = await res.json()
    if (url) {
      window.location.href = url
    } else {
      console.error(error)
      setPaying(false)
    }
  }

  if (!agent) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
      読み込み中...
    </div>
  )

  return (
    <main className="min-h-screen bg-stone-100">
      <Header backButton />

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        {/* プロフィールカード */}
        <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-4xl">
              👤
            </div>
            {agent.is_verified
              ? <span className="text-sm bg-green-100 text-green-700 font-medium px-3 py-1 rounded-full">✓ 認証済み</span>
              : <span className="text-sm bg-gray-100 text-gray-400 px-3 py-1 rounded-full">未認証</span>
            }
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-xs text-gray-400 mb-1">会社名</p>
              <p className="text-gray-800 font-semibold">{agent.company_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">エリア</p>
              <p className="text-gray-800 font-semibold">📍 {agent.area_prefecture ?? '未設定'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">得意分野</p>
              <div className="flex flex-wrap gap-2">
                {(agent.specialty_styles ?? []).length > 0
                  ? agent.specialty_styles.map((s: string) => (
                      <span key={s} className="text-sm bg-orange-50 text-orange-500 px-3 py-1 rounded-full border border-orange-100">{s}</span>
                    ))
                  : <p className="text-gray-400 text-sm">未設定</p>
                }
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">所持資格</p>
              <div className="flex flex-wrap gap-2">
                {(agent.qualifications ?? []).length > 0
                  ? agent.qualifications.map((q: string) => (
                      <span key={q} className="text-sm bg-blue-50 text-blue-500 px-3 py-1 rounded-full border border-blue-100">{q}</span>
                    ))
                  : <p className="text-gray-400 text-sm">未設定</p>
                }
              </div>
            </div>
          </div>
        </div>

        {/* 開示済み or ロック */}
        {unlockedData ? (
          <>
          <div className="bg-stone-50 rounded-2xl shadow-sm border border-green-200 p-8">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-green-600">🔓</span>
              <p className="text-sm font-bold text-green-600">開示済み情報</p>
            </div>
            <div className="space-y-5">
              <div>
                <p className="text-xs text-gray-400 mb-1">実名</p>
                <p className="text-gray-800 font-semibold">{unlockedData.real_name}</p>
              </div>
              {unlockedData.bio && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">自己紹介</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{unlockedData.bio}</p>
                </div>
              )}
              <div className="flex gap-6">
                {unlockedData.experience_years && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">経験年数</p>
                    <p className="text-gray-800 font-semibold">{unlockedData.experience_years}年</p>
                  </div>
                )}
                {unlockedData.contract_count !== null && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">累計成約数</p>
                    <p className="text-gray-800 font-semibold">{unlockedData.contract_count}棟</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-6">
            <p className="text-sm font-bold text-gray-700 mb-4">口コミ</p>
            {reviews.length === 0 ? (
              <p className="text-sm text-gray-400">まだ口コミがありません</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((r, i) => (
                  <div key={i} className="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
                    {r.contract_price && (
                      <p className="text-xs text-gray-400 mb-1">
                        成約価格: {(r.contract_price / 10000).toLocaleString()}万円
                      </p>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{r.content}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(r.created_at).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
        ) : (
          <>
          <div className="bg-stone-50 rounded-2xl shadow-sm border border-dashed border-gray-200 p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-stone-50/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-2">
              <span className="text-3xl">🔒</span>
              <p className="text-sm font-bold text-gray-600">オファー後に開示</p>
            </div>
            <div className="space-y-4 opacity-30 select-none">
              <div>
                <p className="text-xs text-gray-400 mb-1">実名</p>
                <p className="text-gray-800 font-semibold">██ ██</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">自己紹介</p>
                <p className="text-sm text-gray-600">████████████████████████████████████████</p>
                <p className="text-sm text-gray-600 mt-1">████████████████████████</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">経験年数 / 成約数</p>
                <p className="text-sm text-gray-600">██年 / ██棟</p>
              </div>
            </div>
          </div>

          <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-purple-500">✨</span>
              <p className="text-sm font-bold text-purple-600">AIによる紹介文</p>
              <span className="text-xs bg-purple-100 text-purple-400 px-2 py-0.5 rounded-full ml-auto">準備中</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              口コミ・自己紹介・実績をもとにAIが生成した紹介文がここに表示されます。
            </p>
          </div>
          </>
        )}

        {/* CTAエリア */}
        {!unlockedData && (
          <div className="bg-gray-900 rounded-2xl p-6">
            <p className="text-white font-bold text-base mb-1">この営業マンにオファーする</p>
            <p className="text-gray-400 text-xs mb-4">受諾後に実名・連絡先・詳細プロフィールが開示されます</p>
            {user ? (
              <button
                onClick={handleOffer}
                disabled={paying}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl transition text-base"
              >
                {paying ? '決済ページへ移動中...' : '¥1,000 でオファーする'}
              </button>
            ) : (
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full bg-stone-600 hover:bg-stone-500 text-white font-bold py-4 rounded-xl transition text-base"
              >
                ログインしてオファーする
              </button>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
