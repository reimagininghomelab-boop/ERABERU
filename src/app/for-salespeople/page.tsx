'use client'
import { useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const REGISTER_URL = '/salesperson/register'

const BENEFITS = [
  {
    icon: '👤',
    title: '自分の営業スタイルで見つけてもらえる',
    body: '会社名や肩書だけではなく、提案方法、得意分野、会話スタイルなどを見てもらえます。',
  },
  {
    icon: '🤝',
    title: '相性の合う施主と出会うきっかけになる',
    body: '考え方や希望が近い施主から相談を受けるための、新しい顧客接点をつくれます。',
  },
  {
    icon: '💬',
    title: '日々の対応が信頼として積み上がる',
    body: '売上実績だけでは見えにくい、説明の丁寧さや向き合い方を口コミやプロフィールを通じて伝えられます。',
  },
]

const STEPS = [
  {
    num: '1',
    title: 'アカウントを作成',
    body: 'メールアドレスとパスワードで登録します。',
  },
  {
    num: '2',
    title: '営業プロフィールを入力',
    body: '得意分野、活動エリア、自己紹介文などを入力します。',
  },
  {
    num: '3',
    title: 'メールアドレスの確認',
    body: '確認メールのリンクをクリックして認証を完了させます。',
  },
  {
    num: '4',
    title: 'プロフィールが公開される',
    body: '会社ドメインが一致した場合は即時公開。それ以外は審査後に公開されます。',
  },
]

const FAQS = [
  {
    q: '登録に費用はかかりますか？',
    a: '営業担当者としての登録・掲載に費用はかかりません。施主がプロフィールの詳細を閲覧する際に¥1,000の費用が発生しますが、これは施主側の負担です。',
  },
  {
    q: '会社に確認の連絡が届きますか？',
    a: '会社に直接通知が届くことはありません。ただし、登録に使用したメールアドレスのドメインと、選択した会社の登録ドメインを照合する仕組みがあります。会社のメールアドレスで登録した場合、ドメイン一致として「会社ドメイン一致」バッジが表示されます。',
  },
  {
    q: '個人情報はどこまで公開されますか？',
    a: '無料で閲覧できる範囲では、名前のイニシャル・勤務先会社名・活動エリア・得意分野・自己紹介文が表示されます。施主が¥1,000でプロフィールを詳細閲覧した場合のみ、実名・連絡先などが開示されます。',
  },
  {
    q: '退職・異動した場合はどうなりますか？',
    a: 'プロフィールはダッシュボードからいつでも公開停止できます。退職・異動に伴う所属情報の変更については、登録情報を更新するか、運営へお問い合わせください。',
  },
  {
    q: '口コミは営業本人が削除できますか？',
    a: '口コミを営業本人が直接削除することはできません。内容に問題があると感じた場合は、運営窓口にご連絡ください。不適切と判断された口コミについては、運営が非表示対応を行います。',
  },
  {
    q: '施主から直接連絡が来ますか？',
    a: '施主がプロフィールの詳細閲覧（¥1,000）を行った後、連絡先情報が開示されます。その後は施主の判断で連絡が来る仕組みです。ERABERUが間に入って連絡を取り次ぐ機能はありません。',
  },
]

function Accordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-stone-50 focus-visible:bg-stone-50 focus-visible:outline-none transition-colors"
      >
        <span className="text-sm font-medium text-gray-700">{q}</span>
        <span
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-stone-100">
          <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

function CtaButton({ white = false }: { white?: boolean }) {
  const base =
    'inline-block font-bold px-8 py-4 rounded-xl transition-colors text-sm focus-visible:outline-none min-w-[220px] text-center'
  const color = white
    ? 'bg-white text-teal-700 hover:bg-teal-50 focus-visible:bg-teal-50'
    : 'bg-teal-600 text-white hover:bg-teal-500 focus-visible:bg-teal-500'
  return (
    <Link href={REGISTER_URL} className={`${base} ${color}`}>
      営業プロフィールを登録する
    </Link>
  )
}

export default function ForSalespersonPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#faf7f4]">
      <Header />
      <main className="flex-1">

        {/* ─── 1. ファーストビュー ─── */}
        <section className="bg-gradient-to-b from-teal-700 to-teal-600 text-white px-6 py-16 md:py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl md:text-4xl font-black leading-tight mb-5">
              あなたの営業スタイルを、<br className="md:hidden" />
              必要としている施主へ。
            </h1>
            <p className="text-sm md:text-base text-teal-100 leading-relaxed mb-8 max-w-lg mx-auto">
              ERABERUは、会社名や売上順位だけではなく、考え方や対応スタイルから住宅営業担当者を探せるサービスです。
            </p>
            <CtaButton white />
            <p className="text-xs text-teal-200 mt-3">
              登録内容は後から編集できます。登録だけで費用はかかりません。
            </p>
          </div>
        </section>

        {/* ─── 2. 課題 ─── */}
        <section className="px-6 py-14 md:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black text-gray-700 mb-8 text-center">
              営業担当者の強みは、会社名だけでは伝わりません。
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                '会社を先に選び、担当者は後から決まることが多い。',
                '自分の提案スタイルや得意な対応を伝える場所が少ない。',
                '相性が合うか分からないまま商談が始まることも多い。',
              ].map((text) => (
                <div
                  key={text}
                  className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm"
                >
                  <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 3. メリット ─── */}
        <section className="bg-teal-50 px-6 py-14 md:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black text-gray-700 mb-8 text-center">
              ERABERUで伝えられること
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm"
                >
                  <div className="text-3xl mb-3" aria-hidden="true">{b.icon}</div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 leading-snug">{b.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
            {/* CTA 2 */}
            <div className="mt-10 text-center">
              <CtaButton />
              <p className="text-xs text-gray-400 mt-3">登録内容は後から編集できます。</p>
            </div>
          </div>
        </section>

        {/* ─── 4. しないこと ─── */}
        <section className="px-6 py-14 md:py-20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black text-gray-700 mb-8 text-center">
              営業担当者を、単純に順位付けするサービスではありません。
            </h2>
            <ul className="space-y-3">
              {[
                '売上ランキングを作りません。',
                '星の数だけで営業担当者を比較しません。',
                '営業本人の許可なく、連絡先を全面公開しません。',
                '登録しただけで本人性や現在の在籍をERABERUが保証することはありません。',
                '口コミだけを根拠に、一方的な評価を確定しません。',
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 bg-white border border-stone-200 rounded-xl px-5 py-4"
                >
                  <span className="text-teal-500 font-bold mt-0.5 flex-shrink-0" aria-hidden="true">✓</span>
                  <span className="text-sm text-gray-600">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── 5. 登録後の流れ ─── */}
        <section className="bg-stone-100 px-6 py-14 md:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black text-gray-700 mb-8 text-center">
              登録から相談を受け取るまで
            </h2>
            <div className="grid gap-4 md:grid-cols-4">
              {STEPS.map((step) => (
                <div
                  key={step.num}
                  className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm text-center"
                >
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white text-sm font-bold flex items-center justify-center mx-auto mb-3">
                    {step.num}
                  </div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2">{step.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 6. FAQ ─── */}
        <section className="px-6 py-14 md:py-20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-black text-gray-700 mb-8 text-center">
              登録前によくあるご質問
            </h2>
            <div className="space-y-3">
              {FAQS.map((faq) => (
                <Accordion key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── 7. 最終CTA ─── */}
        <section className="bg-teal-700 text-white px-6 py-16 md:py-24">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl font-black mb-6 leading-snug">
              自分の営業スタイルを、<br className="md:hidden" />
              プロフィールに登録してみませんか。
            </h2>
            <CtaButton white />
            <p className="text-xs text-teal-200 mt-3">登録内容は後から編集できます。</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-teal-300">
              <Link
                href="/terms"
                className="hover:text-white focus-visible:text-white focus-visible:outline-none transition-colors"
              >
                利用規約
              </Link>
              <Link
                href="/privacy"
                className="hover:text-white focus-visible:text-white focus-visible:outline-none transition-colors"
              >
                プライバシーポリシー
              </Link>
              <Link
                href="/commercial-transactions"
                className="hover:text-white focus-visible:text-white focus-visible:outline-none transition-colors"
              >
                特定商取引法に基づく表記
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
