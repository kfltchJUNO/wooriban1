'use client'
// app/researcher/page.tsx
// 연구용 계정 로그인 후 이동하는 페이지. 지금은 자리표시 화면이고,
// 추후 연구용 과제 생성 / 연구 분석용 AI 설정 등이 여기 추가될 예정.

import RoleGuard from '@/components/auth/RoleGuard'
import Header from '@/components/layout/Header'
import { useAuth } from '@/lib/auth/authContext'

export default function ResearcherPage() {
  const { appUser } = useAuth()

  return (
    <RoleGuard allowedRoles={['researcher', 'admin']}>
      <div className="min-h-screen bg-[#F5F5FF]">
        <Header />
        <main className="max-w-[680px] mx-auto px-5 py-10">
          <div className="bg-white rounded-2xl p-8 shadow-md text-center">
            <div className="text-4xl mb-4">🔬</div>
            <h1 className="font-bold text-xl mb-2">연구자 대시보드</h1>
            <p className="text-sm text-gray-500 mb-1">
              {appUser?.nameKr}님, 환영합니다.
            </p>
            <p className="text-xs text-gray-400 mt-4">
              연구용 과제 생성, 분석용 AI 설정 등의 기능이 곧 추가될 예정이에요.
            </p>
          </div>
        </main>
      </div>
    </RoleGuard>
  )
}