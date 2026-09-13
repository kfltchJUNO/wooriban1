'use client'
import { useState } from 'react'
import { Feedback } from '@/types/feedback'
import { markFeedbackRead } from '@/lib/firestore/feedback'
import ManuscriptGrid from '@/components/common/ManuscriptGrid'

interface Props {
  feedback: Feedback
  submissionContent: string
  onClose: () => void
  isFreeWriting?: boolean   // true면 freeWritings 컬렉션 상태를 'read'로 갱신
}

export default function FeedbackViewer({ feedback, submissionContent, onClose, isFreeWriting }: Props) {
  const [showManuscript, setShowManuscript] = useState(false)

  const handleClose = async () => {
    await markFeedbackRead(feedback.submissionId, isFreeWriting ? 'freeWritings' : 'submissions')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">💌 피드백이 도착했어요!</h2>
          <button onClick={handleClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        {/* 원고지 뷰 토글 버튼 */}
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className="font-bold text-gray-500">내 작성 글</span>
          <button
            onClick={() => setShowManuscript(v => !v)}
            className="text-[11px] font-bold text-[#8C4A2F] bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <span>📜</span>
            <span>{showManuscript ? '일반 글로 보기' : '원고지 규격으로 보기'}</span>
          </button>
        </div>

        {showManuscript ? (
          <div className="mb-5 max-h-[200px] overflow-y-auto">
            <ManuscriptGrid text={submissionContent} />
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm leading-relaxed text-gray-700 mb-5 max-h-[150px] overflow-y-auto whitespace-pre-wrap font-['Noto_Sans_KR']">
            {submissionContent}
          </div>
        )}

        {/* TOPIK 예상 점수 및 모범 답안 */}
        {feedback.aiFeedback.topikScore && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-amber-800">🏆 TOPIK 예상 점수 및 총평</span>
              <span className="text-sm font-black text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                {feedback.aiFeedback.topikScore}
              </span>
            </div>
            {feedback.aiFeedback.topikModelEssay && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <div className="text-xs font-bold text-amber-700 mb-1">📖 TOPIK 고득점 모범 답안</div>
                <div className="bg-white/80 rounded-xl p-3 text-xs leading-relaxed text-gray-800 font-['Noto_Sans_KR'] whitespace-pre-wrap">
                  {feedback.aiFeedback.topikModelEssay}
                </div>
              </div>
            )}
          </div>
        )}

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