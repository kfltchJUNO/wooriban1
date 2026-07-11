'use client'
// components/admin/ResearchApplicantsPanel.tsx
// 구글폼 제출자 목록을 확인하고, 기존 학생과 매칭해서 연구 참여자로 지정하는 화면.

import { useState, useEffect } from 'react'
import {
  collection, query, where, getDocs, doc, updateDoc, orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { getAllUsers, updateResearchParticipant } from '@/lib/firestore/users'
import { AppUser } from '@/types/user'
import { formatSchool, formatClass } from '@/lib/utils/classUtils'

interface Applicant {
  id:           string
  nameEn:       string
  nameKr:       string
  schoolId:     string
  classId:      string
  email:        string
  consent:      boolean
  nationality:  string
  motherTongue: string
  status:       'pending' | 'matched' | 'rejected'
  matchedUid:   string | null
  submittedAt?: { toDate: () => Date }
}

export default function ResearchApplicantsPanel() {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [students,   setStudents]   = useState<AppUser[]>([])
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState('')
  const [filter,     setFilter]     = useState<'pending' | 'all'>('pending')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = async () => {
    setLoading(true)
    const [appSnap, allUsers] = await Promise.all([
      getDocs(query(collection(db, 'researchApplicants'), orderBy('submittedAt', 'desc'))),
      getAllUsers(),
    ])
    setApplicants(appSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Applicant))
    setStudents(allUsers.filter(u => u.role === 'student'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 여권 영문명으로 후보 학생 자동 추천 (완전 일치 우선)
  const suggestMatch = (nameEn: string) => {
    const norm = nameEn.trim().toUpperCase()
    return students.find(s => s.nameEn?.trim().toUpperCase() === norm)
  }

  const handleMatch = async (applicant: Applicant, studentUid: string) => {
    try {
      await updateResearchParticipant(studentUid, true)
      await updateDoc(doc(db, 'researchApplicants', applicant.id), {
        status: 'matched', matchedUid: studentUid,
      })
      showToast('연구 참여자로 지정됐어요!')
      await load()
    } catch (e) {
      console.error(e)
      showToast('매칭 중 오류가 발생했어요.')
    }
  }

  const handleReject = async (applicant: Applicant) => {
    if (!confirm(`"${applicant.nameEn}" 신청을 거절 처리할까요?`)) return
    await updateDoc(doc(db, 'researchApplicants', applicant.id), { status: 'rejected' })
    showToast('거절 처리됐어요.')
    await load()
  }

  const visible = applicants.filter(a => filter === 'all' ? true : a.status === 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-gray-800">연구 참여 신청자</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            구글폼 제출 내역을 확인하고, 기존 학생 계정과 매칭해서 연구 참여자로 지정해요.
          </p>
        </div>
        <div className="flex gap-1">
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                filter === f ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100'
              }`}>
              {f === 'pending' ? '대기 중' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-8 animate-pulse">불러오는 중...</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">
          {filter === 'pending' ? '처리 대기 중인 신청이 없어요.' : '신청 내역이 없어요.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(applicant => {
            const suggested = applicant.status === 'pending' ? suggestMatch(applicant.nameEn) : null
            return (
              <div key={applicant.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-bold text-sm text-gray-800">
                      {applicant.nameEn} {applicant.nameKr && `(${applicant.nameKr})`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {applicant.email && `${applicant.email} · `}
                      {formatSchool(applicant.schoolId)} {formatClass(applicant.classId)}
                      {applicant.nationality && ` · ${applicant.nationality}`}
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    applicant.status === 'matched' ? 'bg-green-100 text-green-700'
                    : applicant.status === 'rejected' ? 'bg-gray-100 text-gray-400'
                    : applicant.consent ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {applicant.status === 'matched' ? '매칭 완료'
                     : applicant.status === 'rejected' ? '거절됨'
                     : applicant.consent ? '동의함' : '동의 안 함'}
                  </span>
                </div>

                {applicant.status === 'pending' && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {suggested ? (
                      <button onClick={() => handleMatch(applicant, suggested.uid)}
                        className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors">
                        ✓ {suggested.nameKr} 계정과 매칭
                      </button>
                    ) : (
                      <select
                        onChange={e => e.target.value && handleMatch(applicant, e.target.value)}
                        defaultValue=""
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
                        <option value="" disabled>학생 계정 직접 선택...</option>
                        {students.map(s => (
                          <option key={s.uid} value={s.uid}>{s.nameKr} ({s.nameEn})</option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => handleReject(applicant)}
                      className="text-xs font-bold text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors">
                      거절
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}