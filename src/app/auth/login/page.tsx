'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const supabase = createClient()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('メールアドレスまたはパスワードが正しくありません')
      } else {
        router.push('/')
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError('登録に失敗しました。もう一度お試しください')
      } else {
        setMessage('確認メールを送信しました。メールを確認してください。')
      }
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-stone-100">
      {/* ヘッダー */}
      <header className="bg-gray-900 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-baseline gap-2">
          <Link href="/" className="text-2xl font-black text-white tracking-tight">ERABERU</Link>
          <span className="text-xs text-gray-400">営業マンの通知表サイト</span>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {mode === 'login' ? 'ログイン' : 'アカウント作成'}
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          {mode === 'login'
            ? '営業マンへのオファーにはログインが必要です'
            : '無料でアカウントを作成できます'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="example@mail.com"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">パスワード</label>
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
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition text-sm"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : 'アカウントを作成'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition mt-6"
        >
          {mode === 'login' ? 'アカウントをお持ちでない方はこちら →' : 'すでにアカウントをお持ちの方はこちら →'}
        </button>
      </div>
    </main>
  )
}
