'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

// ─── 相性診断データ ────────────────────────────────────────────────
const QUIZ = [
  {
    question: '家づくりで一番不安なことは？',
    options: [
      { label: '何から決めればいいかわからない', lp: -1, nf: -1 },
      { label: '予算オーバーが怖い', lp: 1, nf: -1 },
      { label: '営業に押されるのが苦手', lp: -1, nf: 1 },
      { label: '間取りやデザインをしっかり相談したい', lp: 1, nf: 1 },
    ],
  },
  {
    question: '営業にはどんな関わり方をしてほしい？',
    options: [
      { label: 'じっくり話を聞いてほしい', lp: -1, nf: 1 },
      { label: '選択肢を整理してほしい', lp: -1, nf: -1 },
      { label: 'プロとして提案してほしい', lp: 1, nf: 1 },
      { label: 'メリット・デメリットをはっきり言ってほしい', lp: 1, nf: -1 },
    ],
  },
  {
    question: 'あなたに近いタイプは？',
    options: [
      { label: '慎重に比較したい', lp: -1, nf: -1 },
      { label: '感覚や雰囲気も大事にしたい', lp: -1, nf: 1 },
      { label: '数字や根拠を見て判断したい', lp: 1, nf: -1 },
      { label: 'まずは全体像をつかみたい', lp: 1, nf: 1 },
    ],
  },
]

type StyleResult = {
  label: string
  description: string
  searchParam: string
}

const STYLE_RESULTS: Record<string, StyleResult> = {
  'L+N': {
    label: '整理伴走タイプ',
    description: '数字や条件を丁寧に整理しながら、あなたの考えを引き出してくれる営業。不安を一つずつ解消していくのが得意で、慎重に比較したい方に向いています。',
    searchParam: 'organize-support',
  },
  'L+F': {
    label: '共感伴走タイプ',
    description: '気持ちや理想の暮らしに寄り添いながら、安心して話を進めてくれる営業。あなたのペースで、希望や不安をじっくり聞いてくれます。',
    searchParam: 'empathy-support',
  },
  'P+N': {
    label: '戦略提案タイプ',
    description: '根拠や比較をもとに、判断しやすい提案をしてくれる営業。データや事実を大切にしながら、最適な選択肢をはっきり提示してくれます。',
    searchParam: 'strategy-proposal',
  },
  'P+F': {
    label: '感性提案タイプ',
    description: '暮らしのイメージやデザインの方向性を広げる提案をしてくれる営業。理想の暮らしを一緒に描きながら、あなたの感性に寄り添ってくれます。',
    searchParam: 'sensibility-proposal',
  },
}

function getResultKey(lp: number, nf: number): string {
  return `${lp <= 0 ? 'L' : 'P'}+${nf <= 0 ? 'N' : 'F'}`
}

// ─── 相性診断コンポーネント ────────────────────────────────────────
function StyleQuiz() {
  const [step, setStep] = useState(0)
  const [scores, setScores] = useState({ lp: 0, nf: 0 })
  const [result, setResult] = useState<StyleResult | null>(null)

  const handleAnswer = (lp: number, nf: number) => {
    const newScores = { lp: scores.lp + lp, nf: scores.nf + nf }
    setScores(newScores)
    const nextStep = step + 1
    if (nextStep > QUIZ.length) {
      setResult(STYLE_RESULTS[getResultKey(newScores.lp, newScores.nf)])
    }
    setStep(nextStep)
  }

  const reset = () => { setStep(0); setScores({ lp: 0, nf: 0 }); setResult(null) }

  if (step === 0) {
    return (
      <div className="text-center space-y-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          まだ登録しなくても大丈夫です。<br />
          3つの質問に答えると、相性の良さそうな営業タイプがわかります。
        </p>
        <button
          onClick={() => setStep(1)}
          className="bg-teal-500 hover:bg-teal-400 text-white font-bold px-8 py-3.5 rounded-xl text-sm transition shadow-sm"
        >
          相性診断をはじめる（3問）
        </button>
        <p className="text-xs text-gray-400">登録不要・無料</p>
      </div>
    )
  }

  if (step <= QUIZ.length) {
    const q = QUIZ[step - 1]
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 mb-1">
          {QUIZ.map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i < step ? 'bg-teal-500' : 'bg-stone-200'}`} />
          ))}
        </div>
        <p className="text-sm font-bold text-gray-800">Q{step}. {q.question}</p>
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(opt.lp, opt.nf)}
              className="w-full text-left px-4 py-3.5 rounded-xl border border-stone-200 bg-white hover:border-teal-400 hover:bg-teal-50 text-sm text-gray-700 transition font-medium"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 transition">← 最初からやり直す</button>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="space-y-5">
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6 text-center">
        <p className="text-xs text-teal-600 font-bold mb-2 tracking-wide">あなたに合いそうな営業タイプ</p>
        <p className="text-2xl font-black text-teal-700 mb-4">{result.label}</p>
        <p className="text-sm text-gray-600 leading-relaxed text-left">{result.description}</p>
      </div>
      <p className="text-xs text-gray-400 text-center leading-relaxed">
        ※ 簡易的な相性診断です。実際には口コミや自己紹介をもとにご判断ください。
      </p>
      <div className="space-y-2">
        <Link
          href={`/search?style=${result.searchParam}`}
          className="block w-full bg-teal-500 hover:bg-teal-400 text-white font-bold py-4 rounded-xl text-sm text-center transition shadow-sm"
        >
          このタイプの営業を探してみる →
        </Link>
        <button onClick={reset} className="block w-full text-gray-400 hover:text-gray-600 text-sm py-2 transition">
          もう一度診断する
        </button>
      </div>
    </div>
  )
}

// ─── TOPページ ────────────────────────────────────────────────────
export default function TopPage() {
  const router = useRouter()

  useEffect(() => {
    // メールリンクのハッシュリダイレクト処理
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      window.location.href = '/auth/reset' + hash
      return
    }
    if (hash.includes('type=signup')) {
      window.location.href = '/salesperson/register' + hash
      return
    }

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('salesperson_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile) router.replace('/salesperson/dashboard')
        })
    })
  }, [router])

  return (
    <main className="min-h-screen bg-stone-50">
      <Header />

      {/* ヒーロー */}
      <section className="bg-gradient-to-b from-teal-700 to-teal-600 px-6 py-14 md:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-teal-200 text-xs font-bold mb-4 tracking-widest uppercase">ERABERU</p>
          <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-5">
            会社ではなく、<br className="md:hidden" />
            担当者を選ぶ。
          </h1>
          <p className="text-teal-100 text-sm md:text-base leading-relaxed mb-8 max-w-lg mx-auto">
            同じ会社でも、担当者が変わると家づくりの体験はまったく変わります。<br />
            ERABERUは口コミ・対応スタイル・得意分野をもとに、
            自分に合う住宅営業を探せるサービスです。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/search"
              className="bg-white text-teal-700 font-bold px-8 py-4 rounded-xl hover:bg-teal-50 transition text-sm shadow-md"
            >
              営業を探してみる
            </Link>
            <Link
              href="/search?ai=1"
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-4 rounded-xl transition text-sm shadow-md"
            >
              ✨ AIに相談して探す
            </Link>
          </div>
        </div>
      </section>

      {/* 3つの特徴 */}
      <section className="max-w-4xl mx-auto px-4 md:px-6 py-14">
        <h2 className="text-center text-xl md:text-2xl font-black text-gray-800 mb-8">
          追客される前に、比較できる。
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: '💬',
              title: '口コミで比較',
              desc: '家づくりを経験した人たちの声をもとに、対応スタイルや実際の評判を確認できます。',
            },
            {
              icon: '🎯',
              title: '相性で探す',
              desc: '「傾聴型か提案型か」「数字派か感覚派か」など、自分に合ったコミュニケーションスタイルで絞り込めます。',
            },
            {
              icon: '🔒',
              title: '施主からオファー',
              desc: '気に入った営業にだけ施主側からアクションできます。押し売りされる前に比較が完了します。',
            },
          ].map((item) => (
            <div key={item.title} className="bg-white rounded-2xl border border-stone-200 p-6">
              <span className="text-3xl block mb-3">{item.icon}</span>
              <h3 className="text-sm font-bold text-gray-800 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 相性診断 */}
      <section className="max-w-md mx-auto px-4 md:px-6 pb-14">
        <div className="bg-white rounded-2xl border border-stone-200 p-6 md:p-8 shadow-sm">
          <div className="text-center mb-6">
            <span className="inline-block bg-amber-50 text-amber-600 text-xs font-bold px-3 py-1 rounded-full mb-3 tracking-wide">
              相性診断
            </span>
            <h2 className="text-lg font-black text-gray-800">
              あなたに合いそうな<br />営業タイプを見てみる
            </h2>
          </div>
          <StyleQuiz />
        </div>
      </section>

      {/* フッターCTA */}
      <section className="bg-teal-700 px-6 py-14 text-center">
        <p className="text-white font-black text-xl md:text-2xl mb-3">まずは、探してみよう。</p>
        <p className="text-teal-200 text-sm mb-6">登録なしで口コミ・スタイル傾向を確認できます。</p>
        <Link
          href="/search"
          className="inline-block bg-white text-teal-700 font-bold px-8 py-4 rounded-xl hover:bg-teal-50 transition text-sm shadow-md"
        >
          営業を探してみる →
        </Link>
      </section>

      <Footer />
    </main>
  )
}
