'use client'
// components/student/ResearchArgumentEditor.tsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { submitResearchArgument } from '@/lib/firestore/research'
import { ResearchAssignment, ResearchArgumentItem } from '@/types/research'

interface Props {
  assignment: ResearchAssignment
  existingAttempts: number
  onClose: () => void
  onSubmit: () => void
}

const MAX_ATTEMPTS = 2

export default function ResearchArgumentEditor({ assignment, existingAttempts, onClose, onSubmit }: Props) {
  const { appUser } = useAuth()
  const labels = assignment.argumentLabels?.length ? assignment.argumentLabels : ['주장', '근거', '이유']
  const [values, setValues] = useState<string[]>(() => labels.map(() => ''))
  const [loading, setLoading] = useState(false)
  const [pasteCount, setPasteCount] = useState(0)
  const [toast, setToast] = useState('')

  const startedAtRef = useRef(Date.now())
  const activeMsRef = useRef(0)
  const lastVisibleRef = useRef<number | null>(Date.now())

  useEffect(() => {
    const onVis = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') lastVisibleRef.current = now
      else if (lastVisibleRef.current !== null) {
        activeMsRef.current += now - lastVisibleRef.current
        lastVisibleRef.current = null
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const totalChars = values.join('').length
  const allFilled = values.every(v => v.trim().length > 0)

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!assignment.allowPaste) { e.preventDefault(); showToast('이 과제는 붙여넣기를 지원하지 않아요.') }
    setPasteCount(c => c + 1)
  }

  const handleSubmit = async () => {
    if (!appUser) return
    if (existingAttempts >= MAX_ATTEMPTS) { showToast(`최대 ${MAX_ATTEMPTS}회까지만 제출할 수 있어요.`); return }
    if (totalChars < assignment.minChars) { showToast(`최소 ${assignment.minChars}자 이상 작성해주세요.`); return }
    if (!allFilled) { showToast('모든 항목을 작성해주세요.'); return }

    setLoading(true)
    try {
      if (lastVisibleRef.current !== null) activeMsRef.current += Date.now() - lastVisibleRef.current
      const items: ResearchArgumentItem[] = labels.map((label, i) => ({ label, text: values[i].trim() }))
      const content = items.map(it => `[${it.label}] ${it.text}`).join('\n')

      const subId = await submitResearchArgument({
        assignmentId: assignment.id,
        studentUid: appUser.uid,
        items, content,
        charCount: totalChars,
        pasteAttempts: pasteCount,
        attemptNumber: existingAttempts + 1,
        startedAt: new Date(startedAtRef.current),
        activeDurationMs: activeMsRef.current,
        totalDurationMs: Date.now() - startedAtRef.current,
      })

      fetch('/api/research/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId, prompt: assignment.prompt, items, studentUid: appUser.uid,
        }),
      }).catch(e => console.error('연구 피드백 요청 실패:', e))

      onSubmit()
    } catch (e) {
      console.error(e)
      showToast('제출 중 오류가 발생했어요.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-lg">🔬 {assignment.title}</h2>
            {existingAttempts > 0 && (
              <p className="text-xs text-amber-500 font-semibold mt-0.5">{existingAttempts + 1}번째 제출 (최대 {MAX_ATTEMPTS}회)</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="bg-purple-50 rounded-xl p-3.5 text-sm text-purple-700 mb-5">
          📌 논제: {assignment.prompt}
        </div>

        <div className="space-y-4 mb-5">
          {labels.map((label, i) => (
            <div key={label}>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">{label}</label>
              <textarea
                className="w-full min-h-[90px] border-2 border-gray-200 rounded-xl p-3.5 text-sm resize-none outline-none focus:border-purple-400 transition-colors leading-relaxed"
                placeholder={`${label}을(를) 작성해주세요`}
                value={values[i]}
                onChange={e => setValues(prev => prev.map((v, vi) => vi === i ? e.target.value : v))}
                onPaste={handlePaste}
              />
            </div>
          ))}
        </div>

        <div className="text-right text-xs text-gray-400 mb-4">{totalChars}자 / 최소 {assignment.minChars}자</div>

        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60">
          {loading ? '제출 중...' : '제출하기'}
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