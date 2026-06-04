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
  const { appUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!appUser) { router.replace('/login'); return }
    if (appUser.status === 'pending') { router.replace('/pending'); return }
    if (!allowedRoles.includes(appUser.role)) {
      router.replace(`/${appUser.role}`)
    }
  }, [appUser, loading, allowedRoles, router])

  if (loading || !appUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5FF]">
        <div className="text-indigo-600 font-bold text-lg animate-pulse">우리반 로딩 중...</div>
      </div>
    )
  }
  return <>{children}</>
}
