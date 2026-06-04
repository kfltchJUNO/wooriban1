'use client'
import { useState } from 'react'
import { Submission } from '@/types/assignment'
import { Feedback } from '@/types/feedback'
import { approveFeedback } from '@/lib/firestore/feedback'
import { updateSubmissionStatus } from '@/lib/firestore/submissions'

interface Props {
  student: { nameKr: string }
  submission: Submission
  feedback: Feedback | null
  onClose: () => void
  onSent: () => void
}

export default function FeedbackEditor({ student, submission, feedback, onClose, onSent }: Props) {
  const [comment, setComment] = useState(feedback?.teacherComment ?? '')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!feedback) return
    setLoading(true)
    await approveFeedback(feedback.id, comment)
    await updateSubmissionStatus(submission.id, 'feedback_sent')
    onSent()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[580px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">📋 {student.nameKr} · 제출물 검토</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap text-xs text-gray-400">
          <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold">검토 대기</span>
          <span>글자 수: {submission.charCount}자</span>
          {submission.pasteAttempts > 0 && (
            <span className="text-red-400">붙여넣기 시도: {submission.pasteAttempts}회</span>
          )}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm leading-relaxed mb-5 max-h-[150px] overflow-y-auto">
          {submission.content}
        </div>

        {feedback ? (
          <>
            <div className="bg-indigo-50 rounded-2xl p-5 mb-4">
              <h3 className="text-sm font-bold text-indigo-700 mb-3">🤖 AI 피드백</h3>
              {[
                ['✅ 잘한 점', feedback.aiFeedback.positive],
                ['📝 문법',    feedback.aiFeedback.grammar],
                ['📚 어휘',    feedback.aiFeedback.vocabulary],
                ['🏗️ 구조',   feedback.aiFeedback.structure],
              ].map(([l, t]) => (
                <div key={l} className="mb-2.5 last:mb-0">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">{l}</div>
                  <div className="text-sm text-gray-800">{t}</div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">👩‍🏫 선생님 의견 (학생에게 표시됨)</label>
              <textarea
                className="w-full min-h-[90px] border-2 border-gray-200 rounded-xl p-3.5 text-sm font-['Noto_Sans_KR'] resize-none outline-none focus:border-orange-400 transition-colors"
                placeholder="응원 메시지나 추가 조언을 남겨보세요 😊"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <div className="text-right text-xs text-gray-400 mt-0.5">{comment.length}자</div>
            </div>

            <button onClick={handleSend} disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-60 transition-colors">
              {loading ? '전송 중...' : '피드백 전송하기 📨'}
            </button>
          </>
        ) : (
          <div className="text-center text-gray-400 text-sm py-8 animate-pulse">AI 피드백 생성 중... 🤖</div>
        )}
      </div>
    </div>
  )
}
