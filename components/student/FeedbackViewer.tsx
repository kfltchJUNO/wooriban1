'use client'
import { Feedback } from '@/types/feedback'
import { markFeedbackRead } from '@/lib/firestore/feedback'

interface Props {
  feedback: Feedback
  submissionContent: string
  onClose: () => void
}

export default function FeedbackViewer({ feedback, submissionContent, onClose }: Props) {
  const handleClose = async () => {
    await markFeedbackRead(feedback.submissionId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">📬 피드백 도착!</h2>
          <button onClick={handleClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm leading-relaxed text-gray-700 mb-5 max-h-[150px] overflow-y-auto">
          {submissionContent}
        </div>

        {/* AI 피드백 */}
        <div className="bg-indigo-50 rounded-2xl p-5 mb-4">
          <h3 className="text-sm font-bold text-indigo-700 mb-4 flex items-center gap-2">🤖 AI 피드백</h3>
          {[
            ['✅ 잘한 점',  feedback.aiFeedback.positive],
            ['📝 문법',     feedback.aiFeedback.grammar],
            ['📚 어휘',     feedback.aiFeedback.vocabulary],
            ['🏗️ 구조',    feedback.aiFeedback.structure],
          ].map(([label, text]) => (
            <div key={label} className="mb-3 last:mb-0">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
              <div className="text-sm leading-relaxed text-gray-800">{text}</div>
            </div>
          ))}
        </div>

        {/* 선생님 의견 */}
        {feedback.teacherComment && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-orange-600 mb-3 flex items-center gap-2">👩‍🏫 선생님 의견</h3>
            <p className="text-sm leading-relaxed text-gray-800">{feedback.teacherComment}</p>
          </div>
        )}

        <button onClick={handleClose}
          className="w-full mt-5 bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors">
          확인했어요 ✓
        </button>
      </div>
    </div>
  )
}
