'use client'
// 📁 app/student/page.tsx

import { useState, useEffect, useRef } from 'react'
import RoleGuard from '@/components/auth/RoleGuard'
import Header from '@/components/layout/Header'
import BoardFeed from '@/components/board/BoardFeed'
import SubmissionEditor from '@/components/student/SubmissionEditor'
import FeedbackViewer from '@/components/student/FeedbackViewer'
import QuizPlayer from '@/components/student/QuizPlayer'
import { useAuth } from '@/lib/auth/authContext'
import { getAssignmentsByClass } from '@/lib/firestore/assignments'
import { getMySubmissions, submitFreeWriting } from '@/lib/firestore/submissions'
import { getFeedbackBySubmission } from '@/lib/firestore/feedback'
import { getPublishedQuizzesByClass, getMyAttempts } from '@/lib/firestore/quizzes'
import { Assignment, Submission } from '@/types/assignment'
import { Feedback } from '@/types/feedback'
import { Quiz, QuizAttempt } from '@/types/quiz'
import { formatDate } from '@/lib/utils/classUtils'

type Tab = 'main' | 'quiz'

export default function StudentPage() {
  const { appUser } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [quizzes, setQuizzes]         = useState<Quiz[]>([])
  const [myAttempts, setMyAttempts]   = useState<QuizAttempt[]>([])
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [viewFeedback, setViewFeedback] = useState<{ feedback: Feedback; content: string } | null>(null)
  const [playQuiz, setPlayQuiz]       = useState<Quiz | null>(null)
  const [showFreeWrite, setShowFreeWrite] = useState(false)
  const [freeTopic, setFreeTopic]     = useState('')
  const [freeContent, setFreeContent] = useState('')
  const [pasteCount, setPasteCount]   = useState(0)
  const [freeSubmitting, setFreeSubmitting] = useState(false)

  // ── 자유작문 작성 시간 추적 ────────────────────────────────────
  const fwStartedAtRef     = useRef<number | null>(null)
  const fwActiveMsRef      = useRef<number>(0)
  const fwLastVisibleAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!showFreeWrite) return
    // 모달이 열릴 때 시작 시각 기록 + 활성 시간 초기화
    fwStartedAtRef.current     = Date.now()
    fwActiveMsRef.current      = 0
    fwLastVisibleAtRef.current = Date.now()

    const handleVisibility = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') {
        fwLastVisibleAtRef.current = now
      } else if (fwLastVisibleAtRef.current !== null) {
        fwActiveMsRef.current += now - fwLastVisibleAtRef.current
        fwLastVisibleAtRef.current = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [showFreeWrite])

  const finalizeFwActiveMs = () => {
    if (fwLastVisibleAtRef.current !== null) {
      fwActiveMsRef.current += Date.now() - fwLastVisibleAtRef.current
      fwLastVisibleAtRef.current = Date.now()
    }
    return fwActiveMsRef.current
  }
  const [toast, setToast]             = useState('')
  const [activeTab, setActiveTab]     = useState<Tab>('main')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadData = async () => {
    if (!appUser) return
    const [asns, subs, qs, attempts] = await Promise.all([
      getAssignmentsByClass(appUser.classId),
      getMySubmissions(appUser.uid),
      getPublishedQuizzesByClass(appUser.schoolId, appUser.semester, appUser.classId),
      getMyAttempts(appUser.uid),
    ])
    setAssignments(asns)
    setSubmissions(subs)
    setQuizzes(qs)
    setMyAttempts(attempts)
  }

  useEffect(() => { loadData() }, [appUser])  // eslint-disable-line react-hooks/exhaustive-deps

  const getSubForAssignment = (id: string) => submissions.find(s => s.assignmentId === id)

  const hasAttempted = (quizId: string) => myAttempts.some(a => a.quizId === quizId)
  const getScore = (quizId: string) => {
    const a = myAttempts.find(a => a.quizId === quizId)
    return a ? `${a.score}/${a.totalQuestions}` : null
  }

  const handleViewFeedback = async (sub: Submission) => {
    const fb = await getFeedbackBySubmission(sub.id)
    if (fb?.teacherApproved) setViewFeedback({ feedback: fb, content: sub.content })
    else showToast('아직 피드백이 준비 중이에요')
  }

  // ── 자유작문 제출 ──────────────────────────────────────────────
  // ⚠️ 기존엔 submitFreeWriting()만 호출하고 /api/feedback을 부르지 않아서
  // AI 분석이 아예 시작되지 않는 버그가 있었음. 일반 과제와 동일하게
  // 제출 즉시 화면을 닫고, AI 피드백은 백그라운드로 생성되게 함.
  const handleFreeSubmit = async () => {
    if (!appUser || !freeContent.trim()) return
    setFreeSubmitting(true)
    try {
      const submitTime = Date.now()
      const activeMs   = finalizeFwActiveMs()
      const totalMs    = fwStartedAtRef.current ? submitTime - fwStartedAtRef.current : undefined

      const fwId = await submitFreeWriting({
        studentUid: appUser.uid, classId: appUser.classId,
        topic: freeTopic, content: freeContent,
        charCount: freeContent.length, pasteAttempts: pasteCount,
        status: 'pending_approval',
        startedAt:        fwStartedAtRef.current ? new Date(fwStartedAtRef.current) : undefined,
        activeDurationMs: activeMs,
        totalDurationMs:  totalMs,
      })

      // AI 피드백 생성 요청 — await 하지 않고 백그라운드로 던짐 (학생을 기다리게 하지 않음)
      fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          submissionId:     fwId,
          content:          freeContent,
          contentType:      'freeWriting',
          level:            '고급',
          assignment:       freeTopic ? `자유작문 (주제: ${freeTopic})` : '자유작문',
          studentUid:       appUser.uid,
          classId:          appUser.classId,
          schoolId:         appUser.schoolId,
          semester:         appUser.semester,
          sourceCollection: 'freeWritings',
        }),
      }).catch(e => console.error('자유작문 AI 피드백 요청 실패(백그라운드):', e))

      setShowFreeWrite(false); setFreeTopic(''); setFreeContent(''); setPasteCount(0)
      showToast('제출됐어요! 선생님이 확인 후 피드백을 보내드려요 😊')
    } catch (e) {
      console.error(e)
      showToast('제출 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setFreeSubmitting(false)
    }
  }

  const newQuizCount = quizzes.filter(q => !hasAttempted(q.id)).length

  return (
    <RoleGuard allowedRoles={['student', 'admin']}>
      <div className="min-h-screen bg-[#F5F5FF]">
        <Header/>
        <main className="max-w-[680px] mx-auto px-5 py-5">

          {/* 상단 버튼들 */}
          <div className="flex gap-3 mb-5">
            <button onClick={() => assignments[0] && setSelectedAssignment(assignments[0])}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-2xl px-5 py-4 flex items-center gap-3 font-bold text-sm shadow-lg shadow-indigo-200 hover:-translate-y-0.5 transition-transform">
              <span className="text-2xl">📝</span>
              <span>숙제</span>
              {assignments.filter(a => !getSubForAssignment(a.id)).length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
                  {assignments.filter(a => !getSubForAssignment(a.id)).length}
                </span>
              )}
            </button>
            {appUser?.freeWritingEnabled && (
              <button onClick={() => setShowFreeWrite(true)}
                className="bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-2xl px-5 py-4 flex items-center gap-2 font-bold text-sm shadow-lg shadow-orange-200 hover:-translate-y-0.5 transition-transform whitespace-nowrap">
                ✏️ 자유 작문
              </button>
            )}
          </div>

          {/* 탭 */}
          <div className="flex gap-1 bg-indigo-100 p-1 rounded-xl mb-5">
            {([
              { key: 'main', label: '📚 홈' },
              { key: 'quiz', label: `🎯 퀴즈${newQuizCount > 0 ? ` (${newQuizCount})` : ''}` },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all
                  ${activeTab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── 메인 탭 ── */}
          {activeTab === 'main' && (
            <>
              {assignments.map(assignment => {
                const sub = getSubForAssignment(assignment.id)
                return (
                  <div key={assignment.id} className="bg-gradient-to-br from-indigo-50 to-orange-50 border border-indigo-100 rounded-2xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                        ${sub ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {sub
                          ? (sub.status === 'feedback_sent' || sub.status === 'read' ? '✅ 피드백 완료' : '📤 제출 완료')
                          : '📌 미제출'}
                      </span>
                      <span className="text-xs text-gray-400">마감: {formatDate(assignment.dueDate)}</span>
                    </div>
                    <h3 className="font-bold text-base mb-2">{assignment.title}</h3>
                    <div className="bg-white rounded-xl p-3 text-sm leading-relaxed text-gray-700 mb-3">
                      {assignment.description}
                    </div>
                    {!sub ? (
                      <button onClick={() => setSelectedAssignment(assignment)}
                        className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
                        ✏️ 과제 제출하기
                      </button>
                    ) : (sub.status === 'feedback_sent' || sub.status === 'read') ? (
                      <button onClick={() => handleViewFeedback(sub)}
                        className="border-2 border-indigo-200 text-indigo-600 text-sm font-bold px-4 py-2 rounded-xl hover:bg-indigo-50 transition-colors">
                        피드백 확인하기 →
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">제출 완료 · 선생님 검토를 기다리고 있어요</span>
                    )}
                  </div>
                )
              })}
              <BoardFeed/>
            </>
          )}

          {/* ── 퀴즈 탭 ── */}
          {activeTab === 'quiz' && (
            <div className="space-y-3">
              {quizzes.length === 0 ? (
                <div className="text-center text-gray-400 py-12 text-sm">
                  <div className="text-4xl mb-3">🎯</div>
                  아직 배포된 퀴즈가 없어요.<br/>선생님이 퀴즈를 만들면 여기서 확인하세요!
                </div>
              ) : quizzes.map(quiz => {
                const attempted  = hasAttempted(quiz.id)
                const scoreLabel = getScore(quiz.id)
                return (
                  <div key={quiz.id} className={`border-2 rounded-2xl p-5 transition-all
                    ${attempted ? 'border-green-200 bg-green-50' : 'border-indigo-200 bg-white hover:border-indigo-400'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-sm">{quiz.title}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                            ${quiz.purpose === 'review' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                            {quiz.purpose === 'review' ? '복습' : '시험'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {quiz.questions.length}문항
                          {quiz.dueDate && ` · 마감: ${formatDate(quiz.dueDate)}`}
                        </div>
                        {scoreLabel && (
                          <div className="text-xs font-bold text-green-600 mt-1">✅ 점수: {scoreLabel}점</div>
                        )}
                      </div>
                      <button
                        onClick={() => setPlayQuiz(quiz)}
                        className={`text-sm font-bold px-4 py-2 rounded-xl transition-colors flex-shrink-0
                          ${attempted
                            ? 'border-2 border-green-200 text-green-700 hover:bg-green-100'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                        {attempted ? '다시 풀기' : '퀴즈 풀기 →'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>

        {/* ── 자유 작문 모달 ── */}
        {showFreeWrite && (
          <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
            <div className="bg-white rounded-3xl p-8 w-full max-w-[520px] shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-lg">✏️ 자유 작문 연습</h2>
                <button onClick={() => setShowFreeWrite(false)} className="text-gray-400 text-2xl">✕</button>
              </div>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 mb-1.5 block">주제 (선택)</label>
                  <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
                    placeholder="예: 나의 하루 일과" value={freeTopic} onChange={e => setFreeTopic(e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 mb-1.5 block">내용</label>
                  <textarea
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm min-h-[160px] resize-none outline-none focus:border-indigo-500 font-['Noto_Sans_KR'] leading-relaxed"
                    placeholder="자유롭게 써 보세요. 제출하면 곧 AI 피드백을 받을 수 있어요."
                    value={freeContent}
                    onChange={e => setFreeContent(e.target.value)}
                    onPaste={e => { e.preventDefault(); setPasteCount(c => c + 1); showToast('⚠️ 복사·붙여넣기는 지원되지 않아요.') }}
                  />
                  <div className="text-right text-xs text-gray-400 mt-0.5">{freeContent.length}자</div>
                </div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700 mb-4">
                💡 제출하면 AI 피드백이 만들어지고, 선생님 확인 후 전달돼요.
              </div>
              <button onClick={handleFreeSubmit} disabled={freeSubmitting || !freeContent.trim()}
                className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-indigo-700 transition-colors disabled:opacity-60">
                {freeSubmitting ? '제출 중...' : '제출하기 🚀'}
              </button>
            </div>
          </div>
        )}

        {selectedAssignment && (
          <SubmissionEditor
            assignment={selectedAssignment}
            onClose={() => setSelectedAssignment(null)}
            onSubmit={() => {
              setSelectedAssignment(null)
              showToast('제출 완료! 곧 피드백을 받을 수 있어요 🎉')
              getMySubmissions(appUser!.uid).then(setSubmissions)
            }}
          />
        )}
        {viewFeedback && (
          <FeedbackViewer
            feedback={viewFeedback.feedback}
            submissionContent={viewFeedback.content}
            onClose={() => setViewFeedback(null)}
          />
        )}
        {playQuiz && (
          <QuizPlayer
            quiz={playQuiz}
            onClose={() => setPlayQuiz(null)}
            onComplete={(s, t) => {
              setPlayQuiz(null)
              showToast(`퀴즈 완료! ${s}/${t}개 정답`)
              getMyAttempts(appUser!.uid).then(setMyAttempts)
            }}
          />
        )}

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-[60]">
            {toast}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}