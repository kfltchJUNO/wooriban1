'use client'
import { useAuth } from '@/lib/auth/authContext'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'
import { signOut } from 'firebase/auth'
import { auth } from '@/firebase/firebaseConfig'
import { useRouter } from 'next/navigation'

export default function PendingPage() {
  const { appUser } = useAuth()
  const router = useRouter()
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-orange-50">
      <div className="bg-white rounded-[20px] shadow-xl p-10 max-w-[420px] w-full text-center">
        <div className="text-6xl mb-4 animate-bounce">⏳</div>
        <h1 className="text-2xl font-black mb-2">승인 대기 중이에요</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          선생님이 반 목록에 추가하면<br/>바로 이용하실 수 있어요!<br/>
          <strong className="text-indigo-600">
            {formatSchool(appUser?.schoolId??'')} · {formatSemester(appUser?.semester??'')} · {formatClass(appUser?.classId??'')}
          </strong>
        </p>
        <button onClick={async()=>{await signOut(auth);router.push('/login')}}
          className="w-full border-2 border-indigo-200 text-indigo-600 font-bold py-3 rounded-xl text-sm hover:bg-indigo-50">
          로그인 화면으로
        </button>
      </div>
    </main>
  )
}
