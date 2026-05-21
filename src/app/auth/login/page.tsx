'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromQr = searchParams.get('from') === 'qr'
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login'

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [qrLinked, setQrLinked] = useState(false)

  // QR経由ログイン後: 口コミ紐づけ＋本サイトリンク表示
  useEffect(() => {
    if (!fromQr) return
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN') && session?.access_token) {
        try {
          await fetch('/api/review/link-to-user', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        } catch {
          // 紐づけ失敗してもログイン自体は成功扱い
        }
        setQrLinked(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [fromQr])

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
      } else if (!fromQr) {
        router.push('/')
      }
      // fromQr の場合は onAuthStateChange が SIGNED_IN を拾って qrLinked = true にする
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

  // QR経由でログイン成功後: 紐づけ完了 → 本サイトリンクを表示
  if (fromQr && qrLinked) {
    return (
      <main className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center space-y-2">
          <span className="text-5xl block mb-2">🎉</span>
          <p className="text-lg font-bold text-gray-700">ログイン完了！</p>
          <p className="text-sm text-gray-400">
            口コミがアカウントに紐づけられました。
          </p>
        </div>
        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            ERABERUでは口コミをもとに住宅営業マンを比較・検索できます。
          </p>
          <a
            href="/"
            className="block w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition text-sm text-center"
          >
            ERABERUで営業マンを探す
          </a>
        </div>
      </main>
    )
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
        {fromQr && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <p className="text-xs text-orange-700 leading-relaxed">
              ERABERUに登録・ログインすると、投稿した口コミがアカウントに紐づけられます。
            </p>
          </div>
        )}

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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
