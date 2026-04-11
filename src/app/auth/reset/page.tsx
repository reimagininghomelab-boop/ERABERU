'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // URLのハッシュからトークンを取得してセッションを設定
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('パスワードの更新に失敗しました')
    } else {
      router.push('/')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-stone-100">
      <header className="bg-gray-900 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-baseline gap-2">
          <Link href="/" className="text-2xl font-black text-white tracking-tight">ERABERU</Link>
          <span className="text-xs text-gray-400">営業マンの通知表サイト</span>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">パスワード再設定</h2>
        <p className="text-sm text-gray-500 mb-8">新しいパスワードを入力してください</p>

        {ready ? (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">新しいパスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="6文字以上"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition text-sm"
            >
              {loading ? '更新中...' : 'パスワードを更新する'}
            </button>
          </form>
        ) : (
          <p className="text-gray-400 text-sm">リンクを確認中...</p>
        )}
      </div>
    </main>
  )
}
