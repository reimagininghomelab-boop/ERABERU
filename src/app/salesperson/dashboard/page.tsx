'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'
import { QRCodeSVG } from 'qrcode.react'

const SALES_STYLE_AXES = [
  { key: 'listening_proposing', left: '傾聴型', right: '提案型' },
  { key: 'numbers_feeling', left: '数字で説明', right: '感覚で説明' },
]

export default function SalespersonDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [qrToken, setQrToken] = useState<string>('')
  const [qrReissuing, setQrReissuing] = useState(false)
  const [qrCopied, setQrCopied] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/login')
        return
      }

      const { data: ownProfile } = await supabase
        .from('salesperson_profiles')
        .select('*, companies(name)')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!ownProfile) {
        router.replace('/')
        return
      }

      setProfile(ownProfile)
      setQrToken(ownProfile.qr_token ?? '')

      const { data: reviewData } = await supabase
        .from('contract_reviews')
        .select('id, rating, content, meeting_status, contract_price, is_approved, created_at')
        .eq('salesperson_id', ownProfile.id)
        .order('created_at', { ascending: false })

      if (reviewData) setReviews(reviewData)
      setLoading(false)
    }

    load()
  }, [])

  const handleReissueQr = async () => {
    if (!profile || qrReissuing) return
    if (!confirm('QRコードを再発行すると、以前のQRコードからの投稿ができなくなります。続けますか？')) return
    setQrReissuing(true)
    try {
      const newToken = crypto.randomUUID()
      const supabase = createClient()
      const { error } = await supabase
        .from('salesperson_profiles')
        .update({ qr_token: newToken })
        .eq('id', profile.id)
      if (!error) setQrToken(newToken)
    } catch {
      // silent
    } finally {
      setQrReissuing(false)
    }
  }

  const handleCopyQrUrl = async () => {
    const url = `${window.location.origin}/review/${qrToken}`
    await navigator.clipboard.writeText(url)
    setQrCopied(true)
    setTimeout(() => setQrCopied(false), 2000)
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-gray-400">
      読み込み中...
    </div>
  )

  if (!profile) return null

  const approvedReviews = reviews.filter((r) => r.is_approved)
  const pendingReviews = reviews.filter((r) => !r.is_approved)
  const avgRating = approvedReviews.length > 0
    ? (approvedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / approvedReviews.length).toFixed(1)
    : null

  const displayName = profile.family_name && profile.given_name
    ? `${profile.family_name} ${profile.given_name}`
    : profile.real_name

  const salesStyles: Record<string, number> = profile.sales_styles ?? {}
  const hasSalesStyles = SALES_STYLE_AXES.some(({ key }) => salesStyles[key] !== undefined)

  return (
    <main className="min-h-screen bg-stone-100">
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        {/* ステータスバナー */}
        {profile.status === 'pending' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <p className="text-sm font-semibold text-amber-700">審査中</p>
            <p className="text-xs text-amber-600 mt-0.5">プロフィールは管理者の承認後に公開されます</p>
          </div>
        )}
        {profile.status === 'suspended' && (
          <div className="bg-gray-100 border border-gray-300 rounded-2xl px-5 py-4">
            <p className="text-sm font-semibold text-gray-600">一時停止中</p>
            <p className="text-xs text-gray-500 mt-0.5">現在プロフィールは非公開です。詳細は運営にお問い合わせください。</p>
          </div>
        )}
        {profile.status === 'rejected' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
            <p className="text-sm font-semibold text-red-600">審査否認</p>
            <p className="text-xs text-red-500 mt-0.5">申請が否認されました。詳細は運営にお問い合わせください。</p>
          </div>
        )}

        {/* プロフィールカード */}
        <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-4xl">
              👤
            </div>
            <div className="flex flex-col items-end gap-1">
              {profile.status === 'active' && <span className="text-sm bg-green-100 text-green-700 font-medium px-3 py-1 rounded-full">✓ 公開中</span>}
              {profile.status === 'pending' && <span className="text-sm bg-amber-100 text-amber-600 px-3 py-1 rounded-full">審査中</span>}
              {profile.status === 'suspended' && <span className="text-sm bg-gray-100 text-gray-500 px-3 py-1 rounded-full">一時停止</span>}
              {profile.status === 'rejected' && <span className="text-sm bg-red-100 text-red-500 px-3 py-1 rounded-full">審査否認</span>}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-xs text-gray-400 mb-1">氏名</p>
              <p className="text-gray-800 font-semibold">{displayName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">会社名</p>
              <p className="text-gray-800 font-semibold">{(profile.companies as any)?.name ?? profile.company_name}</p>
            </div>
            {profile.department && (
              <div>
                <p className="text-xs text-gray-400 mb-1">所属詳細</p>
                <p className="text-gray-800">{profile.department}</p>
              </div>
            )}
            {(profile.core_city || (profile.available_prefectures ?? []).length > 0) && (
              <div>
                <p className="text-xs text-gray-400 mb-1">活動エリア</p>
                {profile.core_city && (
                  <p className="text-gray-800 text-sm mb-1">📍 コアエリア: {profile.core_city}</p>
                )}
                {(profile.available_prefectures ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {profile.available_prefectures.map((p: string) => (
                      <span key={p} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(profile.specialty_styles ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">得意分野</p>
                <div className="flex flex-wrap gap-2">
                  {profile.specialty_styles.map((s: string) => (
                    <span key={s} className="text-sm bg-orange-50 text-orange-500 px-3 py-1 rounded-full border border-orange-100">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(profile.qualifications ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">所持資格</p>
                <div className="flex flex-wrap gap-2">
                  {profile.qualifications.map((q: string) => (
                    <span key={q} className="text-sm bg-blue-50 text-blue-500 px-3 py-1 rounded-full border border-blue-100">{q}</span>
                  ))}
                </div>
              </div>
            )}
            {hasSalesStyles && (
              <div>
                <p className="text-xs text-gray-400 mb-3">会話スタイル</p>
                <div className="space-y-3">
                  {SALES_STYLE_AXES.map(({ key, left, right }) => {
                    const val = salesStyles[key] ?? 3
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
            )}
            {profile.bio && (
              <div>
                <p className="text-xs text-gray-400 mb-1">自己紹介</p>
                <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
              </div>
            )}
          </div>
        </div>

        {/* 口コミQRコード */}
        {profile.status === 'active' && qrToken && (
          <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-gray-700">口コミ用QRコード</p>
                <p className="text-xs text-gray-400 mt-0.5">お客様に読み取ってもらうと、会員登録なしで口コミを投稿できます</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                <QRCodeSVG
                  value={`${typeof window !== 'undefined' ? window.location.origin : 'https://eigyo-no-tsuchihyo.vercel.app'}/review/${qrToken}`}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#1c1917"
                />
              </div>
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleCopyQrUrl}
                  className="flex-1 text-sm border border-stone-300 text-gray-600 hover:bg-stone-100 font-medium py-2.5 rounded-xl transition"
                >
                  {qrCopied ? '✓ コピー済み' : 'URLをコピー'}
                </button>
                <button
                  onClick={handleReissueQr}
                  disabled={qrReissuing}
                  className="flex-1 text-sm border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 font-medium py-2.5 rounded-xl transition"
                >
                  {qrReissuing ? '再発行中...' : 'QRを再発行'}
                </button>
              </div>
              <p className="text-xs text-gray-300 text-center">
                再発行すると以前のQRコードは無効になります
              </p>
            </div>
          </div>
        )}

        {/* 口コミ統計 */}
        <div className="bg-stone-50 rounded-2xl shadow-sm border border-stone-200 p-6">
          <p className="text-sm font-bold text-gray-700 mb-4">受け取った口コミ</p>
          <div className="flex gap-6 mb-5">
            <div className="text-center">
              <p className="text-2xl font-black text-gray-800">{approvedReviews.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">公開中</p>
            </div>
            {pendingReviews.length > 0 && (
              <div className="text-center">
                <p className="text-2xl font-black text-amber-500">{pendingReviews.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">確認中</p>
              </div>
            )}
            {avgRating && (
              <div className="text-center">
                <p className="text-2xl font-black text-amber-400">★ {avgRating}</p>
                <p className="text-xs text-gray-400 mt-0.5">平均評価</p>
              </div>
            )}
          </div>

          {approvedReviews.length === 0 ? (
            <p className="text-sm text-gray-400">まだ口コミはありません</p>
          ) : (
            <div className="space-y-4">
              {approvedReviews.map((r) => (
                <div key={r.id} className="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
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
        </div>

      </div>
    </main>
  )
}
