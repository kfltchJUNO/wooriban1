'use client'
import { useState } from 'react'
import { Submission } from '@/types/assignment'
import { Feedback, ErrorTag } from '@/types/feedback'
import { approveFeedback } from '@/lib/firestore/feedback'
import { updateSubmissionStatus, updateFreeWritingStatus } from '@/lib/firestore/submissions'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

interface Props {
  student: { nameKr: string }
  submission: Submission
  feedback: Feedback | null
  onClose: () => void
  onSent: () => void
  isFreeWriting?: boolean   // true면 freeWritings 컬렉션 상태를 갱신
}

const SEVERITY_LABEL: Record<string, { label: string; color: string }> = {
  minor:    { label: '경미',   color: 'bg-gray-100 text-gray-500' },
  moderate: { label: '보통',   color: 'bg-amber-100 text-amber-700' },
  major:    { label: '중요',   color: 'bg-red-100 text-red-700' },
}

export default function FeedbackEditor({ student, submission, feedback, onClose, onSent, isFreeWriting }: Props) {
  const [comment, setComment]   = useState(feedback?.teacherComment ?? '')
  const [loading, setLoading]   = useState(false)
  // 검수(대조군) 상태: 태그별로 '맞음'/'수정 필요' 표시 (오디팅용, 학생에게는 안 보임)
  const [auditChoices, setAuditChoices] = useState<Record<number, 'confirmed' | 'corrected'>>({})

  // AI 피드백 원문 수정 모드
  const [editingAI, setEditingAI] = useState(false)
  const [aiDraft, setAiDraft] = useState({
    positive:   feedback?.aiFeedback?.positive ?? '',
    grammar:    feedback?.aiFeedback?.grammar ?? '',
    vocabulary: feedback?.aiFeedback?.vocabulary ?? '',
    structure:  feedback?.aiFeedback?.structure ?? '',
  })

  const errorTags: ErrorTag[] = feedback?.aiFeedback?.errorTags ?? []
  const needsAudit = feedback?.needsAudit ?? false

  const handleAuditChoice = (idx: number, choice: 'confirmed' | 'corrected') => {
    setAuditChoices(prev => ({ ...prev, [idx]: choice }))
  }

  const handleSend = async () => {
    if (!feedback) return
    setLoading(true)
    try {
      // 선생님이 AI 원문을 수정했으면 feedback 문서의 aiFeedback 필드도 함께 갱신
      // (teacherEdited 플래그로 "선생님이 손본 피드백"임을 남김 — 연구/투명성 목적)
      const edited =
        aiDraft.positive   !== feedback.aiFeedback.positive ||
        aiDraft.grammar    !== feedback.aiFeedback.grammar ||
        aiDraft.vocabulary !== feedback.aiFeedback.vocabulary ||
        aiDraft.structure  !== feedback.aiFeedback.structure

      if (edited) {
        await updateDoc(doc(db, 'feedback', feedback.id), {
          'aiFeedback.positive':   aiDraft.positive,
          'aiFeedback.grammar':    aiDraft.grammar,
          'aiFeedback.vocabulary': aiDraft.vocabulary,
          'aiFeedback.structure':  aiDraft.structure,
          teacherEdited: true,
        })
      }

      await approveFeedback(feedback.id, comment)

      // 검수 대상이었고 선생님이 하나 이상 판정을 남겼으면 결과 저장
      // (AI 태깅 정확도 연구용 — 전체 확정/일부 수정 여부만 남김, 학생에게는 노출 안 됨)
      if (needsAudit && Object.keys(auditChoices).length > 0) {
        const allConfirmed = errorTags.every((_: ErrorTag, i: number) => auditChoices[i] === 'confirmed')
        await updateDoc(doc(db, 'feedback', feedback.id), {
          auditResult: allConfirmed ? 'confirmed' : 'corrected',
          auditedAt:   new Date(),
          auditDetail: auditChoices,
        })
      }

      if (isFreeWriting) {
        await updateFreeWritingStatus(submission.id, 'feedback_sent')
      } else {
        await updateSubmissionStatus(submission.id, 'feedback_sent')
      }
      onSent()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[580px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">📋 {student.nameKr} · 제출물 검토</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap text-xs text-gray-400 items-center">
          <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold">검토 대기</span>
          <span>글자 수: {submission.charCount}자</span>
          {submission.pasteAttempts > 0 && (
            <span className="text-red-400">붙여넣기 시도: {submission.pasteAttempts}회</span>
          )}
          {needsAudit && (
            <span className="bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-bold">
              🔍 AI 태깅 검수 요청
            </span>
          )}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm leading-relaxed mb-5 max-h-[150px] overflow-y-auto">
          {submission.content}
        </div>

        {feedback ? (
          <>
            <div className="bg-indigo-50 rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-indigo-700">🤖 AI 피드백</h3>
                <button onClick={() => setEditingAI(v => !v)}
                  className="text-xs font-bold text-indigo-500 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors">
                  {editingAI ? '완료' : '✏️ 수정하기'}
                </button>
              </div>

              {editingAI ? (
                <div className="space-y-3">
                  {([
                    ['positive',   '✅ 잘한 점'],
                    ['grammar',    '📝 문법'],
                    ['vocabulary', '📚 어휘'],
                    ['structure',  '🏗️ 구조'],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 block">{label}</label>
                      <textarea
                        className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm resize-none outline-none focus:border-indigo-500 bg-white"
                        rows={2}
                        value={aiDraft[key]}
                        onChange={e => setAiDraft(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {[
                    ['✅ 잘한 점', aiDraft.positive],
                    ['📝 문법',    aiDraft.grammar],
                    ['📚 어휘',    aiDraft.vocabulary],
                    ['🏗️ 구조',   aiDraft.structure],
                  ].map(([l, t]) => (
                    <div key={l} className="mb-2.5 last:mb-0">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">{l}</div>
                      <div className="text-sm text-gray-800">{t}</div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* 구조화된 오류 태그 목록 */}
            {errorTags.length > 0 && (
              <div className={`rounded-2xl p-5 mb-4 border ${needsAudit ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-700">🏷️ 오류 태그 상세</h3>
                  {needsAudit && (
                    <span className="text-[11px] text-purple-500">
                      AI 태깅이 정확한지 확인해주세요 (연구용 데이터)
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {errorTags.map((tag: ErrorTag, idx: number) => {
                    const sev = SEVERITY_LABEL[tag.severity ?? 'moderate']
                    const choice = auditChoices[idx]
                    return (
                      <div key={idx} className="bg-white rounded-xl p-3 border border-gray-100">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {tag.category}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sev.color}`}>
                            {sev.label}
                          </span>
                        </div>
                        <p className="text-xs text-red-500 line-through">{tag.original}</p>
                        <p className="text-xs text-green-600 font-semibold">→ {tag.correction}</p>
                        {tag.explanation && (
                          <p className="text-[11px] text-gray-400 mt-1">{tag.explanation}</p>
                        )}

                        {needsAudit && (
                          <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-50">
                            <button onClick={() => handleAuditChoice(idx, 'confirmed')}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                                choice === 'confirmed' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-green-50'
                              }`}>
                              ✓ 정확함
                            </button>
                            <button onClick={() => handleAuditChoice(idx, 'corrected')}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                                choice === 'corrected' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-50'
                              }`}>
                              ✗ 틀림/부정확
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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