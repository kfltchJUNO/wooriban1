'use client'
import { useState, useRef } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { submitAssignment } from '@/lib/firestore/submissions'
import { Assignment } from '@/types/assignment'

interface Props {
  assignment: Assignment
  onClose: () => void
  onSubmit: () => void
}

export default function SubmissionEditor({ assignment, onClose, onSubmit }: Props) {
  const { appUser } = useAuth()
  const [content, setContent]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [pasteCount, setPasteCount] = useState(0)
  const [toast, setToast]           = useState('')
  const pasteRef = useRef(0)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    pasteRef.current += 1
    setPasteCount(pasteRef.current)
    showToast('⚠️ 복사·붙여넣기는 지원되지 않아요. 직접 입력해 주세요.')
  }

  const handleSubmit = async () => {
    if (!appUser) return
    if (content.length < assignment.minChars) {
      showToast(`⚠️ ${assignment.minChars}자 이상 작성해주세요 (현재 ${content.length}자)`)
      return
    }
    if (content.length > assignment.maxChars) {
      showToast(`⚠️ ${assignment.maxChars}자 이하로 작성해주세요`)
      return
    }
    setLoading(true)
    try {
      const subId = await submitAssignment({
        assignmentId: assignment.id,
        studentUid:   appUser.uid,
        classId:      appUser.classId,
        content,
        charCount:    content.length,
        pasteAttempts: pasteRef.current,
        status:       'submitted',
      })
      // AI 피드백 요청
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId,
          content,
          level:      '고급',
          assignment: assignment.description,
          grammar:    assignment.grammar,
        }),
      })
      onSubmit()
    } catch {
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
          <h2 className="font-bold text-lg">✍️ {assignment.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="bg-indigo-50 rounded-xl p-3 text-sm text-indigo-700 mb-5">
          🎯 {assignment.grammar && <strong>[{assignment.grammar}]</strong>} {assignment.description}
        </div>

        <div className="mb-2">
          <label className="text-xs font-bold text-gray-400 mb-1.5 block">내용 작성</label>
          <textarea
            className="w-full min-h-[200px] border-2 border-gray-200 rounded-2xl p-4 text-sm font-['Noto_Sans_KR'] resize-y outline-none focus:border-indigo-500 transition-colors leading-relaxed"
            placeholder="여기에 작문을 입력하세요. (복사·붙여넣기 불가)"
            value={content}
            onChange={e => setContent(e.target.value)}
            onPaste={handlePaste}
          />
          <div className={`text-right text-xs mt-1 font-bold ${charColor}`}>
            {content.length}자 / 최소 {assignment.minChars}자
          </div>
        </div>

        {pasteCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700 mb-3">
            붙여넣기 시도: {pasteCount}회 (선생님이 확인할 수 있어요)
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700 mb-5">
          ⚠️ 복사·붙여넣기는 지원되지 않아요. 직접 입력해 주세요.
        </div>

        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60">
          {loading ? 'AI 피드백 생성 중... 🤖' : '제출하기 📤'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-[60] animate-bounce">
          {toast}
        </div>
      )}
    </div>
  )
}
