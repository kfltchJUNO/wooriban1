'use client'
// components/student/ResearchFeedbackThread.tsx
import { useState, useEffect, useRef } from 'react'
import { getResearchFeedback, getResearchThread } from '@/lib/firestore/research'
import { ResearchFeedback, ResearchThread } from '@/types/research'

interface Props {
  submissionId: string
  prompt: string
  onClose: () => void
}

export default function ResearchFeedbackThread({ submissionId, prompt, onClose }: Props) {
  const [feedback, setFeedback] = useState<ResearchFeedback | null>(null)
  const [thread, setThread]     = useState<ResearchThread | null>(null)
  const [loading, setLoading]   = useState(true)
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [fb, th] = await Promise.all([
      getResearchFeedback(submissionId),
      getResearchThread(submissionId),
    ])
    setFeedback(fb)
    setThread(th)
    setLoading(false)
  }

  useEffect(() => { load() }, [submissionId])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread?.messages.length])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/research/feedback/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, studentMessage: input.trim(), originalPrompt: prompt }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '전송 실패'); return }
      setInput('')
      await load()
    } finally {
      setSending(false)
    }
  }

  const turnsUsed = thread?.studentTurnsUsed ?? 0
  const closed = thread?.closed ?? false

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[520px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-bold text-lg">💬 독자와의 대화</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm animate-pulse">불러오는 중...</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {feedback && (
                <div className="bg-purple-50 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-purple-500">📊 논증 평가</p>
                  {[
                    ['주장', feedback.argumentFeedback.claimClarity],
                    ['근거', feedback.argumentFeedback.evidenceStrength],
                    ['반론 고려', feedback.argumentFeedback.counterargument],
                  ].map(([l, t]) => (
                    <div key={l} className="text-xs">
                      <span className="font-bold text-gray-500">{l}: </span>
                      <span className="text-gray-700">{t}</span>
                    </div>
                  ))}
                </div>
              )}

              {thread?.messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'student' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-gray-100">
              {closed ? (
                <p className="text-center text-xs text-gray-400 py-2">이 대화는 종료됐어요. 참여해주셔서 감사합니다.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                    placeholder="반박하거나 질문해보세요..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                  />
                  <button onClick={handleSend} disabled={sending || !input.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                    {sending ? '...' : '전송'}
                  </button>
                </div>
              )}
              <p className="text-[11px] text-gray-300 mt-1.5 text-center">
                {closed ? '' : `남은 대화 횟수: ${2 - turnsUsed}회`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}