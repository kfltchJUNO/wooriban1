'use client'
import { useState } from 'react'
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { auth, googleProvider, db } from '@/firebase/firebaseConfig'
import { createUser } from '@/lib/firestore/users'
import { getDocs, collection, query, where } from 'firebase/firestore'

type Step = 1 | 2 | 3

export default function RegisterForm() {
  const [step, setStep]       = useState<Step>(1)
  const [role, setRole]       = useState<'student' | 'teacher'>('student')
  const [nameKr, setNameKr]   = useState('')
  const [userId, setUserId]   = useState('')
  const [pw, setPw]           = useState('')
  const [school, setSchool]   = useState('dankook')
  const [semester, setSemester] = useState('26-summer')
  const [classId, setClassId] = useState('advanced-6')
  const [err, setErr]         = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isGoogle = searchParams.get('type') === 'google'

  const handleSubmit = async () => {
    if (!nameKr || !school || !semester || !classId) { setErr('모든 항목을 입력해주세요'); return }
    if (!isGoogle && (!userId || !pw)) { setErr('아이디와 비밀번호를 입력해주세요'); return }
    if (!isGoogle && pw.length < 8) { setErr('비밀번호는 8자 이상이어야 해요'); return }

    setLoading(true); setErr('')
    try {
      let uid = ''
      if (isGoogle) {
        // 구글 로그인은 이미 auth에 있음
        uid = auth.currentUser!.uid
      } else {
        const email = `${userId}@wooriban.app`
        const cred  = await createUserWithEmailAndPassword(auth, email, pw)
        uid = cred.user.uid
        await updateProfile(cred.user, { displayName: nameKr })
      }

      await createUser(uid, {
        email: isGoogle ? (auth.currentUser?.email ?? '') : `${userId}@wooriban.app`,
        nameKr,
        nickname: nameKr,
        role,
        status: 'pending',
        schoolId: school,
        semester,
        classId,
        sortOrder: 999,
        freeWritingEnabled: true,
        loginType: isGoogle ? 'google' : 'email',
      })

      router.push('/pending')
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') setErr('이미 사용 중인 아이디예요')
      else setErr('가입 중 오류가 발생했어요')
    } finally { setLoading(false) }
  }

  const stepBar = (
    <div className="flex items-center gap-0 mb-6">
      {[1,2,3].map((n,i) => (
        <div key={n} className="flex items-center flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
            ${step > n ? 'bg-green-500 text-white' : step === n ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
            {step > n ? '✓' : n}
          </div>
          {i < 2 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-green-500' : 'bg-gray-200'}`}/>}
        </div>
      ))}
    </div>
  )

  return (
    <div className="w-full max-w-[480px] bg-white rounded-[20px] shadow-xl p-8">
      <div className="text-center mb-6">
        <div className="font-['Syne'] font-extrabold text-2xl text-indigo-600 mb-1">
          우리반<span className="text-orange-500">.</span>
        </div>
        <p className="text-gray-400 text-sm">새 계정 만들기</p>
      </div>
      {stepBar}

      {/* Step 1: 역할 선택 */}
      {step === 1 && (
        <div>
          <p className="font-bold text-base mb-4">어떤 역할로 가입하시나요?</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {([['student','🎓','학생','과제 제출 & 피드백'],['teacher','👩‍🏫','선생님','반 관리 & 과제 부여']] as const).map(([r,icon,name,desc]) => (
              <button key={r} onClick={() => setRole(r as 'student'|'teacher')}
                className={`border-2 rounded-2xl p-5 text-center transition-all ${role===r?'border-indigo-600 bg-indigo-50':'border-gray-200 hover:border-indigo-300'}`}>
                <div className="text-3xl mb-2">{icon}</div>
                <div className="font-bold text-sm">{name}</div>
                <div className="text-xs text-gray-400 mt-1">{desc}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm">
            다음 →
          </button>
          <button onClick={() => router.push('/login')} className="w-full mt-2 border-2 border-indigo-200 text-indigo-600 font-bold py-3 rounded-xl text-sm">
            ← 로그인으로
          </button>
        </div>
      )}

      {/* Step 2: 기본 정보 */}
      {step === 2 && (
        <div>
          <p className="font-bold text-base mb-4">기본 정보 입력</p>
          <div className="space-y-4 mb-4">
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">이름 (한글 출석부 이름)</label>
              <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" placeholder="예: 김민지" value={nameKr} onChange={e=>setNameKr(e.target.value)}/>
            </div>
            {!isGoogle && (
              <>
                <div>
                  <label className="text-xs font-bold text-gray-400 mb-1.5 block">아이디 (영어 소문자·숫자·점만)</label>
                  <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" placeholder="예: kim.minji2" value={userId} onChange={e=>setUserId(e.target.value.toLowerCase().replace(/[^a-z0-9.]/g,''))}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 mb-1.5 block">비밀번호 (8자 이상)</label>
                  <input type="password" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" placeholder="비밀번호" value={pw} onChange={e=>setPw(e.target.value)}/>
                </div>
              </>
            )}
          </div>
          {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
          <div className="flex gap-2">
            <button onClick={()=>setStep(1)} className="flex-1 border-2 border-indigo-200 text-indigo-600 font-bold py-3 rounded-xl text-sm">← 이전</button>
            <button onClick={()=>{if(!nameKr){setErr('이름을 입력해주세요');return};setErr('');setStep(3)}} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm">다음 →</button>
          </div>
        </div>
      )}

      {/* Step 3: 소속 */}
      {step === 3 && (
        <div>
          <p className="font-bold text-base mb-4">소속 정보 선택</p>
          <div className="space-y-4 mb-4">
            {[
              ['대학교','school',school,setSchool,[['dankook','단국대학교']]],
              ['학기','semester',semester,setSemester,[['26-summer','26-여름']]],
              ['반','classId',classId,setClassId,[['advanced-6','고급 6반']]],
            ].map(([label,name,val,setVal,opts]:any)=>(
              <div key={name}>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">{label}</label>
                <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none appearance-none" value={val} onChange={e=>setVal(e.target.value)}>
                  {opts.map(([v,l]:any)=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 mb-4">
            ⏳ 가입 후 선생님/관리자 승인이 필요해요.
          </div>
          {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
          <div className="flex gap-2">
            <button onClick={()=>setStep(2)} className="flex-1 border-2 border-indigo-200 text-indigo-600 font-bold py-3 rounded-xl text-sm">← 이전</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-60">
              {loading ? '처리 중...' : '가입 완료 🎉'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
