import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | ERABERU',
}

const rows: { label: string; value: React.ReactNode }[] = [
  { label: '販売事業者', value: '●●●●' },
  { label: '運営責任者', value: '●●●●' },
  { label: '所在地', value: '●●●●（正式公開前に記載）' },
  { label: '連絡先', value: '●●●●（正式公開前に記載）' },
  {
    label: 'サービス内容',
    value: '営業会員の詳細プロフィール、口コミ、評価その他当運営者が指定する情報の閲覧',
  },
  { label: '販売価格', value: '購入画面に表示（例：¥1,000）' },
  { label: '支払方法', value: 'クレジットカード決済等（購入画面に表示）' },
  { label: '提供時期', value: '決済完了後、直ちに閲覧可能' },
  {
    label: '返品・キャンセル',
    value: (
      <>
        デジタルコンテンツまたはオンライン情報開示の性質上、決済完了後に情報が開示された場合、ユーザー都合によるキャンセル・返金には応じません。
        <br />
        ただし、重複決済、システム障害、当運営者の責めに帰すべき事由により有料開示が提供されなかった場合は、この限りではありません。
      </>
    ),
  },
  { label: '動作環境', value: 'インターネット接続環境、最新の主要ブラウザ（Chrome / Safari / Firefox / Edge 等）' },
]

export default function CommercialTransactionsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-6 py-4">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← トップへ戻る</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">特定商取引法に基づく表記</h1>
        <p className="text-sm text-gray-500 mb-8">
          特定商取引法に基づき、以下の事項を表示します。
        </p>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {rows.map((row, i) => (
            <div
              key={i}
              className={`flex flex-col sm:flex-row ${i < rows.length - 1 ? 'border-b border-gray-200' : ''}`}
            >
              <div className="sm:w-40 shrink-0 bg-gray-50 px-5 py-4">
                <p className="text-xs font-semibold text-gray-600">{row.label}</p>
              </div>
              <div className="flex-1 px-5 py-4">
                <p className="text-sm text-gray-700 leading-relaxed">{row.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-400 space-y-1">
          <p>※ 事業者情報は正式公開前に確定内容へ差し替えてください。</p>
          <div className="flex gap-4 mt-3">
            <Link href="/terms" className="text-teal-600 hover:underline">利用規約</Link>
            <Link href="/privacy" className="text-teal-600 hover:underline">プライバシーポリシー</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
