'use client'
import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { auth, googleProvider, db } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { verifyRosterEntry, linkRosterToUid } from '@/lib/firestore/roster'
import { getDocs, collection, query, where } from 'firebase/firestore'

type Step = 1 | 2 | 3

// 학교/학기/반 목록 (schools 컬렉션에서 가져오거나 하드코딩)
const SCHOOLS = [
  { id: "dankook", label: "단국대학교" },
];
const SEMESTERS = [
  { id: "26-summer", label: "2026년 여름" },
  { id: "26-spring", label: "2026년 봄" },
];
const CLASSES = [
  { id: "advanced-6", label: "고급 6반" },
  { id: "advanced-5", label: "고급 5반" },
  { id: "intermediate-3", label: "중급 3반" },
];

export default function RegisterForm() {
  const [step,      setStep]      = useState<Step>(1)
  const [role,      setRole]      = useState<'student' | 'teacher'>('student')
  const [nameKr,    setNameKr]    = useState('')
  const [studentId, setStudentId] = useState('')  // ← 학번 추가
  const [userId,    setUserId]    = useState('')
  const [pw,        setPw]        = useState('')
  const [school,    setSchool]    = useState('dankook')
  const [semester,  setSemester]  = useState('26-summer')
  const [classId,   setClassId]   = useState('advanced-6')
  const [err,       setErr]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const router      = useRouter()
  const searchParams = useSearchParams()
  const isGoogle    = searchParams.get('type') === 'google'

  // Step 2: roster 검증 (학생만)
  const handleVerify = async () => {
    if (!nameKr.trim()) { setErr('이름을 입력해주세요'); return }
    if (role === 'student' && !studentId.trim()) {
      setErr('학번을 입력해주세요'); return
    }
    setLoading(true); setErr('')
    try {
      if (role === 'student') {
        const result = await verifyRosterEntry(
          school, semester, classId, nameKr, studentId
        )
        if (!result.valid) {
          setErr(result.error ?? '검증 실패')
          setLoading(false)
          return
        }
      }
      setStep(3)
    } catch (e) {
      setErr('오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: 계정 생성
  const handleSubmit = async () => {
    if (!isGoogle && (!userId || !pw)) { setErr('아이디와 비밀번호를 입력해주세요'); return }
    if (!isGoogle && pw.length < 8)    { setErr('비밀번호는 8자 이상이어야 해요'); return }

    setLoading(true); setErr('')
    try {
      let uid = ''
      if (isGoogle) {
        uid = auth.currentUser!.uid
      } else {
        const email = `${userId}@wooriban.app`
        const cred  = await createUserWithEmailAndPassword(auth, email, pw)
        uid = cred.user.uid
        await updateProfile(cred.user, { displayName: nameKr })
      }

      // roster에서 nickname 가져오기
      let nickname = nameKr
      let rosterId: string | null = null

      if (role === 'student') {
        const result = await verifyRosterEntry(school, semester, classId, nameKr, studentId)
        if (result.valid && result.entry) {
          nickname = result.entry.nickname || nameKr  // 선생님이 설정한 부르는 이름
          rosterId = result.entry.id
        }
      }

      await createUser(uid, {
        email:              isGoogle ? (auth.currentUser?.email ?? '') : `${userId}@wooriban.app`,
        nameKr,
        nickname,           // ← roster에서 가져온 부르는 이름
        role,
        status:             'active',  // roster 검증 완료 → 바로 active (pending 불필요)
        schoolId:           school,
        semester,
        classId,
        sortOrder:          999,
        freeWritingEnabled: true,
        loginType:          isGoogle ? 'google' : 'email',
      })

      // roster uid 연결
      if (rosterId) {
        await linkRosterToUid(rosterId, uid)
      }

      router.push(role === 'student' ? '/student' : '/teacher')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류가 발생했어요'
      if (msg.includes('email-already-in-use')) setErr('이미 사용 중인 아이디예요')
      else setErr(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">우리반 가입</h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === 1 && "반 정보와 역할을 선택해주세요"}
          {step === 2 && "출석부에 등록된 이름과 학번을 입력해주세요"}
          {step === 3 && "로그인에 사용할 계정을 설정해주세요"}
        </p>

        {/* Step 1: 반 선택 + 역할 */}
        {step === 1 && (
          <div className="space-y-4">
            {/* 역할 선택 */}
            <div className="flex gap-3">
              {(['student', 'teacher'] as const).map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                    role === r
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-200'
                  }`}>
                  {r === 'student' ? '🎓 학생' : '👩‍🏫 선생님'}
                </button>
              ))}
            </div>

            {/* 학교 */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">학교</label>
              <select value={school} onChange={e => setSchool(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {SCHOOLS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {/* 학기 */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">학기</label>
              <select value={semester} onChange={e => setSemester(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {SEMESTERS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {/* 반 */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">반</label>
              <select value={classId} onChange={e => setClassId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {CLASSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <button onClick={() => setStep(2)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">
              다음
            </button>
          </div>
        )}

        {/* Step 2: 이름 + 학번 검증 */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">
                출석부 이름 <span className="text-red-400">*</span>
              </label>
              <input value={nameKr} onChange={e => setNameKr(e.target.value)}
                placeholder="출석부에 등록된 이름"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>

            {role === 'student' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">
                  학번 <span className="text-red-400">*</span>
                </label>
                <input value={studentId} onChange={e => setStudentId(e.target.value)}
                  placeholder="선생님에게 받은 학번"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <p className="text-xs text-gray-400 mt-1">
                  이름과 학번이 출석부와 일치해야 가입할 수 있어요.
                </p>
              </div>
            )}

            {err && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {err}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setStep(1); setErr('') }}
                className="flex-1 py-3 border border-gray-200 text-gray-500 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                이전
              </button>
              <button onClick={handleVerify} disabled={loading}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40">
                {loading ? '확인 중...' : '확인'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 계정 설정 */}
        {step === 3 && (
          <div className="space-y-4">
            {/* 확인된 정보 표시 */}
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              ✅ <span className="font-semibold">{nameKr}</span>으로 확인됐어요.
            </div>

            {!isGoogle && (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">아이디</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-indigo-400">
                    <input value={userId} onChange={e => setUserId(e.target.value)}
                      placeholder="영문/숫자"
                      className="flex-1 px-4 py-2.5 text-sm focus:outline-none" />
                    <span className="px-3 text-xs text-gray-400 bg-gray-50 h-full flex items-center border-l border-gray-200">
                      @wooriban.app
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">비밀번호</label>
                  <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                    placeholder="8자 이상"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
              </>
            )}

            {err && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {err}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setStep(2); setErr('') }}
                className="flex-1 py-3 border border-gray-200 text-gray-500 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                이전
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40">
                {loading ? '가입 중...' : '가입 완료'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-gray-400 mt-6">
          이미 계정이 있나요?{' '}
          <a href="/login" className="text-indigo-600 font-bold hover:underline">로그인</a>
        </p>
      </div>
    </div>
  )
}