'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'
import type { User } from '@supabase/supabase-js'

const MEETING_STATUSES = ['契約前', '契約後', '建築中', '引渡し済'] as const

const SALES_STYLE_AXES = [
  { key: 'listening_proposing', left: '傾聴型', right: '提案型' },
  { key: 'numbers_feeling', left: '数字で説明', right: '感覚で説明' },
]
const SUPABASE_FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

export default function SalespersonDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [agent, setAgent] = useState<any>(null)
  const [unlockedData, setUnlockedData] = useState<any>(null)
  const [user, setUser] = useState<User | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [reviews, setReviews] = useState<any[]>([])
  const [reviewStats, setReviewStats] = useState<{ total: number; approved: number; rate: number | null } | null>(null)
  const [formRating, setFormRating] = useState(0)
  const [formContent, setFormContent] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formMeetingStatus, setFormMeetingStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)

  const fetchReviews = async (supabase: ReturnType<typeof createClient>, currentUserId: string) => {
    const { data } = await supabase
      .from('contract_reviews')
      .select('id, rating, contract_price, content, created_at, meeting_status, is_approved, user_id')
      .eq('salesperson_id', id)
      .order('created_at', { ascending: false })
    if (data) {
      setReviews(data)
      const own = data.find((r: any) => r.user_id === currentUserId)
      if (own) {
        setFormRating(own.rating ?? 0)
        setFormContent(own.content ?? '')
        setFormPrice(own.contract_price ? String(own.contract_price / 10000) : '')
        setFormMeetingStatus(own.meeting_status ?? '')
      }
    }
  }

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

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

      const { data: publicData } = await supabase
        .from('safe_salesperson_profiles')
        .select('*')
        .eq('id', id)
        .single()
      if (publicData) setAgent(publicData)

      const { data: stats } = await supabase.rpc('get_salesperson_review_stats', { p_salesperson_id: id })
      if (stats) setReviewStats(stats)

      if (user) {
        const { data: full } = await supabase
          .from('salesperson_profiles')
          .select('real_name, family_name, given_name, bio, contract_count')
          .eq('id', id)
          .single()
        if (full) {
          setUnlockedData(full)
          await fetchReviews(supabase, user.id)
        }

        const { data: fav } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('salesperson_id', id)
          .maybeSingle()
        setIsFavorited(!!fav)
      }
    }

    load()
  }, [id])

  const handleFavoriteToggle = async () => {
    if (!user || favoriteLoading) return
    setFavoriteLoading(true)
    const supabase = createClient()
    if (isFavorited) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('salesperson_id', id)
      setIsFavorited(false)
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, salesperson_id: id })
      setIsFavorited(true)
    }
    setFavoriteLoading(false)
  }

  const handleOffer = async () => {
    if (!user) return
    setPaying(true)
    setPayError('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ salesperson_id: id, user_id: user.id }),
      })
      const { url, error } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        console.error(error)
        setPayError('決済ページへの遷移に失敗しました。もう一度お試しください。')
      }
    } catch (e) {
      console.error(e)
      setPayError('通信エラーが発生しました。')
    } finally {
      setPaying(false)
    }
  }

  const handleReviewSubmit = async () => {
    if (formRating === 0 || !formContent.trim() || !user) return
    setSubmitting(true)
    setSubmitError('')
    setSubmitDone(false)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('contract_reviews').upsert(
        {
          salesperson_id: id,
          user_id: user.id,
          rating: formRating,
          content: formContent.trim(),
          contract_price: formPrice ? parseInt(formPrice) * 10000 : null,
          meeting_status: formMeetingStatus || null,
          is_approved: false,
        },
        { onConflict: 'user_id,salesperson_id' }
      )
      if (error) throw error
      await fetchReviews(supabase, user.id)
      const { data: stats } = await supabase.rpc('get_salesperson_review_stats', { p_salesperson_id: id })
      if (stats) setReviewStats(stats)
      setSubmitDone(true)
    } catch (e) {
      console.error(e)
      setSubmitError('投稿に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (!agent) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
      読み込み中...
    </div>
  )

  const ownReview = reviews.find((r) => r.user_id === user?.id)
  const otherApprovedReviews = reviews.filter((r) => r.user_id !== user?.id && r.is_approved)

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
            <div className="flex flex-col items-end gap-2">
              {agent.is_verified && (
                <span className="text-sm bg-blue-100 text-blue-600 font-medium px-3 py-1 rounded-full">✓ 本人確認済み</span>
              )}
              {user && (
                <button
                  onClick={handleFavoriteToggle}
                  disabled={favoriteLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    isFavorited
                      ? 'bg-rose-50 text-rose-500 border-rose-200 hover:bg-rose-100'
                      : 'bg-stone-50 text-stone-400 border-stone-200 hover:border-rose-200 hover:text-rose-400'
                  }`}
                >
                  <span>{isFavorited ? '♥' : '♡'}</span>
                  <span>{isFavorited ? 'お気に入り済み' : 'お気に入り'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-xs text-gray-400 mb-1">会社名</p>
              <p className="text-gray-800 font-semibold">{agent.company_name}</p>
              {agent.department && (
                <p className="text-xs text-gray-500 mt-0.5">{agent.department}</p>
              )}
            </div>
            {(agent.core_city || (agent.available_prefectures ?? []).length > 0) && (
              <div>
                <p className="text-xs text-gray-400 mb-1">活動エリア</p>
                {agent.core_city && (
                  <p className="text-gray-800 text-sm mb-1">📍 コアエリア: {agent.core_city}</p>
                )}
                {(agent.available_prefectures ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {agent.available_prefectures.map((p: string) => (
                      <span key={p} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(agent.specialty_styles ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">得意分野</p>
                <div className="flex flex-wrap gap-2">
                  {agent.specialty_styles.map((s: string) => (
                    <span key={s} className="text-sm bg-orange-50 text-orange-500 px-3 py-1 rounded-full border border-orange-100">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(agent.qualifications ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">所持資格</p>
                <div className="flex flex-wrap gap-2">
                  {agent.qualifications.map((q: string) => (
                    <span key={q} className="text-sm bg-blue-50 text-blue-500 px-3 py-1 rounded-full border border-blue-100">{q}</span>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              const styles: Record<string, number> = agent.sales_styles ?? {}
              const hasStyles = SALES_STYLE_AXES.some(({ key }) => styles[key] !== undefined)
              if (!hasStyles) return null
              return (
                <div>
                  <p className="text-xs text-gray-400 mb-3">会話スタイル</p>
                  <div className="space-y-3">
                    {SALES_STYLE_AXES.map(({ key, left, right }) => {
                      const val = styles[key] ?? 3
                      const pct = ((val - 1) / 4) * 100
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-xs text-stone-400 mb-2">
                            <span>{left}</span>
                            <span>{right}</span>
                          </div>
                          <div className="relative h-5 flex items-center">
                            <div className="absolute inset-x-0 h-1.5 rounded-full bg-stone-200" />
                            <div
                              className="absolute text-orange-400 leading-none -translate-x-1/2 text-base"
                              style={{ left: `${pct}%` }}
                            >★</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* 口コミ公開率（開示前でも表示） */}
            {reviewStats && (
              <div className="pt-3 border-t border-stone-100">
                <p className="text-xs text-gray-400 mb-1">口コミ公開率</p>
                {reviewStats.total === 0 ? (
                  <p className="text-sm text-gray-400">口コミなし</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-stone-200 rounded-full h-2">
                      <div
                        className="bg-green-400 h-2 rounded-full transition-all"
                        style={{ width: `${reviewStats.rate ?? 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {reviewStats.rate ?? 0}%
                    </span>
                    <span className="text-xs text-gray-400">
                      （{reviewStats.approved}/{reviewStats.total}件承認）
                    </span>
                  </div>
                )}
              </div>
            )}
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
                <p className="text-gray-800 font-semibold">
                  {unlockedData.family_name && unlockedData.given_name
                    ? `${unlockedData.family_name} ${unlockedData.given_name}`
                    : unlockedData.real_name}
                </p>
              </div>
              {unlockedData.bio && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">自己紹介</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{unlockedData.bio}</p>
                </div>
              )}
              <div className="flex gap-6">
                {unlockedData.contract_count !== null && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">累計成約数</p>
                    <p className="text-gray-800 font-semibold">{unlockedData.contract_count}棟</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 口コミ一覧 */}
          <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-6">
            <p className="text-sm font-bold text-gray-700 mb-4">口コミ</p>

            {/* 自分の口コミ（承認状況付き） */}
            {ownReview && (
              <div className="mb-4 p-4 rounded-xl border border-dashed border-orange-200 bg-orange-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-orange-600">あなたの口コミ</p>
                  {ownReview.is_approved
                    ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">公開中</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">確認中</span>
                  }
                </div>
                {ownReview.rating && (
                  <p className="text-sm text-amber-400 mb-1">
                    {'★'.repeat(ownReview.rating)}{'☆'.repeat(5 - ownReview.rating)}
                  </p>
                )}
                {ownReview.meeting_status && (
                  <p className="text-xs text-gray-400 mb-1">📋 {ownReview.meeting_status}</p>
                )}
                {ownReview.contract_price && (
                  <p className="text-xs text-gray-400 mb-1">
                    成約価格: {(ownReview.contract_price / 10000).toLocaleString()}万円
                  </p>
                )}
                <p className="text-sm text-gray-700 leading-relaxed">{ownReview.content}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(ownReview.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
            )}

            {/* 他ユーザーの承認済み口コミ */}
            {otherApprovedReviews.length === 0 && !ownReview && (
              <p className="text-sm text-gray-400">まだ口コミがありません</p>
            )}
            {otherApprovedReviews.length > 0 && (
              <div className="space-y-4">
                {otherApprovedReviews.map((r, i) => (
                  <div key={i} className="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
                    {r.rating && (
                      <p className="text-sm text-amber-400 mb-1">
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </p>
                    )}
                    {r.meeting_status && (
                      <p className="text-xs text-gray-400 mb-1">📋 {r.meeting_status}</p>
                    )}
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

            {/* 投稿フォーム */}
            <div className="mt-6 pt-6 border-t border-stone-200">
              <p className="text-sm font-bold text-gray-700 mb-1">
                {ownReview ? '口コミを更新する' : '口コミを投稿する'}
              </p>
              {ownReview && (
                <p className="text-xs text-gray-400 mb-3">更新すると再度確認が必要になります</p>
              )}
              {submitDone && (
                <p className="text-sm text-green-600 mb-3">投稿しました。確認後に公開されます。</p>
              )}
              {submitError && (
                <p className="text-sm text-red-500 mb-3">{submitError}</p>
              )}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-2">評価 <span className="text-red-400">*</span></p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setFormRating(star)}
                        className={`text-2xl transition ${star <= formRating ? 'text-amber-400' : 'text-gray-300'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">打ち合わせ状況（任意）</p>
                  <div className="flex flex-wrap gap-2">
                    {MEETING_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setFormMeetingStatus(formMeetingStatus === s ? '' : s)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition ${
                          formMeetingStatus === s
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-500 border-stone-200 hover:border-orange-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">コメント <span className="text-red-400">*</span></p>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="この営業マンの対応はいかがでしたか？"
                    rows={4}
                    className="w-full text-sm border border-stone-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">成約価格（任意）</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      placeholder="例: 3500"
                      className="w-40 text-sm border border-stone-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <span className="text-sm text-gray-500">万円</span>
                  </div>
                </div>
                <button
                  onClick={handleReviewSubmit}
                  disabled={formRating === 0 || !formContent.trim() || submitting}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl transition text-sm"
                >
                  {submitting ? '送信中...' : ownReview ? '口コミを更新する' : '口コミを投稿する'}
                </button>
              </div>
            </div>
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
              {!agent.ai_summary && (
                <span className="text-xs bg-purple-100 text-purple-400 px-2 py-0.5 rounded-full ml-auto">準備中</span>
              )}
            </div>
            {agent.ai_summary ? (() => {
              const ai = agent.ai_summary as { summary: string; goodMatch: string[]; communicationStyle: string; strengths: string[]; caution: string }
              return (
                <div className="space-y-4 text-sm">
                  <p className="text-gray-700 leading-relaxed">{ai.summary}</p>
                  {ai.goodMatch?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1.5">相性が良さそうな施主</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ai.goodMatch.map((m, i) => (
                          <span key={i} className="text-xs bg-purple-50 text-purple-600 border border-purple-100 px-2.5 py-1 rounded-full">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {ai.communicationStyle && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">会話スタイル</p>
                      <p className="text-gray-600 leading-relaxed">{ai.communicationStyle}</p>
                    </div>
                  )}
                  {ai.strengths?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1.5">強み</p>
                      <ul className="space-y-1">
                        {ai.strengths.map((s, i) => (
                          <li key={i} className="text-gray-600 flex items-start gap-1.5"><span className="text-purple-400 mt-0.5">・</span>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ai.caution && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                      <p className="text-xs font-medium text-amber-600 mb-1">確認しておきたい点</p>
                      <p className="text-amber-700 leading-relaxed">{ai.caution}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-300 pt-1">※ プロフィール情報をもとにAIが生成した紹介文です</p>
                </div>
              )
            })() : (
              <p className="text-sm text-gray-400 leading-relaxed">
                口コミ・自己紹介・実績をもとにAIが生成した紹介文がここに表示されます。
              </p>
            )}
          </div>
          </>
        )}

        {/* CTAエリア */}
        {!unlockedData && (
          <div className="bg-gray-900 rounded-2xl p-6">
            <p className="text-white font-bold text-base mb-1">この営業マンにオファーする</p>
            <p className="text-gray-400 text-xs mb-4">受諾後に実名・連絡先・詳細プロフィールが開示されます</p>
            {payError && <p className="text-red-400 text-xs mb-3">{payError}</p>}
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
