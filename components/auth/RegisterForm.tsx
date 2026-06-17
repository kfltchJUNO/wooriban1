'use client'
// components/auth/RegisterForm.tsx

import { useState, useEffect } from 'react'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { verifyRosterEntry, linkRosterToUid } from '@/lib/firestore/roster'
import { validateTeacherCode, useTeacherCode } from '@/lib/firestore/teacherCodes'
import { hashStudentId } from '@/lib/crypto'
import { getAllSchools, formatSemesterId, formatClassId, type SchoolData } from '@/lib/firestore/schools'

type Mode = 'select' | 'student' | 'teacher'
type Step = 1 | 2

export default function RegisterForm() {
  const [mode, setMode] = useState<Mode>('select')
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">우리반 가입</h1>

        {mode === 'select' && <ModeSelect onSelect={setMode} />}
        {mode === 'student' && <StudentRegister onBack={() => setMode('select')} router={router} />}
        {mode === 'teacher' && <TeacherRegister onBack={() => setMode('select')} router={router} />}

        <p className="text-center text-sm text-gray-400 mt-6">
          이미 계정이 있나요?{' '}
          <a href="/login" className="text-indigo-600 font-bold hover:underline">로그인</a>
        </p>
      </div>
    </div>
  )
}

function ModeSelect({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <div className="space-y-3 mt-6">
      <p className="text-sm text-gray-500 mb-4">어떤 역할로 가입하시나요?</p>
      <button onClick={() => onSelect('student')}
        className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left">
        <span className="text-3xl">🎓</span>
        <div>
          <p className="font-bold text-gray-900">학생</p>
          <p className="text-xs text-gray-400">여권 영문명과 학번으로 가입</p>
        </div>
      </button>
      <button onClick={() => onSelect('teacher')}
        className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left">
        <span className="text-3xl">👩‍🏫</span>
        <div>
          <p className="font-bold text-gray-900">선생님</p>
          <p className="text-xs text-gray-400">선생님 코드로 가입</p>
        </div>
      </button>
    </div>
  )
}

function AccountSetup({ nameLabel, onSubmit, loading, error }: {
  nameLabel: string
  onSubmit:  (userId: string, pw: string) => void
  loading:   boolean
  error:     string
}) {
  const [userId,  setUserId]  = useState('')
  const [pw,      setPw]      = useState('')
  const [pwConf,  setPwConf]  = useState('')
  const [localErr,setLocalErr]= useState('')

  const handleSubmit = () => {
    if (!userId.trim())  { setLocalErr('아이디를 입력해주세요.'); return }
    if (pw.length < 8)   { setLocalErr('비밀번호는 8자 이상이어야 해요.'); return }
    if (pw !== pwConf)   { setLocalErr('비밀번호가 일치하지 않아요.'); return }
    setLocalErr('')
    onSubmit(userId.trim(), pw)
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
        ✅ <span className="font-semibold">{nameLabel}</span>으로 확인됐어요.
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1">아이디</label>
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-indigo-400">
          <input value={userId} onChange={e => setUserId(e.target.value)}
            placeholder="영문/숫자"
            className="flex-1 px-4 py-2.5 text-sm focus:outline-none" />
          <span className="px-3 text-xs text-gray-400 bg-gray-50 self-stretch flex items-center border-l border-gray-200">
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
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1">비밀번호 확인</label>
        <input type="password" value={pwConf} onChange={e => setPwConf(e.target.value)}
          placeholder="비밀번호를 다시 입력"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
      </div>
      {(localErr || error) && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {localErr || error}
        </div>
      )}
      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-sm">
        {loading ? '가입 중...' : '가입 완료'}
      </button>
    </div>
  )
}

function StudentRegister({ onBack, router }: { onBack: () => void; router: ReturnType<typeof useRouter> }) {
  const [step,     setStep]     = useState<Step>(1)
  const [nameEn,   setNameEn]   = useState('')
  const [studentId,setStudentId]= useState('')
  const [school,   setSchool]   = useState('')
  const [semester, setSemester] = useState('')
  const [classId,  setClassId]  = useState('')
  const [roster,   setRoster]   = useState<{ id: string; nickname?: string; nameKr?: string } | null>(null)
  const [err,      setErr]      = useState('')
  const [loading,  setLoading]  = useState(false)

  // 학교 목록 동적 로드
  const [schools,   setSchools]   = useState<SchoolData[]>([])
  const [semesters, setSemesters] = useState<string[]>([])
  const [classes,   setClasses]   = useState<string[]>([])

  useEffect(() => {
    getAllSchools().then(list => {
      setSchools(list)
      if (list.length > 0) {
        setSchool(list[0].id)
        const sems = list[0].semesters
        setSemesters(sems)
        if (sems.length > 0) {
          setSemester(sems[0])
          const cls = list[0].classes[sems[0]] ?? []
          setClasses(cls)
          if (cls.length > 0) setClassId(cls[0])
        }
      }
    })
  }, [])

  const handleSchoolChange = (schoolId: string) => {
    setSchool(schoolId)
    const s = schools.find(s => s.id === schoolId)
    const sems = s?.semesters ?? []
    setSemesters(sems)
    setSemester(sems[0] ?? '')
    const cls = s?.classes[sems[0]] ?? []
    setClasses(cls)
    setClassId(cls[0] ?? '')
  }

  const handleSemesterChange = (semId: string) => {
    setSemester(semId)
    const s = schools.find(s => s.id === school)
    const cls = s?.classes[semId] ?? []
    setClasses(cls)
    setClassId(cls[0] ?? '')
  }

  const handleVerify = async () => {
    if (!nameEn.trim() || !studentId.trim()) { setErr('여권 영문명과 학번을 모두 입력해주세요.'); return }
    setLoading(true); setErr('')
    try {
      const hash   = await hashStudentId(studentId)
      console.log('[Verify] school:', school, 'semester:', semester, 'classId:', classId)
      console.log('[Verify] nameEn:', nameEn.trim().toUpperCase(), 'hash:', hash)
      const result = await verifyRosterEntry(school, semester, classId, nameEn.trim().toUpperCase(), hash)
      console.log('[Verify] result:', result)
      if (!result.valid) { setErr(result.error ?? '인증 실패'); return }
      setRoster(result.entry ?? null)
      setStep(2)
    } catch (e) {
      console.error('[Verify Error]', e)
      setErr(`오류: ${e instanceof Error ? e.message : String(e)}`)
    }
    finally { setLoading(false) }
  }

  const handleCreate = async (userId: string, pw: string) => {
    setLoading(true); setErr('')
    try {
      const email         = `${userId}@wooriban.app`
      const cred          = await createUserWithEmailAndPassword(auth, email, pw)
      const uid           = cred.user.uid
      await updateProfile(cred.user, { displayName: roster?.nameKr ?? nameEn })
      const studentIdHash = await hashStudentId(studentId)
      await createUser(uid, {
        email,
        nameEn:             nameEn.trim().toUpperCase(),
        nameKr:             roster?.nameKr ?? '',
        nickname:           roster?.nickname || roster?.nameKr || nameEn,
        studentIdHash,
        role:               'student',
        status:             'active',
        schoolId:           school,
        semester,
        classId,
        sortOrder:          999,
        freeWritingEnabled: true,
        loginType:          'email',
      })
      if (roster) await linkRosterToUid(roster.id, uid)
      router.push('/student')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류'
      setErr(msg.includes('email-already-in-use') ? '이미 사용 중인 아이디예요.' : msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
        <p className="text-sm font-semibold text-gray-700">🎓 학생 가입</p>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-600">
          {step === 1 ? '1단계: 본인 확인' : '2단계: 계정 설정'}
        </span>
      </div>

      {step === 1 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-1">학교</label>
              <select value={school} onChange={e => handleSchoolChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-1">학기</label>
              <select value={semester} onChange={e => handleSemesterChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                {semesters.map(s => <option key={s} value={s}>{formatSemesterId(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-1">반</label>
              <select value={classId} onChange={e => setClassId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                {classes.map(c => <option key={c} value={c}>{formatClassId(c)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">여권 영문명 <span className="text-red-400">*</span></label>
            <input value={nameEn} onChange={e => setNameEn(e.target.value.toUpperCase())}
              placeholder="예: JUNHO OH"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
            <p className="text-[11px] text-gray-400 mt-1">여권에 표기된 영문 성명</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">학번 <span className="text-red-400">*</span></label>
            <input value={studentId} onChange={e => setStudentId(e.target.value)}
              placeholder="선생님에게 받은 학번"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
          </div>

          {err && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{err}</div>}

          <button onClick={handleVerify} disabled={loading || !nameEn.trim() || !studentId.trim()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-sm">
            {loading ? '확인 중...' : '다음 →'}
          </button>
        </>
      )}

      {step === 2 && (
        <AccountSetup nameLabel={roster?.nameKr ?? nameEn} onSubmit={handleCreate} loading={loading} error={err} />
      )}
    </div>
  )
}

function TeacherRegister({ onBack, router }: { onBack: () => void; router: ReturnType<typeof useRouter> }) {
  const [step,     setStep]     = useState<Step>(1)
  const [code,     setCode]     = useState('')
  const [nameKr,   setNameKr]   = useState('')
  const [codeInfo, setCodeInfo] = useState<{
    schoolId: string; semester: string; classId: string
    schoolLabel: string; semesterLabel: string; classLabel: string
  } | null>(null)
  const [err,      setErr]      = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleVerify = async () => {
    if (!code.trim() || !nameKr.trim()) { setErr('코드와 이름을 모두 입력해주세요.'); return }
    setLoading(true); setErr('')
    try {
      const result = await validateTeacherCode(code.trim().toUpperCase())
      if (!result.valid) { setErr(result.error ?? '유효하지 않은 코드예요.'); return }
      setCodeInfo(result.info ?? null)
      setStep(2)
    } catch { setErr('오류가 발생했어요.') }
    finally { setLoading(false) }
  }

  const handleCreate = async (userId: string, pw: string) => {
    if (!codeInfo) return
    setLoading(true); setErr('')
    try {
      const email = `${userId}@wooriban.app`
      const cred  = await createUserWithEmailAndPassword(auth, email, pw)
      const uid   = cred.user.uid
      await updateProfile(cred.user, { displayName: nameKr })
      await createUser(uid, {
        email, nameKr, nickname: nameKr,
        role: 'teacher', status: 'active',
        schoolId: codeInfo.schoolId, semester: codeInfo.semester, classId: codeInfo.classId,
        sortOrder: 0, freeWritingEnabled: false, loginType: 'email',
      })
      await useTeacherCode(code.trim().toUpperCase(), uid)
      router.push('/teacher')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류'
      setErr(msg.includes('email-already-in-use') ? '이미 사용 중인 아이디예요.' : msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
        <p className="text-sm font-semibold text-gray-700">👩‍🏫 선생님 가입</p>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-600">
          {step === 1 ? '1단계: 코드 확인' : '2단계: 계정 설정'}
        </span>
      </div>

      {step === 1 && (
        <>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">이름 <span className="text-red-400">*</span></label>
            <input value={nameKr} onChange={e => setNameKr(e.target.value)}
              placeholder="예: 오준호"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">선생님 코드 <span className="text-red-400">*</span></label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="예: DG26SU021001"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:border-indigo-400" />
            <p className="text-[11px] text-gray-400 mt-1">관리자에게 받은 12자리 코드</p>
          </div>
          {err && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{err}</div>}
          <button onClick={handleVerify} disabled={loading || !code.trim() || !nameKr.trim()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-sm">
            {loading ? '확인 중...' : '코드 확인 →'}
          </button>
        </>
      )}

      {step === 2 && codeInfo && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            <p className="font-bold">✅ 코드 확인 완료</p>
            <p className="text-xs mt-0.5">{codeInfo.schoolLabel} · {codeInfo.semesterLabel} · {codeInfo.classLabel}</p>
          </div>
          <AccountSetup nameLabel={nameKr} onSubmit={handleCreate} loading={loading} error={err} />
        </>
      )}
    </div>
  )
}