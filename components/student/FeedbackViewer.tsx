'use client'
import { Feedback } from '@/types/feedback'
import { markFeedbackRead } from '@/lib/firestore/feedback'

interface Props {
  feedback: Feedback
  submissionContent: string
  onClose: () => void
  isFreeWriting?: boolean   // true면 freeWritings 컬렉션 상태를 'read'로 갱신
}

export default function FeedbackViewer({ feedback, submissionContent, onClose, isFreeWriting }: Props) {
  const handleClose = async () => {
    await markFeedbackRead(feedback.submissionId, isFreeWriting ? 'freeWritings' : 'submissions')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">💌 피드백이 도착했어요!</h2>
          <button onClick={handleClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm leading-relaxed text-gray-700 mb-5 max-h-[150px] overflow-y-auto">
          {submissionContent}
        </div>

        {/* 선생님 피드백 (AI 관여는 작은 배지로만 표시) */}
        <div className="bg-indigo-50 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-indigo-700">📋 선생님 피드백</h3>
            <span
              title="AI가 초안을 만들고 선생님이 검토했어요"
              className="text-[10px] font-semibold text-indigo-300 bg-white/60 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-help">
              🤖 AI 도움
            </span>
          </div>
          {[
            ['✅ 잘한 점', feedback.aiFeedback.positive],
            ['📝 문법',    feedback.aiFeedback.grammar],
            ['📚 어휘',    feedback.aiFeedback.vocabulary],
            ['🏗️ 구조',   feedback.aiFeedback.structure],
          ].map(([label, text]) => (
            <div key={label} className="mb-3 last:mb-0">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
              <div className="text-sm leading-relaxed text-gray-800">{text}</div>
            </div>
          ))}
        </div>

        {/* 선생님 코멘트 */}
        {feedback.teacherComment && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-orange-600 mb-3 flex items-center gap-2">💬 선생님의 한마디</h3>
            <p className="text-sm leading-relaxed text-gray-800">{feedback.teacherComment}</p>
          </div>
        )}

        <button onClick={handleClose}
          className="w-full mt-5 bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors">
          확인했어요
        </button>
      </div>
    </div>
  )
}