'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { createAssignment } from '@/lib/firestore/assignments'
import { generateAssignmentLabel } from '@/lib/utils/classUtils'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function AssignmentModal({ onClose, onCreated }: Props) {
  const { appUser } = useAuth()
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [grammar, setGrammar]   = useState('')
  const [minChars, setMin]      = useState(150)
  const [maxChars, setMax]      = useState(2000)
  const [dueDate, setDueDate]   = useState('')
  const [loading, setLoading]   = useState(false)

  const handleCreate = async () => {
    if (!appUser || !title || !desc || !dueDate) return
    setLoading(true)
    const today = new Date().toISOString().slice(0,10)
    const label = generateAssignmentLabel(appUser.semester, appUser.classId, dueDate, 1)
    await createAssignment({
      schoolId:  appUser.schoolId,
      semester:  appUser.semester,
      classId:   appUser.classId,
      createdBy: appUser.uid,
      title, description: desc, grammar: grammar || undefined,
      minChars, maxChars,
      dueDate:   new Date(dueDate),
      isActive:  true,
      label,
    })
    onCreated()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">📋 새 과제 부여</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">과제 제목</label>
            <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: V-느니 작문 과제 1차"/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">과제 내용</label>
            <textarea className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 min-h-[90px] resize-none font-['Noto_Sans_KR']" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="학생들에게 보여질 과제 설명을 입력하세요"/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">타깃 문법 (선택)</label>
            <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" value={grammar} onChange={e=>setGrammar(e.target.value)} placeholder="예: V-느니"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">최소 글자 수</label>
              <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" value={minChars} onChange={e=>setMin(+e.target.value)}/>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">최대 글자 수</label>
              <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" value={maxChars} onChange={e=>setMax(+e.target.value)}/>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">마감일</label>
            <input type="date" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
          </div>
        </div>

        <button onClick={handleCreate} disabled={loading||!title||!desc||!dueDate}
          className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors">
          {loading ? '처리 중...' : '과제 부여하기 📤'}
        </button>
      </div>
    </div>
  )
}
