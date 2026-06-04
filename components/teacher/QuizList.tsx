// 📁 components/teacher/QuizList.tsx

'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { getQuizzesByTeacher, publishQuiz, unpublishQuiz, getAttemptsByQuiz } from '@/lib/firestore/quizzes'
import { Quiz } from '@/types/quiz'
import { formatDate } from '@/lib/utils/classUtils'

interface Props {
  refresh: number   // 외부에서 갱신 트리거
}

export default function QuizList({ refresh }: Props) {
  const { appUser }         = useAuth()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast]     = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = async () => {
    if (!appUser) return
    setLoading(true)
    const qs = await getQuizzesByTeacher(appUser.uid)
    setQuizzes(qs)
    // 각 퀴즈별 응시 수 조회
    const counts: Record<string, number> = {}
    await Promise.all(qs.map(async q => {
      const attempts = await getAttemptsByQuiz(q.id)
      counts[q.id] = attempts.length
    }))
    setAttemptCounts(counts)
    setLoading(false)
  }

  useEffect(() => { load() }, [appUser, refresh])

  const handleTogglePublish = async (quiz: Quiz) => {
    if (quiz.isPublished) {
      await unpublishQuiz(quiz.id)
      showToast('배포가 중지되었어요')
    } else {
      await publishQuiz(quiz.id)
      showToast('학생들에게 배포되었어요! 📤')
    }
    load()
  }

  if (loading) return <div className="text-center text-gray-400 py-8 text-sm animate-pulse">불러오는 중...</div>
  if (quizzes.length === 0) return (
    <div className="text-center text-gray-400 py-8 text-sm">
      아직 생성된 퀴즈가 없어요.<br/>상단의 퀴즈 생성 버튼을 눌러보세요!
    </div>
  )

  return (
    <div className="space-y-3">
      {quizzes.map(quiz => (
        <div key={quiz.id} className="border border-gray-100 rounded-2xl p-4 hover:border-indigo-200 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-bold text-sm">{quiz.title}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                  ${quiz.purpose === 'review' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                  {quiz.purpose === 'review' ? '📚 복습' : '📝 시험'}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                  ${quiz.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {quiz.isPublished ? '배포 중' : '비공개'}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                <span>{quiz.questions.length}문항</span>
                <span>응시 {attemptCounts[quiz.id] ?? 0}명</span>
                <span>생성: {formatDate(quiz.createdAt)}</span>
                {quiz.dueDate && <span>마감: {formatDate(quiz.dueDate)}</span>}
              </div>
            </div>
            <button
              onClick={() => handleTogglePublish(quiz)}
              className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors flex-shrink-0
                ${quiz.isPublished
                  ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              {quiz.isPublished ? '배포 중지' : '배포하기'}
            </button>
          </div>
        </div>
      ))}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}