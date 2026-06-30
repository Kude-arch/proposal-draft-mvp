import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: '제안서 초안 자동생성',
  description: '건설사업관리 용역 제안서 초안 자동생성 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-[#F7F8FA]">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
