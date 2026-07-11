'use client'
// components/admin/ResearchAccountManager.tsx
// 두 종류의 계정을 관리자가 직접 생성. 학생처럼 출석부 가입 절차를 거치지 않고
// 관리자가 미리 정한 아이디/비밀번호로 바로 로그인 가능하게 함.
// ① 연구자 계정  — role: 'researcher', 연구를 수행하는 사람 (교수/대학원생 등)
// ② 외부 참여자 계정 — role: 'student' + researchParticipant: true, 재학생이 아닌 연구 대상자
//    (자유작문 등 기존 학생 화면을 그대로 쓸 수 있게 role은 student로 둠)

import { useState, useEffect } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { AppUser } from '@/types/user'

type AccountType = 'researcher' | 'participant'

export default function ResearchAccountManager() {
  const [accountType, setAccountType] = useState<AccountType>('participant')
  const [userId,   setUserId]   = useState('')
  const [pw,       setPw]       = useState('')
  const [nameKr,   setNameKr]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [toast,    setToast]    = useState('')
  const [accounts, setAccounts] = useState<AppUser[]>([])
  const [loadingList, setLoadingList] = useState(true)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // 연구자 계정 + 외부 참여자 계정 둘 다 표시 (researchParticipant true인 학생도 포함)
  const loadAccounts = async () => {
    setLoadingList(true)
    const [researcherSnap, participantSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'researcher'))),
      getDocs(query(collection(db, 'users'), where('schoolId', '==', 'research'))),
    ])
    const list = [
      ...researcherSnap.docs.map(d => ({ ...d.data(), uid: d.id }) as AppUser),
      ...participantSnap.docs.map(d => ({ ...d.data(), uid: d.id }) as AppUser),
    ]
    setAccounts(list)
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

      // 특정 반에 속하지 않는 계정이라 schoolId/classId는 자리표시자로 채움
      // (타입 구조를 학생/선생님과 동일하게 유지해 기존 화면·규칙을 그대로 재사용)
      await createUser(uid, {
        email,
        nameKr: nameKr.trim(),
        nickname: nameKr.trim(),
        role: accountType === 'researcher' ? 'researcher' : 'student',
        status: 'active',
        schoolId: 'research',
        semester: 'research',
        classId: 'research',
        sortOrder: 0,
        // 외부 참여자는 자유작문 기능을 바로 쓸 수 있게 활성화
        freeWritingEnabled: accountType === 'participant',
        loginType: 'email',
        // 외부 참여자는 생성 즉시 연구 참여자로 표시
        ...(accountType === 'participant' ? { researchParticipant: true, researchConsent: true, researchConsentAt: new Date() } : {}),
      })

      showToast(`${accountType === 'researcher' ? '연구자' : '연구 참여자'} 계정이 생성됐어요! 아이디: ${userId.trim()}`)
      setUserId(''); setPw(''); setNameKr('')
      await loadAccounts()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류'
      showToast(msg.includes('email-already-in-use') ? '이미 사용 중인 아이디예요.' : '계정 생성 실패: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  const researchers   = accounts.filter(a => a.role === 'researcher')
  const participants  = accounts.filter(a => a.role === 'student')

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-base text-gray-800">연구용 계정 생성</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          출석부 가입 절차 없이, 여기서 만든 아이디/비밀번호로 바로 로그인할 수 있어요.
        </p>
      </div>

      <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 space-y-3">
        {/* 계정 유형 선택 */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setAccountType('participant')}
            className={`p-3 rounded-xl border-2 text-left transition-colors ${
              accountType === 'participant' ? 'border-purple-500 bg-white' : 'border-transparent bg-white/50 hover:bg-white'
            }`}>
            <p className="text-sm font-bold text-gray-800">✍️ 외부 참여자</p>
            <p className="text-[11px] text-gray-400 mt-0.5">재학생이 아닌 연구 대상자. 자유작문 등 학생 화면 사용</p>
          </button>
          <button type="button" onClick={() => setAccountType('researcher')}
            className={`p-3 rounded-xl border-2 text-left transition-colors ${
              accountType === 'researcher' ? 'border-purple-500 bg-white' : 'border-transparent bg-white/50 hover:bg-white'
            }`}>
            <p className="text-sm font-bold text-gray-800">🔬 연구자</p>
            <p className="text-[11px] text-gray-400 mt-0.5">연구를 수행하는 사람. 추후 연구 대시보드 사용 예정</p>
          </button>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">이름</label>
          <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
            placeholder={accountType === 'researcher' ? '예: 김연구' : '예: 참여자01'}
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
          {loading ? '생성 중...' : `${accountType === 'researcher' ? '연구자' : '참여자'} 계정 생성`}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="font-bold text-sm text-gray-800">
            연구자 ({researchers.length}) · 외부 참여자 ({participants.length})
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {loadingList ? (
            <div className="p-5 text-center text-gray-400 text-sm animate-pulse">불러오는 중...</div>
          ) : accounts.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-sm">아직 생성된 계정이 없어요.</div>
          ) : accounts.map(acc => (
            <div key={acc.uid} className="flex items-center gap-3 px-5 py-3">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.role === 'researcher' ? 'bg-indigo-400' : 'bg-purple-400'}`} />
              <span className="font-bold text-sm text-gray-800">{acc.nameKr}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {acc.role === 'researcher' ? '연구자' : '참여자'}
              </span>
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