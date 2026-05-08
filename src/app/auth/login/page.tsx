'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
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
        setError(error.message)
      } else {
        router.push('/')
      }
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage('登録完了です。ログインモードに切り替えてログインしてください。')
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('パスワードリセット用のメールを送信しました。')
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
          {mode === 'login' ? 'ログイン' : mode === 'signup' ? 'アカウント作成' : 'パスワードをお忘れですか？'}
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          {mode === 'login'
            ? '営業マンへのオファーにはログインが必要です'
            : mode === 'signup'
            ? '無料でアカウントを作成できます'
            : 'メールアドレスを入力するとリセット用のリンクを送信します'}
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

          {mode !== 'reset' && (
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
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition text-sm"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'signup' ? 'アカウントを作成' : 'リセットメールを送る'}
          </button>
        </form>

        {mode === 'login' && (
          <button
            onClick={() => { setMode('reset'); setError(''); setMessage('') }}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition mt-4"
          >
            パスワードをお忘れの方はこちら
          </button>
        )}
        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition mt-3"
        >
          {mode === 'login' ? 'アカウントをお持ちでない方はこちら →' : 'ログインはこちら →'}
        </button>
      </div>
    </main>
  )
}
