'use client'
import { useState, useEffect } from 'react'
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
  const [retrying, setRetrying] = useState(false)
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

  // AI 없이 선생님이 직접 피드백 작성 모드
  const [manualMode, setManualMode] = useState(false)
  const [manualDraft, setManualDraft] = useState({ positive: '', grammar: '', vocabulary: '', structure: '' })
  const [showPasteLog, setShowPasteLog] = useState(false)

  const errorTags: ErrorTag[] = feedback?.aiFeedback?.errorTags ?? []
  const needsAudit = feedback?.needsAudit ?? false

  const handleAuditChoice = (idx: number, choice: 'confirmed' | 'corrected') => {
    setAuditChoices(prev => ({ ...prev, [idx]: choice }))
  }

  // AI 피드백이 멈춰있을 때 재시도 — 서버 상태를 초기 상태로 되돌리고 재요청
  const handleRetry = async () => {
    setRetrying(true)
    try {
      const sourceCollection = isFreeWriting ? 'freeWritings' : 'submissions'
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          submissionId: submission.id,
          content:      submission.content,
          level:        '고급',
          assignment:   submission.assignmentId,
          studentUid:   submission.studentUid,
          classId:      submission.classId,
          sourceCollection,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '재시도에 실패했어요. 잠시 후 다시 시도해주세요.')
      } else {
        alert('다시 생성 중이에요. 잠시 후 새로고침해주세요.')
      }
    } catch {
      alert('재시도 요청 중 오류가 발생했어요.')
    } finally {
      setRetrying(false)
    }
  }

  // AI 없이 선생님이 직접 피드백 작성 — feedback 문서를 새로 생성
  const handleSendManual = async () => {
    setLoading(true)
    try {
      const { addDoc, collection: fsCollection } = await import('firebase/firestore')
      const ref = await addDoc(fsCollection(db, 'feedback'), {
        submissionId:    submission.id,
        studentUid:      submission.studentUid,
        classId:         submission.classId,
        aiFeedback: {
          positive:    manualDraft.positive || '잘 작성했어요.',
          grammar:     manualDraft.grammar || '특이사항 없음',
          vocabulary:  manualDraft.vocabulary || '특이사항 없음',
          structure:   manualDraft.structure || '특이사항 없음',
          errorTags:   [],
          generatedAt: new Date(),
        },
        teacherComment:  comment,
        teacherApproved: true,
        teacherEdited:   true,   // AI 없이 직접 작성했음을 표시
        textbookId: null, unitId: null,
      })
      if (isFreeWriting) await updateFreeWritingStatus(submission.id, 'feedback_sent')
      else await updateSubmissionStatus(submission.id, 'feedback_sent')
      void ref
      onSent()
    } finally {
      setLoading(false)
    }
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
            <button onClick={() => setShowPasteLog(v => !v)}
              className="text-red-400 underline underline-offset-2">
              붙여넣기 시도: {submission.pasteAttempts}회 {showPasteLog ? '숨기기' : '보기'}
            </button>
          )}
          {needsAudit && (
            <span className="bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-bold">
              🔍 AI 태깅 검수 요청
            </span>
          )}
        </div>

        {/* 작성 시간 정보 */}
        {(submission.startedAt || submission.totalDurationMs) && (
          <div className="flex gap-3 mb-4 flex-wrap text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            {submission.startedAt && (
              <span>⏱️ 시작: {new Date(submission.startedAt).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            )}
            <span>📤 제출: {new Date(submission.submittedAt).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            {submission.totalDurationMs != null && (
              <span>⏳ 총 소요: {formatDuration(submission.totalDurationMs)}</span>
            )}
            {submission.activeDurationMs != null && (
              <span className={submission.totalDurationMs && submission.activeDurationMs < submission.totalDurationMs * 0.5
                ? 'text-amber-500 font-semibold' : ''}>
                👀 실제 작성 화면 체류: {formatDuration(submission.activeDurationMs)}
              </span>
            )}
          </div>
        )}

        {/* 붙여넣기 원본 로그 */}
        {showPasteLog && (
          <PasteLogViewer submissionId={submission.id} />
        )}

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
        ) : manualMode ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 mb-4">
              ✏️ AI 없이 선생님이 직접 피드백을 작성해요.
            </div>
            <div className="space-y-3 mb-4">
              {([
                ['positive',   '✅ 잘한 점'],
                ['grammar',    '📝 문법'],
                ['vocabulary', '📚 어휘'],
                ['structure',  '🏗️ 구조'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 block">{label}</label>
                  <textarea
                    className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm resize-none outline-none focus:border-indigo-500"
                    rows={2}
                    placeholder={`${label} 관련 코멘트`}
                    value={manualDraft[key]}
                    onChange={e => setManualDraft(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="mb-4">
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">👩‍🏫 선생님 의견 (학생에게 표시됨)</label>
              <textarea
                className="w-full min-h-[70px] border-2 border-gray-200 rounded-xl p-3.5 text-sm resize-none outline-none focus:border-orange-400"
                placeholder="응원 메시지나 추가 조언을 남겨보세요 😊"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setManualMode(false)}
                className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-xl text-sm hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleSendManual} disabled={loading}
                className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                {loading ? '전송 중...' : '직접 작성한 피드백 전송 📨'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 space-y-3">
            <p className="text-gray-400 text-sm animate-pulse">AI 피드백 생성 중... 🤖</p>
            <p className="text-xs text-gray-300">
              오래 멈춰있다면 AI 처리가 실패했을 수 있어요.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={handleRetry} disabled={retrying}
                className="text-xs font-bold text-indigo-600 border border-indigo-200 px-4 py-2 rounded-xl hover:bg-indigo-50 disabled:opacity-50 transition-colors">
                {retrying ? '재시도 중...' : '🔄 AI 다시 시도'}
              </button>
              <button onClick={() => setManualMode(true)}
                className="text-xs font-bold text-gray-500 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                ✏️ 직접 작성하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ms → "3분 20초" 형태로 표시
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec}초`
  return `${min}분 ${sec}초`
}

// 붙여넣기 원본 내용을 submissionLogs/{submissionId}에서 불러와 보여줌
function PasteLogViewer({ submissionId }: { submissionId: string }) {
  const [logs, setLogs] = useState<import('@/types/assignment').LogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { doc: fsDoc, getDoc } = await import('firebase/firestore')
        const snap = await getDoc(fsDoc(db, 'submissionLogs', submissionId))
        if (!cancelled) setLogs(snap.exists() ? (snap.data().logs ?? []) : [])
      } catch {
        if (!cancelled) setLogs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [submissionId])

  if (loading) return <div className="text-xs text-gray-400 mb-4 animate-pulse">붙여넣기 기록 불러오는 중...</div>

  if (!logs || logs.length === 0) {
    return <div className="text-xs text-gray-400 mb-4">기록된 붙여넣기 내용이 없어요.</div>
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 space-y-2">
      <p className="text-xs font-bold text-red-600">📋 붙여넣기 / 삭제 기록</p>
      {logs.map((log, i) => (
        <div key={i} className="bg-white rounded-lg p-2.5 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-gray-400">{log.time}</span>
            <span className={`font-bold px-1.5 py-0.5 rounded ${
              log.type === 'paste' ? 'bg-red-100 text-red-600'
              : log.type === 'cut'  ? 'bg-orange-100 text-orange-600'
              : 'bg-gray-100 text-gray-600'
            }`}>
              {log.type === 'paste' ? '붙여넣기' : log.type === 'cut' ? '잘라내기' : '삭제'}
            </span>
            <span className="text-gray-400">{log.length}자</span>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap break-words">
            {'content' in log ? log.content : log.deleted}
          </p>
        </div>
      ))}
    </div>
  )
}