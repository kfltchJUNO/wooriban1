'use client'
// components/admin/ResearchFormSettings.tsx
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { getResearchFormSettings, setResearchFormSettings } from '@/lib/firestore/settings'

export default function ResearchFormSettingsPanel() {
  const { appUser } = useAuth()
  const [url,     setUrl]     = useState('')
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    getResearchFormSettings().then(s => {
      setUrl(s.url)
      setEnabled(s.enabled)
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    if (!appUser) return
    if (enabled && !url.trim()) {
      showToast('활성화하려면 폼 링크를 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      await setResearchFormSettings(url.trim(), enabled, appUser.uid)
      showToast('저장됐어요!')
    } catch (e) {
      console.error(e)
      showToast('저장 중 오류가 발생했어요.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400 animate-pulse py-4">불러오는 중...</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-base text-gray-800">연구 참여 신청</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          학생 화면에 연구 참여 신청 배너를 띄우고, 클릭 시 아래 구글폼으로 연결돼요.
        </p>
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">구글폼 링크</label>
        <input
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
          placeholder="https://forms.gle/..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      </div>

      <div className={`border-2 rounded-xl p-4 transition-colors ${
        enabled ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
      }`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-800">학생 화면에 배너 표시</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {enabled ? '학생 홈 화면 상단에 연구 참여 신청 배너가 보여요.' : '꺼두면 배너가 안 보여요.'}
            </p>
          </div>
        </label>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
        {saving ? '저장 중...' : '저장하기'}
      </button>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}