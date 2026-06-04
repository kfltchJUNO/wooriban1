'use client'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/firebase/firebaseConfig'
import { useAuth } from '@/lib/auth/authContext'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

export default function Header() {
  const { appUser } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/login')
  }

  const displayInfo = () => {
    if (!appUser) return null
    if (appUser.role === 'student') {
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">닉네임:</span>
          <span className="font-bold">{appUser.nickname}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400 text-xs">{appUser.nameKr}</span>
        </div>
      )
    }
    // 선생님·관리자
    return (
      <span className="text-sm font-bold text-gray-700">
        [{formatSchool(appUser.schoolId)}] [{formatSemester(appUser.semester)}] [{formatClass(appUser.classId)}] {appUser.nameKr} 선생님
      </span>
    )
  }

  return (
    <header className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50 shadow-sm">
      <div className="font-['Syne'] font-extrabold text-xl text-indigo-600">
        우리반<span className="text-orange-500">.</span>
      </div>
      <div className="flex items-center gap-3">
        {displayInfo()}
        {appUser?.role === 'admin' && (
          <button onClick={() => router.push('/admin')} className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-bold">
            ⚙️ 관리
          </button>
        )}
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
          로그아웃
        </button>
      </div>
    </header>
  )
}
