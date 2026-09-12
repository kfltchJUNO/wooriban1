'use client'
// components/auth/TeacherJoinForm.tsx
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { validateTeacherCode, useTeacherCode, type TeacherCodeInfo } from '@/lib/firestore/teacherCodes'

export default function TeacherJoinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const codeParam = searchParams.get('code') ?? ''

  const [code, setCode] = useState(codeParam.trim().toUpperCase())
  const [codeInfo, setCodeInfo] = useState<TeacherCodeInfo | null>(null)
  const [validating, setValidating] = useState(true)
  const [codeError, setCodeError] = useState('')

  // 폼 입력 상태
  const [nameKr, setNameKr] = useState('')
  const [userId, setUserId] = useState('')
  const [pw, setPw] = useState('')
  const [pwConf, setPwConf] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (codeParam) {
      const c = codeParam.trim().toUpperCase()
      setCode(c)
      verify(c)
    } else {
      setValidating(false)
    }
  }, [codeParam])

  const verify = async (targetCode: string) => {
    if (!targetCode) {
      setCodeError('초대 코드가 필요해요.')
      setValidating(false)
      return
    }
    setValidating(true)
    setCodeError('')
    try {
      const res = await fetch(`/api/join/teacher/validate?code=${encodeURIComponent(targetCode)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.info) {
        setCodeError(data.error || '유효하지 않거나 이미 사용된 초대 코드예요.')
        setCodeInfo(null)
      } else {
        setCodeInfo(data.info)
        setCodeError('')
      }
    } catch {
      setCodeError('코드 확인 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setValidating(false)
    }
  }

  const handleManualVerify = () => {
    verify(code.trim().toUpperCase())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codeInfo) return

    const trimmedName = nameKr.trim()
    const trimmedId = userId.trim().toLowerCase()

    if (!trimmedName) {
      setSubmitError('선생님 성함을 입력해주세요.')
      return
    }
    if (!trimmedId) {
      setSubmitError('아이디를 입력해주세요.')
      return
    }
    if (!/^[a-z0-9_.]+$/.test(trimmedId)) {
      setSubmitError('아이디는 영문 소문자, 숫자, 밑줄(_), 점(.)만 가능해요.')
      return
    }
    if (pw.length < 8) {
      setSubmitError('비밀번호는 8자 이상이어야 해요.')
      return
    }
    if (pw !== pwConf) {
      setSubmitError('비밀번호가 일치하지 않아요.')
      return
    }

    setLoading(true)
    setSubmitError('')

    try {
      const email = `${trimmedId}@wooriban.app`
      const cred = await createUserWithEmailAndPassword(auth, email, pw)
      const uid = cred.user.uid

      await updateProfile(cred.user, { displayName: trimmedName })

      // ① 코드 사용 처리
      await useTeacherCode(codeInfo.code, uid)

      // ② Firestore users 문서 생성
      await createUser(uid, {
        email,
        nameKr: trimmedName,
        nickname: trimmedName,
        role: 'teacher',
        status: 'active',
        schoolId: codeInfo.schoolId,
        semester: codeInfo.semester,
        classId: codeInfo.classId,
        sortOrder: 0,
        freeWritingEnabled: false,
        loginType: 'email',
        chalk: 0,
      })

      // 잠시 대기 후 교사 대시보드로 이동
      await new Promise(r => setTimeout(r, 600))
      router.push('/teacher')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('email-already-in-use')) {
        setSubmitError('이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요.')
      } else {
        setSubmitError(`가입 실패: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
      {/* 상단 로고 & 타이틀 */}
      <div className="text-center mb-6">
        <div className="font-bold text-3xl text-indigo-600 mb-1">
          우리반<span className="text-orange-500">.</span>
        </div>
        <p className="text-gray-500 text-sm font-medium">선생님 초대 가입</p>
      </div>

      {/* 초대 코드 검증 중 */}
      {validating && (
        <div className="py-12 text-center text-gray-400 text-sm animate-pulse">
          초대 코드를 확인하고 있어요...
        </div>
      )}

      {/* 코드 오류 상태 또는 직접 입력 필요 */}
      {!validating && (!codeInfo || codeError) && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            <p className="font-bold mb-1">⚠️ {codeError || '초대 코드를 확인할 수 없어요.'}</p>
            <p className="text-xs text-amber-700">관리자에게 전달받은 초대 코드 또는 링크를 다시 확인해주세요.</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">선생님 초대 코드 직접 입력</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="예: DG26SU300101"
                className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-indigo-500 outline-none uppercase"
              />
              <button
                type="button"
                onClick={handleManualVerify}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                확인
              </button>
            </div>
          </div>

          <div className="pt-4 text-center">
            <a href="/login" className="text-xs text-gray-400 hover:text-gray-600 underline">
              로그인 화면으로 이동
            </a>
          </div>
        </div>
      )}

      {/* 코드 검증 성공 -> 선생님 가입 폼 노출 */}
      {!validating && codeInfo && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 배정 반 안내 배너 */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-indigo-900">
            <p className="text-xs font-bold text-indigo-500 mb-1">담당 배정 반 정보</p>
            <p className="text-base font-bold text-indigo-950">
              🏛️ {codeInfo.schoolLabel} · {codeInfo.semesterLabel}
            </p>
            <p className="text-sm font-semibold text-indigo-700 mt-0.5">
              {codeInfo.classLabel} (선생님 {codeInfo.teacherNo}번)
            </p>
          </div>

          {/* 성함 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              선생님 성함 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={nameKr}
              onChange={e => setNameKr(e.target.value)}
              placeholder="예: 김민정"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* 아이디 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              로그인에 사용할 아이디 <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-indigo-500">
              <input
                type="text"
                required
                value={userId}
                onChange={e => setUserId(e.target.value.toLowerCase())}
                placeholder="예: teacher_kim"
                className="flex-1 px-4 py-2.5 text-sm outline-none font-mono"
              />
              <span className="px-3 text-xs text-gray-400 bg-gray-50 self-stretch flex items-center border-l border-gray-200">
                @wooriban.app
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">로그인할 때 이 아이디를 입력하시면 돼요.</p>
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              비밀번호 (8자 이상) <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="비밀번호 입력"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              비밀번호 확인 <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={pwConf}
              onChange={e => setPwConf(e.target.value)}
              placeholder="비밀번호 다시 입력"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          {submitError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-600 font-semibold">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? '선생님 계정 생성 중...' : '가입 완료하고 시작하기'}
          </button>

          <p className="text-center text-xs text-gray-400 pt-2">
            이미 계정이 있으신가요?{' '}
            <a href="/login" className="text-indigo-600 font-bold hover:underline">
              로그인하기
            </a>
          </p>
        </form>
      )}
    </div>
  )
}
