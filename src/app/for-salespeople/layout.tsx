import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '営業担当者の方へ | ERABERU',
  description:
    'ERABERUは、住宅営業担当者が自身の提案スタイルや得意分野を伝え、相性の合う施主と出会うきっかけをつくるサービスです。',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
