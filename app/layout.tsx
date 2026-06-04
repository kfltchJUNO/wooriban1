import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/auth/authContext'
import './globals.css'

export const metadata: Metadata = {
  title: '우리반 — Wooriban',
  description: '한국어 교실을 더 가깝게',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
