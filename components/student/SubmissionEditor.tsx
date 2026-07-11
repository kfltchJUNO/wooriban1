'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { submitAssignment } from '@/lib/firestore/submissions'
import { Assignment, LogEntry, SubmissionItem } from '@/types/assignment'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

interface Props {
  assignment: Assignment
  onClose:   () => void
  onSubmit:  () => void
}

export default function SubmissionEditor({ assignment, onClose, onSubmit }: Props) {
  const { appUser }                   = useAuth()
  const contentType = assignment.contentType ?? 'freeWriting'

  // 자유글 모드
  const [content,    setContent]      = useState('')
  // 문장/대화문 모드 — 항목별 입력
  const itemCount = assignment.itemCount ?? 5
  const speakers  = assignment.speakers && assignment.speakers.length >= 2
    ? assignment.speakers
    : ['가', '나']
  const [items, setItems] = useState<string[]>(() => Array(itemCount).fill(''))

  const [loading,    setLoading]      = useState(false)
  const [pasteCount, setPasteCount]   = useState(0)
  const [toast,      setToast]        = useState('')
  const pasteRef   = useRef(0)
  const logsRef    = useRef<LogEntry[]>([])
  const textareaRef= useRef<HTMLTextAreaElement>(null)

  // ── 작성 시간 추적 ────────────────────────────────────────────
  const startedAtRef      = useRef<number>(Date.now())          // 화면 처음 연 시각
  const activeMsRef       = useRef<number>(0)                    // 누적 활성(포커스) 시간
  const lastVisibleAtRef  = useRef<number | null>(Date.now())    // 현재 활성 구간 시작 시각(비활성이면 null)

  useEffect(() => {
    const handleVisibility = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') {
        // 다시 보이기 시작 — 활성 구간 시작점 기록
        lastVisibleAtRef.current = now
      } else {
        // 화면을 벗어남 — 지금까지의 활성 구간을 누적하고 중단
        if (lastVisibleAtRef.current !== null) {
          activeMsRef.current += now - lastVisibleAtRef.current
          lastVisibleAtRef.current = null
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      // 언마운트 시 마지막 활성 구간도 정산
      if (lastVisibleAtRef.current !== null) {
        activeMsRef.current += Date.now() - lastVisibleAtRef.current
      }
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // 제출 시점 활성 시간 최종 계산 (아직 벗어나지 않은 현재 구간까지 포함)
  const finalizeActiveMs = () => {
    if (lastVisibleAtRef.current !== null) {
      activeMsRef.current += Date.now() - lastVisibleAtRef.current
      lastVisibleAtRef.current = Date.now()
    }
    return activeMsRef.current
  }

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 2500)
  }

  const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false })

  // ── 붙여넣기 이벤트 (자유글 모드 전용 — 문장/대화문은 항목이 짧아 로깅 의미가 적음) ──
  const handlePaste = (e: React.ClipboardEvent) => {
    pasteRef.current += 1
    setPasteCount(pasteRef.current)

    if (!assignment.allowPaste) {
      e.preventDefault()
      showToast('이 과제는 붙여넣기가 금지되어 있어요. 직접 입력해주세요.')
      return
    }

    const pasted   = e.clipboardData.getData('text')
    const position = textareaRef.current?.selectionStart ?? 0
    logsRef.current.push({
      time: now(), type: 'paste', content: pasted, position, length: pasted.length,
    })
    showToast(`📋 붙여넣기 기록됨 (${pasted.length}자)`)
  }

  const handleCut = (e: React.ClipboardEvent) => {
    if (!assignment.allowPaste) return
    const textarea = textareaRef.current
    if (!textarea) return
    const start   = textarea.selectionStart
    const end     = textarea.selectionEnd
    const deleted = content.slice(start, end)
    if (!deleted) return
    logsRef.current.push({ time: now(), type: 'cut', deleted, position: start, length: deleted.length })
  }

  const prevContent = useRef(content)
  useEffect(() => {
    if (contentType !== 'freeWriting' || !assignment.allowPaste) return
    const prev = prevContent.current
    const curr = content
    prevContent.current = curr
    if (prev.length - curr.length >= 5) {
      let start = 0
      while (start < Math.min(prev.length, curr.length) && prev[start] === curr[start]) start++
      const deleted = prev.slice(start, start + (prev.length - curr.length))
      if (deleted.trim()) {
        logsRef.current.push({ time: now(), type: 'delete', deleted, position: start, length: deleted.length })
      }
    }
  }, [content, contentType, assignment.allowPaste])

  // ── 항목별(문장/대화문) 입력 업데이트 ─────────────────────────
  const updateItem = (idx: number, value: string) => {
    setItems(prev => prev.map((v, i) => i === idx ? value : v))
  }

  // ── 최종 제출용 콘텐츠 조립 ────────────────────────────────────
  const buildFinalContent = (): { content: string; submissionItems?: SubmissionItem[] } => {
    if (contentType === 'freeWriting') return { content }

    if (contentType === 'sentence') {
      const submissionItems: SubmissionItem[] = items.map((text, i) => ({ index: i, text: text.trim() }))
      const joined = submissionItems.map(it => `${it.index + 1}. ${it.text}`).join('\n')
      return { content: joined, submissionItems }
    }

    // dialogue — 화자를 번갈아 배정
    const submissionItems: SubmissionItem[] = items.map((text, i) => ({
      index: i,
      speaker: speakers[i % speakers.length],
      text: text.trim(),
    }))
    const joined = submissionItems.map(it => `${it.speaker}: ${it.text}`).join('\n')
    return { content: joined, submissionItems }
  }

  const currentCharCount = contentType === 'freeWriting'
    ? content.length
    : items.join('').length

  const allItemsFilled = contentType === 'freeWriting'
    ? true
    : items.every(v => v.trim().length > 0)

  // ── 제출 ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!appUser) return

    if (contentType === 'freeWriting') {
      if (content.length < assignment.minChars) {
        showToast(`최소 ${assignment.minChars}자 이상 작성해주세요 (현재 ${content.length}자)`)
        return
      }
      if (content.length > assignment.maxChars) {
        showToast(`최대 ${assignment.maxChars}자 이하로 작성해주세요`)
        return
      }
    } else if (!allItemsFilled) {
      showToast('모든 칸을 채워주세요.')
      return
    }

    setLoading(true)
    try {
      const { content: finalContent, submissionItems } = buildFinalContent()
      const submitTime  = Date.now()
      const activeMs     = finalizeActiveMs()
      const totalMs      = submitTime - startedAtRef.current

      const subId = await submitAssignment({
        assignmentId:  assignment.id,
        studentUid:    appUser.uid,
        classId:       appUser.classId,
        content:       finalContent,
        items:         submissionItems,
        contentType,
        charCount:     currentCharCount,
        pasteAttempts: pasteRef.current,
        pasteAllowed:  assignment.allowPaste ?? false,
        status:        'submitted',
        startedAt:         new Date(startedAtRef.current),
        activeDurationMs:  activeMs,
        totalDurationMs:   totalMs,
      })

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

      // ── AI 피드백 요청: 학생을 기다리게 하지 않고 백그라운드로 보냄 ──
      // (제출은 이미 완료됐으니 화면을 바로 닫고, 피드백은 뒤에서 생성됨.
      //  실패해도 선생님 화면에서 상태를 보고 필요 시 재처리 가능)
      fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          submissionId: subId,
          content:      finalContent,
          contentType,
          level:        '고급',
          assignment:   assignment.description,
          grammar:      assignment.grammar,
          studentUid:   appUser.uid,
          classId:      appUser.classId,
          schoolId:     appUser.schoolId,
          semester:     appUser.semester,
        }),
      }).catch(e => console.error('AI 피드백 요청 실패(백그라운드):', e))

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

        {/* ── 자유글 모드 ── */}
        {contentType === 'freeWriting' && (
          <>
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
          </>
        )}

        {/* ── 문장 모드 ── */}
        {contentType === 'sentence' && (
          <div className="space-y-3 mb-5">
            <label className="text-xs font-bold text-gray-400 block">
              문장 작성 <span className="text-indigo-500">({items.filter(v => v.trim()).length}/{items.length})</span>
            </label>
            {items.map((val, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-xs font-bold text-gray-400 flex-shrink-0">{idx + 1}.</span>
                <input
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 transition-colors"
                  placeholder={`문장 ${idx + 1}`}
                  value={val}
                  onChange={e => updateItem(idx, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── 대화문 모드 ── */}
        {contentType === 'dialogue' && (
          <div className="space-y-3 mb-5">
            <label className="text-xs font-bold text-gray-400 block">
              대화 작성 <span className="text-indigo-500">({items.filter(v => v.trim()).length}/{items.length})</span>
            </label>
            {items.map((val, idx) => {
              const speaker = speakers[idx % speakers.length]
              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-14 text-xs font-bold text-indigo-500 flex-shrink-0 text-right">{speaker}:</span>
                  <input
                    className="flex-1 border-2 border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 transition-colors"
                    placeholder={`${speaker}의 말`}
                    value={val}
                    onChange={e => updateItem(idx, e.target.value)}
                  />
                </div>
              )
            })}
            <p className="text-[11px] text-gray-400">
              💡 대화의 흐름이 자연스러운지도 함께 검토돼요.
            </p>
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60">
          {loading ? '제출 중...' : '제출하기 🚀'}
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