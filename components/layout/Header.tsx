'use client'
import { useState, useRef, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/firebase/firebaseConfig'
import { useAuth } from '@/lib/auth/authContext'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

export default function Header() {
  const { appUser } = useAuth()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/login')
  }

  // 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayInfo = () => {
    if (!appUser) return null

    if (appUser.role === 'student') {
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">닉네임</span>
          <span className="font-bold">{appUser.nickname}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400 text-xs">{appUser.nameKr}</span>
        </div>
      )
    }

    if (appUser.role === 'admin') {
      return (
        <span className="text-sm font-bold text-gray-700">
          관리자 · {appUser.nameKr}
        </span>
      )
    }

    if (appUser.role === 'researcher') {
      return (
        <span className="text-sm font-bold text-gray-700">
          연구자 · {appUser.nameKr}
        </span>
      )
    }

    // 선생님
    return (
      <span className="text-sm font-bold text-gray-700">
        [{formatSchool(appUser.schoolId)}] [{formatSemester(appUser.semester)}] [{formatClass(appUser.classId)}] {appUser.nameKr} 선생님
      </span>
    )
  }

  const canManage = appUser?.role === 'admin' || appUser?.role === 'researcher'

  return (
    <header className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50 shadow-sm">
      <div className="font-['Syne'] font-extrabold text-xl text-indigo-600">
        우리반<span className="text-orange-500">.</span>
      </div>
      <div className="flex items-center gap-3">
        {displayInfo()}

        {canManage && (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold transition-colors">
              ⚙️ 관리 {menuOpen ? '▲' : '▼'}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 overflow-hidden">
                <button onClick={() => { router.push('/admin'); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                  ⚙️ 관리자 페이지
                </button>
                <button onClick={() => { router.push('/researcher'); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                  🔬 연구자 대시보드
                </button>
                {appUser?.role === 'admin' && (
                  <button onClick={() => { router.push('/teacher'); setMenuOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                    🏫 선생님 화면 보기
                  </button>
                )}
                <div className="border-t border-gray-50 my-1.5" />
                <button onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2">
                  🚪 로그아웃
                </button>
              </div>
            )}
          </div>
        )}

        {!canManage && (
          <button onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
            로그아웃
          </button>
        )}
      </div>
    </header>
  )
}