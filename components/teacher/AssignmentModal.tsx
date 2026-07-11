'use client'
// components/teacher/AssignmentModal.tsx
import { useState } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { createAssignment } from '@/lib/firestore/assignments'
import { generateAssignmentLabel } from '@/lib/utils/classUtils'
import { Assignment, AssignmentContentType } from '@/types/assignment'

interface Props {
  onClose:   () => void
  onCreated: () => void
}

const CONTENT_TYPES: { value: AssignmentContentType; label: string; desc: string }[] = [
  { value: 'freeWriting', label: '📝 자유글',  desc: '한 편의 글을 자유롭게 작성' },
  { value: 'sentence',    label: '✏️ 문장',    desc: '지정한 개수만큼 문장을 각각 작성' },
  { value: 'dialogue',    label: '💬 대화문',  desc: '화자를 나눠 대화를 주고받는 형식' },
]

export default function AssignmentModal({ onClose, onCreated }: Props) {
  const { appUser }           = useAuth()
  const [title, setTitle]     = useState('')
  const [desc, setDesc]       = useState('')
  const [grammar, setGrammar] = useState('')
  const [minChars, setMin]    = useState(150)
  const [maxChars, setMax]    = useState(2000)
  const [dueDate, setDueDate] = useState('')
  const [allowPaste, setAllowPaste] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')

  // ── 콘텐츠 유형 ──────────────────────────────────────────────
  const [contentType, setContentType] = useState<AssignmentContentType>('freeWriting')
  const [itemCount,   setItemCount]   = useState(5)      // 문장/대화문 항목 개수
  const [speakerText, setSpeakerText] = useState('가, 나') // 쉼표로 구분 입력

  const handleContentTypeChange = (type: AssignmentContentType) => {
    setContentType(type)
    if (type === 'freeWriting') {
      // 자유글은 글자 수 기준이 자연스러움
      setMin(150); setMax(2000)
    } else {
      // 문장/대화문은 항목 단위라 글자 수 제한은 넉넉하게 (항목당이 아니라 전체 합산 기준)
      setMin(0); setMax(3000)
    }
  }

  const speakers = speakerText.split(',').map(s => s.trim()).filter(Boolean)

  const handleCreate = async () => {
    if (!appUser || !title || !desc || !dueDate) {
      setErr('제목, 내용, 마감일을 모두 입력해주세요')
      return
    }
    if (contentType !== 'freeWriting' && (!itemCount || itemCount < 1)) {
      setErr('문항 개수를 1개 이상 입력해주세요')
      return
    }
    if (contentType === 'dialogue' && speakers.length < 2) {
      setErr('대화문은 화자가 2명 이상 필요해요 (예: 가, 나)')
      return
    }
    setLoading(true)
    try {
      const label = generateAssignmentLabel(
        appUser.semester, appUser.classId, dueDate, 1
      )
      const assignmentData: Omit<Assignment, 'id' | 'createdAt'> = {
        schoolId:    appUser.schoolId,
        semester:    appUser.semester,
        classId:     appUser.classId,
        createdBy:   appUser.uid,
        title,
        description: desc,
        minChars,
        maxChars,
        dueDate:     new Date(dueDate),
        isActive:    true,
        label,
        allowPaste,
        contentType,
      }
      if (grammar.trim()) assignmentData.grammar = grammar.trim()
      if (contentType !== 'freeWriting') assignmentData.itemCount = itemCount
      if (contentType === 'dialogue')    assignmentData.speakers  = speakers

      await createAssignment(assignmentData)
      onCreated()
    } catch (e) {
      console.error(e)
      setErr('과제 생성 중 오류가 발생했어요')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">📋 새 과제 부여</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        <div className="space-y-4">
          {/* 콘텐츠 유형 선택 */}
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">과제 유형</label>
            <div className="grid grid-cols-3 gap-2">
              {CONTENT_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => handleContentTypeChange(t.value)}
                  className={`p-2.5 rounded-xl border-2 text-center transition-colors ${
                    contentType === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
                  }`}>
                  <p className="text-sm font-bold text-gray-800">{t.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 문장/대화문 세부 설정 */}
          {contentType !== 'freeWriting' && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  {contentType === 'sentence' ? '문장 개수' : '대화 턴(주고받는 횟수)'}
                </label>
                <input type="number" min={1} max={30}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={itemCount} onChange={e => setItemCount(Math.max(1, +e.target.value))} />
              </div>

              {contentType === 'dialogue' && (
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">
                    화자 이름 <span className="font-normal text-gray-400">(쉼표로 구분, 기본 가/나)</span>
                  </label>
                  <input
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    value={speakerText} onChange={e => setSpeakerText(e.target.value)}
                    placeholder="가, 나  또는  민정, 민용" />
                  <p className="text-[11px] text-gray-400 mt-1">
                    턴마다 화자가 번갈아 등장해요 (예: {speakers[0] || '가'} → {speakers[1] || '나'} → {speakers[0] || '가'} ...)
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">과제 제목</label>
            <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="예: V-느니 작문 과제 1차" />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">과제 내용</label>
            <textarea className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 min-h-[90px] resize-none"
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="학생들에게 보여질 과제 설명" />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">
              타깃 문법 <span className="text-gray-300 font-normal">(선택)</span>
            </label>
            <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
              value={grammar} onChange={e => setGrammar(e.target.value)}
              placeholder="예: V-느니" />
          </div>

          {contentType === 'freeWriting' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">최소 글자 수</label>
                <input type="number"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  value={minChars} onChange={e => setMin(+e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">최대 글자 수</label>
                <input type="number"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  value={maxChars} onChange={e => setMax(+e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">마감일</label>
            <input type="date"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
              value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          {/* 붙여넣기 허용 설정 */}
          <div className={`border-2 rounded-xl p-4 transition-colors ${
            allowPaste ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={allowPaste}
                onChange={e => setAllowPaste(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-gray-800">복사/붙여넣기 허용</p>
                {allowPaste ? (
                  <p className="text-xs text-indigo-600 mt-0.5">
                    📋 허용됩니다. 붙여넣은 내용 원본, 삭제한 텍스트, 시간이 모두 기록돼 선생님만 확인할 수 있어요.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">
                    🚫 금지됩니다. 붙여넣기 시도 횟수만 기록돼요.
                  </p>
                )}
              </div>
            </label>
          </div>
        </div>

        {err && <p className="text-red-500 text-sm mt-3">{err}</p>}

        <button onClick={handleCreate}
          disabled={loading || !title || !desc || !dueDate}
          className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors">
          {loading ? '처리 중...' : '과제 부여하기 📤'}
        </button>
      </div>
    </div>
  )
}