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
import { getSubmissionsByClass, getFreeWritingsByClass } from '@/lib/firestore/submissions'
import { getAssignmentsByClass } from '@/lib/firestore/assignments'
import { getFeedbackBySubmission } from '@/lib/firestore/feedback'
import { AppUser } from '@/types/user'
import { Submission, FreeWriting, Assignment } from '@/types/assignment'
import { Feedback } from '@/types/feedback'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

type Panel = 'main' | 'quizzes' | 'roster'

// 자유작문도 FeedbackEditor에 넘길 수 있도록 Submission과 동일한 최소 형태로 변환
// (assignmentId는 자유작문엔 없으니 topic을 대신 담아 표시용으로만 사용)
function freeWritingToSubmissionShape(fw: FreeWriting): Submission {
  return {
    id:            fw.id,
    assignmentId:  `freeWriting:${fw.topic || '자유작문'}`,
    studentUid:    fw.studentUid,
    classId:       fw.classId,
    content:       fw.content,
    charCount:     fw.charCount,
    pasteAttempts: fw.pasteAttempts,
    pasteAllowed:  false,
    status:        fw.status as Submission['status'],
    submittedAt:   fw.submittedAt,
  }
}

export default function TeacherPage() {
  const { appUser }                   = useAuth()
  const [students,     setStudents]   = useState<AppUser[]>([])
  const [assignments,  setAssignments]= useState<Assignment[]>([])
  const [submissions,  setSubmissions]= useState<Submission[]>([])
  const [freeWritings, setFreeWritings] = useState<FreeWriting[]>([])
  const [reviewing,    setReviewing]  = useState<{
    student: AppUser; sub: Submission; feedback: Feedback | null; isFreeWriting?: boolean
    previousAttempt?: { submission: Submission; feedback: Feedback | null } | null
  } | null>(null)
  const [showAssign,   setShowAssign] = useState(false)
  const [showQuizGen,  setShowQuizGen]= useState(false)
  const [showErrorPattern, setShowErrorPattern] = useState(false)
  const [panel,        setPanel]      = useState<Panel>('main')
  const [quizRefresh,  setQuizRefresh]= useState(0)
  const [toast,        setToast]      = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadData = async () => {
    if (!appUser) return
    const [s, asns, subs, fws] = await Promise.all([
      getUsersByClass(appUser.classId),
      getAssignmentsByClass(appUser.classId),
      getSubmissionsByClass(appUser.classId),
      getFreeWritingsByClass(appUser.classId),
    ])
    setStudents(s)
    setAssignments(asns)
    setSubmissions(subs)
    setFreeWritings(fws)
  }

  useEffect(() => { loadData() }, [appUser])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleReview = async (studentUid: string, sub: Submission) => {
    const student = students.find(s => s.uid === studentUid)
    if (!student) return
    const fb = await getFeedbackBySubmission(sub.id)

    // 2차 이상 제출이면 같은 과제의 이전 시도(바로 직전 것)를 찾아서 비교용으로 함께 조회
    let previousAttempt = null
    if ((sub.attemptNumber ?? 1) > 1) {
      const sameAssignment = submissions
        .filter(s => s.assignmentId === sub.assignmentId && s.studentUid === studentUid && s.id !== sub.id)
        .sort((a, b) => (b.submittedAt?.getTime?.() ?? 0) - (a.submittedAt?.getTime?.() ?? 0))
      const prev = sameAssignment[0]
      if (prev) {
        const prevFb = await getFeedbackBySubmission(prev.id)
        previousAttempt = { submission: prev, feedback: prevFb }
      }
    }

    setReviewing({ student, sub, feedback: fb, previousAttempt })
  }

  // 자유작문 검토 — Submission 형태로 변환해서 같은 FeedbackEditor 재사용
  const handleReviewFreeWriting = async (studentUid: string, fw: FreeWriting) => {
    const student = students.find(s => s.uid === studentUid)
    if (!student) return
    const fb = await getFeedbackBySubmission(fw.id)
    setReviewing({ student, sub: freeWritingToSubmissionShape(fw), feedback: fb, isFreeWriting: true })
  }

  const pendingReview = submissions.filter(s => s.status === 'ai_done').length
    + freeWritings.filter(f => f.status === 'ai_done').length
  const [onlyPending, setOnlyPending] = useState(false)

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
                    <button onClick={() => { setPanel('main'); setOnlyPending(true) }}
                      className="ml-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-black px-2 py-0.5 rounded-full transition-colors">
                      검토 필요 {pendingReview}건 →
                    </button>
                  )}
                </div>
              </div>

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

          <div className="flex gap-1 bg-indigo-100 p-1 rounded-xl mb-5 w-fit">
            {PANELS.map(p => (
              <button key={p.key} onClick={() => setPanel(p.key)}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap
                  ${panel === p.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {panel === 'main' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <StudentList
                students={students}
                assignments={assignments}
                submissions={submissions}
                freeWritings={freeWritings}
                onlyPending={onlyPending}
                onClearFilter={() => setOnlyPending(false)}
                onReview={handleReview}
                onReviewFreeWriting={handleReviewFreeWriting}
              />
              <BoardFeed />
            </div>
          )}

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

        {reviewing && (
          <FeedbackEditor
            student={reviewing.student}
            submission={reviewing.sub}
            feedback={reviewing.feedback}
            isFreeWriting={reviewing.isFreeWriting}
            previousAttempt={reviewing.previousAttempt}
            onFeedbackReady={fb => setReviewing(r => r ? { ...r, feedback: fb } : r)}
            onClose={() => setReviewing(null)}
            onSent={() => { setReviewing(null); loadData(); showToast('피드백이 전송됐어요! 🎉') }}
          />
        )}
        {showAssign && (
          <AssignmentModal
            onClose={() => setShowAssign(false)}
            onCreated={() => { setShowAssign(false); loadData(); showToast('숙제가 출제됐어요!') }}
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
          <ErrorPatternViewer onClose={() => setShowErrorPattern(false)} students={students} />
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