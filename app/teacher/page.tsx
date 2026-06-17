'use client'
// app/teacher/page.tsx

import { useState, useEffect } from 'react'
import RoleGuard from '@/components/auth/RoleGuard'
import Header from '@/components/layout/Header'
import BoardFeed from '@/components/board/BoardFeed'
import StudentList from '@/components/teacher/StudentList'
import FeedbackEditor from '@/components/teacher/FeedbackEditor'
import AssignmentModal from '@/components/teacher/AssignmentModal'
import QuizGenerator from '@/components/teacher/QuizGenerator'
import QuizList from '@/components/teacher/QuizList'
import ErrorPatternViewer from '@/components/teacher/ErrorPatternViewer'
import RosterManager from '@/components/teacher/RosterManager'
import { useAuth } from '@/lib/auth/authContext'
import { getUsersByClass } from '@/lib/firestore/users'
import { getSubmissionsByClass } from '@/lib/firestore/submissions'
import { getFeedbackBySubmission } from '@/lib/firestore/feedback'
import { AppUser } from '@/types/user'
import { Submission } from '@/types/assignment'
import { Feedback } from '@/types/feedback'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

type Panel = 'main' | 'quizzes' | 'roster'

export default function TeacherPage() {
  const { appUser }                   = useAuth()
  const [students,     setStudents]   = useState<AppUser[]>([])
  const [submissions,  setSubmissions]= useState<Submission[]>([])
  const [reviewing,    setReviewing]  = useState<{ student: AppUser; sub: Submission; feedback: Feedback | null } | null>(null)
  const [showAssign,   setShowAssign] = useState(false)
  const [showQuizGen,  setShowQuizGen]= useState(false)
  const [showErrorPattern, setShowErrorPattern] = useState(false)
  const [panel,        setPanel]      = useState<Panel>('main')
  const [quizRefresh,  setQuizRefresh]= useState(0)
  const [toast,        setToast]      = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadData = async () => {
    if (!appUser) return
    const [s, subs] = await Promise.all([
      getUsersByClass(appUser.classId),
      getSubmissionsByClass(appUser.classId),
    ])
    setStudents(s)
    setSubmissions(subs)
  }

  useEffect(() => { loadData() }, [appUser])

  const handleReview = async (studentUid: string, sub: Submission) => {
    const student = students.find(s => s.uid === studentUid)
    if (!student) return
    const fb = await getFeedbackBySubmission(sub.id)
    setReviewing({ student, sub, feedback: fb })
  }

  const pendingReview = submissions.filter(s => s.status === 'ai_done').length

  const PANELS: { key: Panel; label: string }[] = [
    { key: 'main',    label: '📋 학생 현황' },
    { key: 'quizzes', label: '🎯 퀴즈 목록' },
    { key: 'roster',  label: '👥 출석부 관리' },
  ]

  return (
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <div className="min-h-screen bg-[#F5F5FF]">
        <Header />
        <main className="max-w-[960px] mx-auto px-5 py-5">

          {/* 반 정보 배너 */}
          <div className="bg-gradient-to-r from-[#1E1B4B] to-indigo-700 text-white rounded-2xl px-6 py-5 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-base">
                  {formatSchool(appUser?.schoolId ?? '')} · {formatSemester(appUser?.semester ?? '')} · {formatClass(appUser?.classId ?? '')}
                </div>
                <div className="text-sm opacity-70 mt-0.5">
                  학생 {students.length}명
                  {pendingReview > 0 && (
                    <span className="ml-2 bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
                      검토 필요 {pendingReview}건
                    </span>
                  )}
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setShowAssign(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
                  📝 숙제 출제
                </button>
                <button onClick={() => setShowQuizGen(true)}
                  className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
                  🎯 퀴즈 생성
                </button>
                <button onClick={() => setShowErrorPattern(true)}
                  className="bg-white/15 hover:bg-white/25 text-white text-sm font-bold px-4 py-2.5 rounded-xl border border-white/30 transition-colors">
                  📊 오류 분석
                </button>
              </div>
            </div>
          </div>

          {/* 패널 탭 */}
          <div className="flex gap-1 bg-indigo-100 p-1 rounded-xl mb-5 w-fit">
            {PANELS.map(p => (
              <button key={p.key} onClick={() => setPanel(p.key)}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap
                  ${panel === p.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* 학생 현황 패널 */}
          {panel === 'main' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <StudentList students={students} submissions={submissions} onReview={handleReview} />
              <BoardFeed />
            </div>
          )}

          {/* 퀴즈 목록 패널 */}
          {panel === 'quizzes' && (
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg">퀴즈 목록</h2>
                <button onClick={() => setShowQuizGen(true)}
                  className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
                  + 새 퀴즈 생성
                </button>
              </div>
              <QuizList refresh={quizRefresh} />
            </div>
          )}

          {/* 출석부 관리 패널 */}
          {panel === 'roster' && appUser && (
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <RosterManager
                schoolId={appUser.schoolId}
                semester={appUser.semester}
                classId={appUser.classId}
              />
            </div>
          )}
        </main>

        {/* 모달들 */}
        {reviewing && (
          <FeedbackEditor
            student={reviewing.student}
            submission={reviewing.sub}
            feedback={reviewing.feedback}
            onClose={() => setReviewing(null)}
            onSent={() => { setReviewing(null); loadData(); showToast('피드백이 전송됐어요! 🎉') }}
          />
        )}
        {showAssign && (
          <AssignmentModal
            onClose={() => setShowAssign(false)}
            onCreated={() => { setShowAssign(false); showToast('숙제가 출제됐어요!') }}
          />
        )}
        {showQuizGen && (
          <QuizGenerator
            onClose={() => setShowQuizGen(false)}
            onCreated={() => {
              setShowQuizGen(false)
              setQuizRefresh(n => n + 1)
              setPanel('quizzes')
              showToast('퀴즈가 생성됐어요! 🎯')
            }}
          />
        )}
        {showErrorPattern && (
          <ErrorPatternViewer onClose={() => setShowErrorPattern(false)} />
        )}

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
            {toast}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}