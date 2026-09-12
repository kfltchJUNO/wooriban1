'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/authContext'
import { Role } from '@/types/user'

interface RoleGuardProps {
  allowedRoles: Role[]
  children: React.ReactNode
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { appUser, firebaseUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    // 로그인 안 되어 있으면 로그인 페이지로
    if (!firebaseUser) { router.replace('/login'); return }
    // firebaseUser는 있는데 appUser 프로필 로딩 중이면 대기
    if (!appUser) return
    if (appUser.status === 'pending') { router.replace('/pending'); return }
    if (!allowedRoles.includes(appUser.role)) {
      router.replace(`/${appUser.role}`)
    }
  }, [appUser, firebaseUser, loading, allowedRoles, router])

  if (loading || !appUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5FF]">
        <div className="text-indigo-600 font-bold text-lg animate-pulse">우리반 로딩 중...</div>
      </div>
    )
  }
  return <>{children}</>
}
