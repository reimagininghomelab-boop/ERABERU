'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const ADMIN_EMAILS = ['reimagining.home.lab@gmail.com', '1989yo55@gmail.com']

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
    <header className="bg-white border-b border-stone-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 md:px-6">

        {/* PC: シングルロウ */}
        <div className="hidden md:flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              {backButton && (
                <button
                  onClick={() => router.back()}
                  className="text-gray-400 hover:text-gray-600 transition text-sm"
                >
                  ← 戻る
                </button>
              )}
              <Link href="/" className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-teal-600 tracking-tight">ERABERU</span>
                <span className="text-xs text-gray-400 hidden lg:block">住宅営業を探す</span>
              </Link>
            </div>
            <nav className="flex items-center gap-0.5">
              <Link
                href="/#search"
                className="text-sm text-gray-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition"
              >
                営業を探す
              </Link>
              <Link
                href="/#ai-search"
                className="text-sm text-gray-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition"
              >
                AIに相談
              </Link>
              <Link
                href="/#about"
                className="text-sm text-gray-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition"
              >
                はじめての方へ
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/salesperson/register"
              className="text-xs text-gray-400 hover:text-gray-600 transition hidden lg:block"
            >
              営業マンとして登録
            </Link>
            {user ? (
              <>
                {ADMIN_EMAILS.includes(user.email ?? '') && (
                  <Link href="/admin" className="text-xs text-orange-500 hover:text-orange-400 font-medium transition">
                    管理
                  </Link>
                )}
                <Link
                  href="/salesperson/dashboard"
                  className="text-sm text-gray-700 hover:text-teal-600 px-3 py-1.5 rounded-lg border border-stone-200 hover:border-teal-200 transition"
                >
                  マイページ
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  ログアウト
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="text-sm text-teal-600 hover:text-teal-500 font-semibold px-4 py-1.5 rounded-lg border border-teal-200 hover:bg-teal-50 transition"
              >
                ログイン
              </Link>
            )}
          </div>
        </div>

        {/* モバイル: 2行レイアウト */}
        <div className="md:hidden">
          {/* 1行目: ロゴ + ログイン */}
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-2">
              {backButton && (
                <button onClick={() => router.back()} className="text-gray-400 text-sm">
                  ← 戻る
                </button>
              )}
              <Link href="/" className="flex items-baseline gap-1">
                <span className="text-lg font-black text-teal-600 tracking-tight">ERABERU</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  {ADMIN_EMAILS.includes(user.email ?? '') && (
                    <Link href="/admin" className="text-xs text-orange-500 font-medium">
                      管理
                    </Link>
                  )}
                  <Link
                    href="/salesperson/dashboard"
                    className="text-xs text-gray-600 border border-stone-200 px-2.5 py-1 rounded-lg"
                  >
                    マイページ
                  </Link>
                </>
              ) : (
                <Link
                  href="/auth/login"
                  className="text-xs text-teal-600 font-semibold px-3 py-1 rounded-lg border border-teal-200 bg-teal-50"
                >
                  ログイン
                </Link>
              )}
            </div>
          </div>
          {/* 2行目: ナビ */}
          <div className="flex items-center gap-0 pb-2 -mx-1 overflow-x-auto">
            <Link
              href="/#search"
              className="text-xs text-gray-600 whitespace-nowrap px-3 py-1 rounded-lg hover:bg-stone-100 transition"
            >
              営業を探す
            </Link>
            <Link
              href="/#ai-search"
              className="text-xs text-gray-600 whitespace-nowrap px-3 py-1 rounded-lg hover:bg-stone-100 transition"
            >
              AIに相談
            </Link>
            <Link
              href="/#about"
              className="text-xs text-gray-600 whitespace-nowrap px-3 py-1 rounded-lg hover:bg-stone-100 transition"
            >
              はじめての方へ
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
