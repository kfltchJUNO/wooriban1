'use client'
// app/admin/page.tsx

import { useState, useEffect } from 'react'
import RoleGuard from '@/components/auth/RoleGuard'
import Header from '@/components/layout/Header'
import TextbookUpload from '@/components/admin/TextbookUpload'
import TextbookList from '@/components/admin/TextbookList'
import TeacherCodeManager from '@/components/admin/TeacherCodeManager'
import SchoolManager from '@/components/admin/SchoolManager'
import ResearchFormSettingsPanel from '@/components/admin/ResearchFormSettings'
import ResearchAccountManager from '@/components/admin/ResearchAccountManager'
import ResearchApplicantsPanel from '@/components/admin/ResearchApplicantsPanel'
import { getAllUsers, getPendingUsers, approveUser, rejectUser, deleteUser, updateFreeWritingEnabled, updateResearchParticipant } from '@/lib/firestore/users'
import { deleteTextbook } from '@/lib/firestore/textbooks'
import { getAllTeacherCodes } from '@/lib/firestore/teacherCodes'
import { updateDoc, doc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { AppUser } from '@/types/user'
import { Textbook } from '@/types/textbook'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

type Tab = 'users' | 'pending' | 'textbooks' | 'teacherCodes' | 'schools' | 'research'

export default function AdminPage() {
  const [tab, setTab]               = useState<Tab>('users')
  const [users, setUsers]           = useState<AppUser[]>([])
  const [pending, setPending]       = useState<AppUser[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [tbRefresh, setTbRefresh]   = useState(0)
  const [toast, setToast]           = useState('')
  // 파일 교체: 기존 교재를 삭제하고 새로 업로드
  const [reUploadTarget, setReUploadTarget] = useState<Textbook | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadAll = async () => {
    const [all, pend] = await Promise.all([getAllUsers(), getPendingUsers()])
    setUsers(all)
    setPending(pend)
  }
  useEffect(() => { loadAll() }, [])

  const handleApprove = async (user: AppUser) => {
    await approveUser(user.uid, user.classId, users.filter(u => u.classId === user.classId).length + 1)
    showToast(`${user.nameKr} 승인 완료!`)
    loadAll()
  }

  const handleReject = async (user: AppUser) => {
    if (!confirm(`${user.nameKr} 가입 요청을 거절할까요?`)) return
    await rejectUser(user.uid)
    showToast(`${user.nameKr} 거절됨`)
    loadAll()
  }

  // ── 학생 계정의 roster 연결 초기화 ────────────────────────────
  // 계정 삭제 후에도 roster.status가 'registered'로 남아있으면
  // 같은 학번/영문명으로 재가입이 영구히 막히는 문제가 있어 반드시 필요
  const resetRosterForUid = async (uid: string) => {
    const q = query(collection(db, 'roster'), where('uid', '==', uid))
    const snap = await getDocs(q)
    await Promise.all(
      snap.docs.map(d => updateDoc(doc(db, 'roster', d.id), {
        status: 'unregistered',
        uid: null,
      }))
    )
    return snap.size
  }

  // ── 학생 삭제 ─────────────────────────────────────────────────
  const handleDeleteUser = async (user: AppUser) => {
    if (!confirm(`"${user.nameKr}"를 삭제할까요?\nFirebase 계정과 데이터가 모두 삭제되며 되돌릴 수 없어요.`)) return
    try {
      // 선생님이면 코드 초기화
      if (user.role === 'teacher') {
        const codes = await getAllTeacherCodes()
        const usedCode = codes.find(c => c.usedBy === user.uid)
        if (usedCode) {
          await updateDoc(doc(db, 'teacherCodes', usedCode.code), {
            used: false, usedBy: null,
          })
        }
      }

      // 학생이면 roster 연결 초기화 (재가입 가능하게)
      let rosterReset = 0
      if (user.role === 'student') {
        rosterReset = await resetRosterForUid(user.uid)
      }

      // Firestore 문서 삭제
      await deleteUser(user.uid)

      // Firebase Auth 계정 삭제 (Admin SDK API)
      const { getAuth } = await import('firebase/auth')
      const currentUser = getAuth().currentUser
      if (currentUser) {
        const token = await currentUser.getIdToken()
        await fetch('/api/admin/delete-user', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ uid: user.uid }),
        })
      }

      showToast(
        rosterReset > 0
          ? `${user.nameKr} 계정이 완전히 삭제됐어요. (출석부 재가입 가능 상태로 초기화됨)`
          : `${user.nameKr} 계정이 완전히 삭제됐어요.`
      )
      loadAll()
    } catch (e) {
      showToast('삭제 중 오류가 발생했어요.')
      console.error(e)
    }
  }

  // ── 교재 파일 교체 ────────────────────────────────────────────
  const handleReUpload = async (tb: Textbook) => {
    if (!confirm(`"${tb.title}" 파일을 교체할까요?\n기존 분석 데이터가 삭제되고 새로 분석합니다.`)) return
    await deleteTextbook(tb.id)
    setReUploadTarget(tb)
    setShowUpload(true)
    setTbRefresh(n => n + 1)
    showToast('기존 교재를 삭제했어요. 새 파일을 업로드해주세요.')
  }

  const ROLE_BADGE: Record<string, string> = {
    admin:   'bg-red-100 text-red-800',
    teacher: 'bg-blue-100 text-blue-800',
    student: 'bg-gray-100 text-gray-600',
  }
  const ROLE_LABEL: Record<string, string> = {
    admin:   '관리자',
    teacher: '선생님',
    student: '학생',
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'users',        label: '전체 사용자 목록' },
    { key: 'pending',      label: '가입 대기', badge: pending.length },
    { key: 'textbooks',    label: '교재 관리' },
    { key: 'teacherCodes', label: '선생님 코드' },
    { key: 'schools',      label: '학교/반 관리' },
    { key: 'research',     label: '🔬 연구' },
  ]

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-[#F5F5FF]">
        <Header/>
        <main className="max-w-[960px] mx-auto px-5 py-5">

          {/* 상단 배너 */}
          <div className="bg-gradient-to-r from-[#1E1B4B] to-[#312E81] text-white rounded-2xl px-6 py-5 mb-5 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-xl">관리자 대시보드</h1>
              <p className="text-sm opacity-70 mt-0.5">우리반 · 전체 관리</p>
            </div>
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              ['전체 사용자', users.length,         'text-indigo-600'],
              ['가입 대기',   pending.length,       'text-amber-500' ],
              ['활성 학생',   users.filter(u => u.role === 'student' && u.status === 'active').length, 'text-green-600'],
              ['선생님',      users.filter(u => u.role === 'teacher').length, 'text-blue-600'],
            ].map(([label, num, color]) => (
              <div key={label as string} className="bg-white rounded-2xl p-4 text-center shadow-md">
                <div className={`text-4xl font-black leading-none mb-1 ${color}`}>{num}</div>
                <div className="text-xs text-gray-400 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* 탭 */}
          <div className="flex gap-1 bg-indigo-100 p-1 rounded-xl mb-5 overflow-x-auto">
            {TABS.map(({ key, label, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 py-2.5 px-3 text-sm font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-1.5
                  ${tab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
                {badge ? (
                  <span className="bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full leading-none">{badge}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* 전체 사용자 목록 */}
          {tab === 'users' && (
            <div className="bg-white rounded-2xl p-6 shadow-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 font-bold border-b-2 border-gray-100">
                    <th className="text-left pb-3 px-3">이름</th>
                    <th className="text-left pb-3 px-3">아이디</th>
                    <th className="text-left pb-3 px-3">역할</th>
                    <th className="text-left pb-3 px-3">소속</th>
                    <th className="text-left pb-3 px-3">자유작문</th>
                    <th className="text-left pb-3 px-3">🔬 연구</th>
                    <th className="text-left pb-3 px-3">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter(u => u.status === 'active').map(user => (
                    <tr key={user.uid} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 font-bold">{user.nameKr}</td>
                      <td className="py-3 px-3 text-gray-400 text-xs">{user.email.replace('@wooriban.app', '')}</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_BADGE[user.role]}`}>
                          {ROLE_LABEL[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-400">
                        {formatSchool(user.schoolId)} · {formatSemester(user.semester)} · {formatClass(user.classId)}
                      </td>
                      <td className="py-3 px-3">
                        {user.role === 'student' && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={user.freeWritingEnabled}
                              onChange={async e => { await updateFreeWritingEnabled(user.uid, e.target.checked); loadAll() }}
                              className="w-4 h-4 cursor-pointer accent-indigo-600"/>
                            <span className="text-xs">{user.freeWritingEnabled ? '활성' : '비활성'}</span>
                          </label>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!user.researchParticipant}
                            onChange={async e => { await updateResearchParticipant(user.uid, e.target.checked); loadAll() }}
                            className="w-4 h-4 cursor-pointer accent-purple-600"/>
                          <span className={`text-xs ${user.researchParticipant ? 'text-purple-600 font-bold' : 'text-gray-400'}`}>
                            {user.researchParticipant ? '참여자' : '-'}
                          </span>
                        </label>
                      </td>
                      <td className="py-3 px-3">
                        {user.role !== 'admin' && (
                          <button onClick={() => handleDeleteUser(user)}
                            className="text-xs text-red-400 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 font-bold transition-colors">
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 가입 대기 */}
          {tab === 'pending' && (
            <div className="bg-white rounded-2xl p-6 shadow-md space-y-3">
              {pending.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">대기 중인 가입 요청이 없어요.</p>
              ) : pending.map(user => (
                <div key={user.uid} className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl hover:border-indigo-200 transition-colors">
                  <div>
                    <div className="font-bold text-sm">{user.nameKr}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {user.email.replace('@wooriban.app', '')} · {user.role} ·{' '}
                      {formatSchool(user.schoolId)} {formatSemester(user.semester)} {formatClass(user.classId)} 신청
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(user)}
                      className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                      승인
                    </button>
                    <button onClick={() => handleReject(user)}
                      className="bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 교재 관리 */}
          {tab === 'textbooks' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-6 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-base">등록 교재 목록</h3>
                    <p className="text-xs text-gray-400 mt-0.5">교재 업로드는 관리자만 가능합니다</p>
                  </div>
                  <button onClick={() => { setReUploadTarget(null); setShowUpload(!showUpload) }}
                    className={`text-sm font-bold px-5 py-2.5 rounded-xl transition-colors
                      ${showUpload ? 'bg-gray-100 text-gray-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {showUpload ? '닫기' : '+ 교재 업로드'}
                  </button>
                </div>

                {showUpload && (
                  <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-5 mb-5 bg-indigo-50">
                    <p className="text-sm font-bold text-indigo-700 mb-1">
                      {reUploadTarget ? `"${reUploadTarget.title}" 파일 교체` : '새 교재 업로드'}
                    </p>
                    {reUploadTarget && (
                      <p className="text-xs text-amber-600 mb-3">기존 데이터가 삭제됐어요. 새 파일을 업로드하면 다시 분석해요.</p>
                    )}
                    <TextbookUpload onUploaded={() => {
                      setShowUpload(false)
                      setReUploadTarget(null)
                      setTbRefresh(n => n + 1)
                      showToast('교재가 성공적으로 등록됐어요.')
                    }}/>
                  </div>
                )}

                <TextbookList
                  key={tbRefresh}
                  onRefresh={() => setTbRefresh(n => n + 1)}
                  onReUpload={handleReUpload}
                />
              </div>
            </div>
          )}

          {/* 선생님 코드 관리 */}
          {tab === 'teacherCodes' && (
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <TeacherCodeManager />
            </div>
          )}

          {/* 학교/반 관리 */}
          {tab === 'schools' && (
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <SchoolManager />
            </div>
          )}

          {/* 연구 (참여 신청 폼 + 신청자 목록 + 연구용 계정) */}
          {tab === 'research' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-6 shadow-md">
                <ResearchFormSettingsPanel />
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-md">
                <ResearchApplicantsPanel />
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-md">
                <ResearchAccountManager />
              </div>
            </div>
          )}
        </main>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
            {toast}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}