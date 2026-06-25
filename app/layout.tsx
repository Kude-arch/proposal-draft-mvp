import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '제안서 초안 자동생성',
  description: '건설사업관리 용역 제안서 초안 자동생성 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
          <a href="/" className="text-blue-600 font-bold text-lg">
            제안서 자동생성
          </a>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500 text-sm">미래사업팀</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
