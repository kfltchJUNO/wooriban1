'use client'
// components/student/ResearchFormBanner.tsx
import { useState, useEffect } from 'react'
import { getResearchFormSettings } from '@/lib/firestore/settings'

export default function ResearchFormBanner() {
  const [url,     setUrl]     = useState('')
  const [enabled, setEnabled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    getResearchFormSettings().then(s => {
      setUrl(s.url)
      setEnabled(s.enabled)
    })
  }, [])

  if (!enabled || !url || dismissed) return null

  return (
    <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-2xl p-4 mb-4 flex items-center gap-3">
      <span className="text-2xl flex-shrink-0">🔬</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">한국어 학습 연구에 참여해보세요</p>
        <p className="text-xs opacity-90 mt-0.5">여러분의 학습 데이터가 더 나은 한국어 교육을 만드는 데 도움이 돼요</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="bg-white text-indigo-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-indigo-50 transition-colors whitespace-nowrap">
          신청하기 →
        </a>
        <button onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white text-lg leading-none px-1">
          ✕
        </button>
      </div>
    </div>
  )
}