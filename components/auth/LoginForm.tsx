'use client'
import { useState } from 'react'
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth, googleProvider, db } from '@/firebase/firebaseConfig'
import { getDoc, doc } from 'firebase/firestore'
import { AppUser } from '@/types/user'

export default function LoginForm() {
  const [id, setId]   = useState('')
  const [pw, setPw]   = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // 이메일 로그인: id → id@wooriban.app 형식으로 처리
  const handleEmail = async () => {
    if (!id || !pw) { setErr('아이디와 비밀번호를 입력해주세요'); return }
    setLoading(true); setErr('')
    try {
      const email = id.includes('@') ? id : `${id}@wooriban.app`
      const cred  = await signInWithEmailAndPassword(auth, email, pw)
      await redirect(cred.user.uid)
    } catch {
      setErr('아이디 또는 비밀번호가 올바르지 않아요')
    } finally { setLoading(false) }
  }

  // 구글 로그인
  const handleGoogle = async () => {
    setLoading(true); setErr('')
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      const snap = await getDoc(doc(db, 'users', cred.user.uid))
      // 최초 구글 로그인 → 추가 정보 입력 페이지
      if (!snap.exists()) { router.push('/register?type=google'); return }
      await redirect(cred.user.uid)
    } catch {
      setErr('Google 로그인에 실패했어요')
    } finally { setLoading(false) }
  }

  const redirect = async (uid: string) => {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) { router.push('/register'); return }
    const user = snap.data() as AppUser
    if (user.status === 'pending') { router.push('/pending'); return }
    router.push(`/${user.role}`)
  }

  return (
    <div className="w-full max-w-[420px] bg-white rounded-[20px] shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="font-['Syne'] font-extrabold text-4xl text-indigo-600 mb-1">
          우리반<span className="text-orange-500">.</span>
        </div>
        <p className="text-gray-400 text-sm">한국어 교실을 더 가깝게 🇰🇷</p>
      </div>

      <div className="space-y-4 mb-4">
        <div>
          <label className="text-xs font-bold text-gray-400 mb-1.5 block">아이디 (영어 소문자)</label>
          <input
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-colors"
            placeholder="예: kim.minji"
            value={id} onChange={e => setId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEmail()}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 mb-1.5 block">비밀번호</label>
          <input
            type="password"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-colors"
            placeholder="비밀번호 입력"
            value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEmail()}
          />
        </div>
      </div>

      {err && <p className="text-red-500 text-sm mb-3 text-center">{err}</p>}

      <button
        onClick={handleEmail} disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all mb-3 disabled:opacity-60"
      >
        {loading ? '로그인 중...' : '로그인'}
      </button>

      <button
        onClick={handleGoogle} disabled={loading}
        className="w-full bg-white border-2 border-gray-200 hover:border-gray-400 text-gray-700 font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Google로 로그인
      </button>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-gray-200"/>
        <span className="text-gray-400 text-xs">또는</span>
        <div className="flex-1 h-px bg-gray-200"/>
      </div>

      <p className="text-center text-sm text-gray-400">
        계정이 없으신가요?{' '}
        <a href="/register" className="text-indigo-600 font-bold hover:underline">회원가입</a>
      </p>
    </div>
  )
}
