'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { submitAssignment } from '@/lib/firestore/submissions'
import { Assignment, LogEntry } from '@/types/assignment'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

interface Props {
  assignment: Assignment
  onClose:   () => void
  onSubmit:  () => void
}

export default function SubmissionEditor({ assignment, onClose, onSubmit }: Props) {
  const { appUser }                   = useAuth()
  const [content,    setContent]      = useState('')
  const [loading,    setLoading]      = useState(false)
  const [pasteCount, setPasteCount]   = useState(0)
  const [toast,      setToast]        = useState('')
  const pasteRef   = useRef(0)
  const logsRef    = useRef<LogEntry[]>([])
  const textareaRef= useRef<HTMLTextAreaElement>(null)

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2500)
  }

  const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false })

  // ── 붙여넣기 이벤트 ───────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent) => {
    pasteRef.current += 1
    setPasteCount(pasteRef.current)

    if (!assignment.allowPaste) {
      e.preventDefault()
      showToast('이 과제는 붙여넣기가 금지되어 있어요. 직접 입력해주세요.')
      return
    }

    // 허용된 경우 — 붙여넣은 내용 기록
    const pasted   = e.clipboardData.getData('text')
    const position = textareaRef.current?.selectionStart ?? 0
    logsRef.current.push({
      time:     now(),
      type:     'paste',
      content:  pasted,
      position,
      length:   pasted.length,
    })
    showToast(`📋 붙여넣기 기록됨 (${pasted.length}자)`)
  }

  // ── 잘라내기 이벤트 ───────────────────────────────────────────
  const handleCut = (e: React.ClipboardEvent) => {
    if (!assignment.allowPaste) return

    const textarea = textareaRef.current
    if (!textarea) return
    const start   = textarea.selectionStart
    const end     = textarea.selectionEnd
    const deleted = content.slice(start, end)
    if (!deleted) return

    logsRef.current.push({
      time:     now(),
      type:     'cut',
      deleted,
      position: start,
      length:   deleted.length,
    })
  }

  // ── 키보드 삭제 감지 (대량 삭제만 기록, 1자씩은 제외) ─────────
  const prevContent = useRef(content)
  useEffect(() => {
    if (!assignment.allowPaste) return
    const prev = prevContent.current
    const curr = content
    prevContent.current = curr

    // 5자 이상 한번에 삭제됐을 때만 기록
    if (prev.length - curr.length >= 5) {
      // diff로 삭제된 부분 찾기
      let start = 0
      while (start < Math.min(prev.length, curr.length) && prev[start] === curr[start]) start++
      const deleted = prev.slice(start, start + (prev.length - curr.length))
      if (deleted.trim()) {
        logsRef.current.push({
          time:     now(),
          type:     'delete',
          deleted,
          position: start,
          length:   deleted.length,
        })
      }
    }
  }, [content])

  // ── 제출 ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!appUser) return
    if (content.length < assignment.minChars) {
      showToast(`최소 ${assignment.minChars}자 이상 작성해주세요 (현재 ${content.length}자)`)
      return
    }
    if (content.length > assignment.maxChars) {
      showToast(`최대 ${assignment.maxChars}자 이하로 작성해주세요`)
      return
    }
    setLoading(true)
    try {
      const subId = await submitAssignment({
        assignmentId:  assignment.id,
        studentUid:    appUser.uid,
        classId:       appUser.classId,
        content,
        charCount:     content.length,
        pasteAttempts: pasteRef.current,
        pasteAllowed:  assignment.allowPaste ?? false,
        status:        'submitted',
      })

      // 붙여넣기 로그 별도 컬렉션 저장
      if (assignment.allowPaste && logsRef.current.length > 0) {
        await setDoc(doc(db, 'submissionLogs', subId), {
          submissionId: subId,
          studentUid:   appUser.uid,
          assignmentId: assignment.id,
          logs:         logsRef.current,
          createdAt:    serverTimestamp(),
          updatedAt:    serverTimestamp(),
        })
      }

      // AI 피드백 요청 (오류 통계 집계를 위해 학생/반 정보도 함께 전송)
      const fbRes = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          submissionId: subId,
          content,
          level:        '고급',
          assignment:   assignment.description,
          grammar:      assignment.grammar,
          studentUid:   appUser.uid,
          classId:      appUser.classId,
          schoolId:     appUser.schoolId,
          semester:     appUser.semester,
        }),
      })

      if (!fbRes.ok) {
        // 제출 자체는 이미 성공했으니 화면은 닫되, AI 분석이 안 됐다는 걸 알려줌
        // (선생님이 검토 화면에서 상태를 보고 필요시 재시도할 수 있음)
        console.error('AI 피드백 생성 실패:', await fbRes.json().catch(() => ({})))
        showToast('제출은 완료됐어요. AI 분석은 잠시 후 다시 시도돼요.')
      }

      onSubmit()
    } catch (e) {
      console.error(e)
      showToast('제출 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally { setLoading(false) }
  }

  const charColor = content.length < assignment.minChars
    ? 'text-amber-500'
    : content.length > assignment.maxChars
    ? 'text-red-500'
    : 'text-green-600'

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">✏️ {assignment.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="bg-indigo-50 rounded-xl p-3 text-sm text-indigo-700 mb-5">
          📝 {assignment.grammar && <strong>[{assignment.grammar}]</strong>} {assignment.description}
        </div>

        <div className="mb-2">
          <label className="text-xs font-bold text-gray-400 mb-1.5 block">내용 작성</label>
          <textarea
            ref={textareaRef}
            className="w-full min-h-[200px] border-2 border-gray-200 rounded-2xl p-4 text-sm font-['Noto_Sans_KR'] resize-y outline-none focus:border-indigo-500 transition-colors leading-relaxed"
            placeholder={assignment.allowPaste
              ? '내용을 작성해주세요. (붙여넣기 허용 — 기록됨)'
              : '내용을 직접 입력해주세요. (붙여넣기 금지)'}
            value={content}
            onChange={e => setContent(e.target.value)}
            onPaste={handlePaste}
            onCut={handleCut}
          />
          <div className={`text-right text-xs mt-1 font-bold ${charColor}`}>
            {content.length}자 / 최소 {assignment.minChars}자
          </div>
        </div>

        {/* 붙여넣기 허용 안내 */}
        {assignment.allowPaste ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700 mb-3">
            📋 붙여넣기가 허용된 과제예요. 붙여넣은 내용은 선생님에게 기록돼요.
            {pasteCount > 0 && <span className="ml-2 font-bold">({pasteCount}회 붙여넣기)</span>}
          </div>
        ) : (
          <>
            {pasteCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700 mb-3">
                붙여넣기 시도: {pasteCount}회 (선생님이 확인할 수 있어요)
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700 mb-5">
              🚫 이 과제는 붙여넣기가 금지되어 있어요. 직접 입력해주세요.
            </div>
          </>
        )}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60">
          {loading ? 'AI 피드백 생성 중... 🤖' : '제출하기 🚀'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-[60]">
          {toast}
        </div>
      )}
    </div>
  )
}