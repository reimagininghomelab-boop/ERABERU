'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function Header({ backButton = false }: { backButton?: boolean }) {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <header className="bg-gray-900 px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          {backButton && (
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition text-sm">
              ← 戻る
            </button>
          )}
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tracking-tight">ERABERU</span>
            <span className="text-xs text-gray-400">営業マンの通知表サイト</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/salesperson/map"
            className="text-xs text-gray-400 hover:text-white transition hidden sm:block"
          >
            スタイルマップ
          </Link>
          <Link
            href="/salesperson/register"
            className="text-xs text-gray-400 hover:text-white transition hidden sm:block"
          >
            営業マンとして登録
          </Link>
          {user ? (
            <>
              {['reimagining.home.lab@gmail.com', '1989yo55@gmail.com'].includes(user.email ?? '') && (
                <Link href="/admin" className="text-xs text-orange-400 hover:text-orange-300 transition font-medium">
                  管理
                </Link>
              )}
              <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="text-xs text-gray-400 hover:text-white transition"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="text-sm bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-2 rounded-lg transition"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
