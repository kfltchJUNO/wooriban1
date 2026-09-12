'use client'
// components/auth/StudentJoinForm.tsx
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth, db } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { validateClassInvitation, type ClassInvitation } from '@/lib/firestore/classInvitations'

export default function StudentJoinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const codeParam = searchParams.get('code') ?? ''

  const [code, setCode] = useState(codeParam.trim())
  const [invitation, setInvitation] = useState<ClassInvitation | null>(null)
  const [validating, setValidating] = useState(true)
  const [codeError, setCodeError] = useState('')

  // 학생 입력 필드
  const [nameKr, setNameKr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [userId, setUserId] = useState('')
  const [pw, setPw] = useState('')
  const [pwConf, setPwConf] = useState('')
  const [researchConsent, setResearchConsent] = useState(true)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (codeParam) {
      const c = codeParam.trim()
      setCode(c)
      verify(c)
    } else {
      setValidating(false)
    }
  }, [codeParam])

  const verify = async (targetCode: string) => {
    if (!targetCode) {
      setCodeError('초대 코드가 필요해요. (Invite code is required)')
      setValidating(false)
      return
    }
    setValidating(true)
    setCodeError('')
    try {
      const res = await fetch(`/api/join/validate?code=${encodeURIComponent(targetCode)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.invitation) {
        setCodeError(data.error || '유효하지 않거나 만료된 초대 코드예요. (Invalid or expired code)')
        setInvitation(null)
      } else {
        setInvitation(data.invitation)
        setCodeError('')
      }
    } catch {
      setCodeError('코드 확인 중 오류가 발생했어요. 다시 시도해주세요. (Verification failed)')
    } finally {
      setValidating(false)
    }
  }

  const handleManualVerify = () => {
    verify(code.trim())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invitation) return

    const trimmedKr = nameKr.trim()
    const trimmedEn = nameEn.trim().toUpperCase()
    const trimmedId = userId.trim().toLowerCase()

    if (!trimmedEn && !trimmedKr) {
      setSubmitError('이름을 입력해주세요. (Please enter your name)')
      return
    }
    if (!trimmedId) {
      setSubmitError('아이디를 입력해주세요. (Please enter a username)')
      return
    }
    if (!/^[a-z0-9_.]+$/.test(trimmedId)) {
      setSubmitError('아이디는 영문 소문자, 숫자, 밑줄(_), 점(.)만 가능해요. (Username can only contain lowercase letters, numbers, _, .)')
      return
    }
    if (pw.length < 8) {
      setSubmitError('비밀번호는 8자 이상이어야 해요. (Password must be at least 8 characters)')
      return
    }
    if (pw !== pwConf) {
      setSubmitError('비밀번호가 일치하지 않아요. (Passwords do not match)')
      return
    }

    setLoading(true)
    setSubmitError('')

    try {
      const email = `${trimmedId}@wooriban.app`
      const cred = await createUserWithEmailAndPassword(auth, email, pw)
      const uid = cred.user.uid

      const displayName = trimmedKr || trimmedEn
      await updateProfile(cred.user, { displayName })

      // ① Firestore users 컬렉션에 학생 프로필 등록
      await createUser(uid, {
        email,
        nameKr: trimmedKr || trimmedEn,
        nameEn: trimmedEn || trimmedKr,
        nickname: trimmedKr || trimmedEn,
        role: 'student',
        status: 'active',
        schoolId: invitation.schoolId,
        semester: invitation.semester,
        classId: invitation.classId,
        sortOrder: 999,
        freeWritingEnabled: true,
        loginType: 'email',
        researchConsent,
        researchConsentAt: new Date(),
      })

      // ② 교사 출석부(roster) 컬렉션에도 자동 연동 등록
      try {
        await addDoc(collection(db, 'roster'), {
          schoolId: invitation.schoolId,
          semester: invitation.semester,
          classId: invitation.classId,
          nameKr: trimmedKr,
          nameEn: trimmedEn,
          nickname: trimmedKr || trimmedEn,
          studentIdHash: '',
          sortOrder: 999,
          status: 'registered',
          uid,
          createdAt: serverTimestamp(),
        })
      } catch (e) {
        // 출석부 동기화 실패하더라도 가입 자체는 진행
        console.warn('[StudentJoinForm] roster sync notice:', e)
      }

      // 학생 화면으로 이동
      await new Promise(r => setTimeout(r, 600))
      router.push('/student')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('email-already-in-use')) {
        setSubmitError('이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요. (Username already in use)')
      } else {
        setSubmitError(`가입 실패: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
      {/* 로고 & 타이틀 */}
      <div className="text-center mb-6">
        <div className="font-bold text-3xl text-indigo-600 mb-1">
          우리반<span className="text-orange-500">.</span>
        </div>
        <p className="text-gray-500 text-sm font-medium">우리반 학생 가입 (Join Class)</p>
      </div>

      {/* 초대 코드 검증 중 */}
      {validating && (
        <div className="py-12 text-center text-gray-400 text-sm animate-pulse">
          초대 정보를 확인하고 있어요...<br />
          <span className="text-xs">Checking invitation details...</span>
        </div>
      )}

      {/* 코드 오류 상태 또는 직접 입력 필요 */}
      {!validating && (!invitation || codeError) && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            <p className="font-bold mb-1">⚠️ {codeError || '초대 코드를 확인할 수 없어요.'}</p>
            <p className="text-xs text-amber-700">
              선생님께 받은 QR 코드를 다시 스캔하거나 초대 코드를 입력해주세요.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">
              초대 코드 직접 입력 (Enter Invite Code)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="예: INV-DK-3A-XXXX"
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
              로그인 화면으로 이동 (Go to Login)
            </a>
          </div>
        </div>
      )}

      {/* 코드 검증 성공 -> 학생 가입 폼 노출 */}
      {!validating && invitation && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 배정 반 안내 배너 */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-indigo-900">
            <p className="text-xs font-bold text-indigo-500 mb-0.5">참여할 반 (Target Class)</p>
            <p className="text-base font-extrabold text-indigo-950">
              🏛️ {invitation.schoolLabel} · {invitation.semesterLabel}
            </p>
            <p className="text-sm font-bold text-indigo-700 mt-0.5">
              {invitation.classLabel}
            </p>
          </div>

          {/* 한국어 이름 */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              한국어 이름 (Name in Korean)
            </label>
            <input
              type="text"
              value={nameKr}
              onChange={e => setNameKr(e.target.value)}
              placeholder="예: 마이클 (선생님이 부를 이름)"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* 영문 이름 */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              영문 이름 (Passport / English Name) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={nameEn}
              onChange={e => setNameEn(e.target.value)}
              placeholder="예: MICHAEL BROWN"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors uppercase"
            />
          </div>

          {/* 아이디 */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              아이디 (Username) <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-indigo-500">
              <input
                type="text"
                required
                value={userId}
                onChange={e => setUserId(e.target.value.toLowerCase())}
                placeholder="예: michael26"
                className="flex-1 px-4 py-2.5 text-sm outline-none font-mono"
              />
              <span className="px-3 text-xs text-gray-400 bg-gray-50 self-stretch flex items-center border-l border-gray-200">
                @wooriban.app
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">로그인할 때 사용할 영문/숫자 아이디예요.</p>
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              비밀번호 (Password, 8자 이상) <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="8자 이상 입력 (At least 8 chars)"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">
              비밀번호 확인 (Confirm Password) <span className="text-rose-500">*</span>
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

          {/* 연구 동의 체크박스 */}
          <label className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-2xl p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={researchConsent}
              onChange={e => setResearchConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              학습 데이터(작문, 피드백 등)가 <b>익명 처리되어</b> 서비스 개선 및 교육 연구에 활용되는 것에 동의합니다.
              <br />
              <span className="text-[11px] text-gray-400">
                (I agree that my learning data may be used anonymously for educational research.)
              </span>
            </span>
          </label>

          {submitError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-600 font-semibold">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? '가입 처리 중... (Joining...)' : '가입 완료하고 시작하기 (Join Class)'}
          </button>

          <p className="text-center text-xs text-gray-400 pt-2">
            이미 계정이 있나요? (Already have an account?){' '}
            <a href="/login" className="text-indigo-600 font-bold hover:underline">
              로그인 (Log in)
            </a>
          </p>
        </form>
      )}
    </div>
  )
}
