'use client'
// components/admin/ResearchAccountManager.tsx
// 연구자용 계정을 관리자가 직접 생성. 학생처럼 출석부 가입 절차를 거치지 않고
// 관리자가 미리 정한 아이디/비밀번호로 바로 로그인 가능하게 함.
// (기존 로그인 화면·Firebase Auth 메커니즘을 그대로 재사용 — 별도 로그인 경로 불필요)

import { useState, useEffect } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { AppUser } from '@/types/user'

export default function ResearchAccountManager() {
  const [userId,   setUserId]   = useState('')
  const [pw,       setPw]       = useState('')
  const [nameKr,   setNameKr]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [toast,    setToast]    = useState('')
  const [accounts, setAccounts] = useState<AppUser[]>([])
  const [loadingList, setLoadingList] = useState(true)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadAccounts = async () => {
    setLoadingList(true)
    const q = query(collection(db, 'users'), where('role', '==', 'researcher'))
    const snap = await getDocs(q)
    setAccounts(snap.docs.map(d => ({ ...d.data(), uid: d.id }) as AppUser))
    setLoadingList(false)
  }

  useEffect(() => { loadAccounts() }, [])

  const handleCreate = async () => {
    if (!userId.trim() || !pw.trim() || !nameKr.trim()) {
      showToast('아이디, 비밀번호, 이름을 모두 입력해주세요.')
      return
    }
    if (pw.length < 8) {
      showToast('비밀번호는 8자 이상이어야 해요.')
      return
    }
    setLoading(true)
    try {
      const email = `${userId.trim()}@wooriban.app`
      const cred  = await createUserWithEmailAndPassword(auth, email, pw)
      const uid   = cred.user.uid

      // 연구용 계정은 특정 반에 속하지 않음 — schoolId/classId는 자리표시자로 채움
      // (타입 구조를 학생/선생님과 동일하게 유지해 기존 화면·규칙 재사용)
      await createUser(uid, {
        email,
        nameKr: nameKr.trim(),
        nickname: nameKr.trim(),
        role: 'researcher',
        status: 'active',
        schoolId: 'research',
        semester: 'research',
        classId: 'research',
        sortOrder: 0,
        freeWritingEnabled: false,
        loginType: 'email',
      })

      showToast(`연구용 계정이 생성됐어요! 아이디: ${userId.trim()}`)
      setUserId(''); setPw(''); setNameKr('')
      await loadAccounts()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류'
      showToast(msg.includes('email-already-in-use') ? '이미 사용 중인 아이디예요.' : '계정 생성 실패: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-base text-gray-800">연구용 계정 생성</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          출석부 가입 절차 없이, 여기서 만든 아이디/비밀번호로 연구자가 바로 로그인할 수 있어요.
        </p>
      </div>

      <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 space-y-3">
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">이름</label>
          <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
            placeholder="예: 김연구"
            value={nameKr} onChange={e => setNameKr(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">아이디</label>
          <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-purple-400">
            <input className="flex-1 px-4 py-2.5 text-sm outline-none"
              placeholder="영문/숫자"
              value={userId} onChange={e => setUserId(e.target.value)} />
            <span className="px-3 text-xs text-gray-400 bg-gray-50 self-stretch flex items-center border-l border-gray-200">
              @wooriban.app
            </span>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">비밀번호</label>
          <input type="password" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
            placeholder="8자 이상"
            value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        <button onClick={handleCreate} disabled={loading}
          className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm disabled:opacity-40 transition-colors">
          {loading ? '생성 중...' : '연구용 계정 생성'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="font-bold text-sm text-gray-800">생성된 연구용 계정 ({accounts.length}개)</p>
        </div>
        <div className="divide-y divide-gray-50">
          {loadingList ? (
            <div className="p-5 text-center text-gray-400 text-sm animate-pulse">불러오는 중...</div>
          ) : accounts.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-sm">아직 생성된 연구용 계정이 없어요.</div>
          ) : accounts.map(acc => (
            <div key={acc.uid} className="flex items-center gap-3 px-5 py-3">
              <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
              <span className="font-bold text-sm text-gray-800">{acc.nameKr}</span>
              <span className="text-xs text-gray-400 flex-1">{acc.email.replace('@wooriban.app', '')}</span>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}