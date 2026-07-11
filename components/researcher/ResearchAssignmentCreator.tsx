'use client'
// components/researcher/ResearchAssignmentCreator.tsx
import { useState } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { createResearchAssignment } from '@/lib/firestore/research'

interface Props { onCreated: () => void }

export default function ResearchAssignmentCreator({ onCreated }: Props) {
  const { appUser } = useAuth()
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [labelsText, setLabelsText] = useState('주장, 근거, 이유')
  const [minChars, setMinChars] = useState(100)
  const [maxChars, setMaxChars] = useState(2000)
  const [allowPaste, setAllowPaste] = useState(false)
  const [postSurveyUrl, setPostSurveyUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleCreate = async () => {
    if (!appUser || !title.trim() || !prompt.trim()) { showToast('제목과 논제를 입력해주세요.'); return }
    const labels = labelsText.split(',').map(s => s.trim()).filter(Boolean)
    if (labels.length === 0) { showToast('구성 항목을 하나 이상 입력해주세요.'); return }

    setLoading(true)
    try {
      await createResearchAssignment({
        title: title.trim(), prompt: prompt.trim(), argumentLabels: labels,
        minChars, maxChars, allowPaste,
        postSurveyUrl: postSurveyUrl.trim() || undefined,
        isActive: true, createdBy: appUser.uid,
      })
      showToast('연구 과제가 생성됐어요!')
      setTitle(''); setPrompt('')
      onCreated()
    } catch (e) {
      console.error(e)
      showToast('생성 중 오류가 발생했어요.')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">과제 제목</label>
        <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
          value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 원격근무 확대 논쟁" />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">논제</label>
        <textarea className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 min-h-[70px] resize-none"
          value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="예: 원격근무를 전면 확대해야 하는가" />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">구성 항목 (쉼표 구분)</label>
        <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
          value={labelsText} onChange={e => setLabelsText(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-gray-400 mb-1.5 block">최소 글자 수</label>
          <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
            value={minChars} onChange={e => setMinChars(+e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 mb-1.5 block">최대 글자 수</label>
          <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
            value={maxChars} onChange={e => setMaxChars(+e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">사후 설문 링크 (선택)</label>
        <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400"
          value={postSurveyUrl} onChange={e => setPostSurveyUrl(e.target.value)} placeholder="https://forms.gle/..." />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={allowPaste} onChange={e => setAllowPaste(e.target.checked)}
          className="w-4 h-4 accent-purple-600 cursor-pointer" />
        <span className="text-sm text-gray-600">붙여넣기 허용</span>
      </label>
      <button onClick={handleCreate} disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-50">
        {loading ? '생성 중...' : '연구 과제 생성'}
      </button>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}