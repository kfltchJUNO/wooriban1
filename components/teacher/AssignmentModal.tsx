'use client'
// components/teacher/AssignmentModal.tsx
import { useState } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { createAssignment } from '@/lib/firestore/assignments'
import { generateAssignmentLabel } from '@/lib/utils/classUtils'
import { Assignment, AssignmentContentType } from '@/types/assignment'
import { TOPIK_TEMPLATES, TopikTemplate } from '@/data/topikTemplates'

interface Props {
  onClose:   () => void
  onCreated: () => void
}

const CONTENT_TYPES: { value: AssignmentContentType; label: string; desc: string }[] = [
  { value: 'freeWriting', label: '📝 자유글',    desc: '한 편의 글을 자유롭게 작성' },
  { value: 'sentence',    label: '✏️ 문장',      desc: '지정한 개수만큼 문장을 각각 작성' },
  { value: 'dialogue',    label: '💬 대화문',    desc: '화자를 나눠 대화를 주고받는 형식' },
  { value: 'topik53',     label: '📊 TOPIK 53번', desc: '도표/통계 분석 실용문 (200~300자)' },
  { value: 'topik54',     label: '🏆 TOPIK 54번', desc: '주제 논술형 긴 글 (600~700자)' },
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

  // 템플릿 모달/팝오버 상태
  const [showTemplates, setShowTemplates] = useState(false)

  // ── 콘텐츠 유형 ──────────────────────────────────────────────
  const [contentType, setContentType] = useState<AssignmentContentType>('freeWriting')
  const [itemCount,   setItemCount]   = useState(5)      // 문장/대화문 항목 개수
  const [speakerText, setSpeakerText] = useState('가, 나') // 쉼표로 구분 입력

  const handleContentTypeChange = (type: AssignmentContentType) => {
    setContentType(type)
    if (type === 'freeWriting') {
      setMin(150); setMax(2000)
    } else if (type === 'sentence') {
      setMin(0); setMax(3000)
      if (itemCount < 1) setItemCount(5)
    } else if (type === 'dialogue') {
      setMin(0); setMax(3000)
      if (itemCount < 2) setItemCount(4)
    } else if (type === 'topik53') {
      setMin(200); setMax(300)
      if (!title) setTitle('TOPIK II 53번 쓰기 연습')
      if (!desc) setDesc('다음을 참고하여 200~300자로 글을 쓰십시오. (도표와 통계 자료를 분석하여 원인 및 전망 서술)')
    } else if (type === 'topik54') {
      setMin(600); setMax(700)
      if (!title) setTitle('TOPIK II 54번 논술 쓰기')
      if (!desc) setDesc('다음을 주제로 하여 자신의 생각을 600~700자로 글을 쓰십시오.\n1. 주제에 대한 현황이나 원인\n2. 장단점 또는 문제점\n3. 바람직한 해결 방안')
    }
  }

  const handleApplyTemplate = (tmpl: TopikTemplate) => {
    setContentType(tmpl.type)
    setTitle(tmpl.title)
    setDesc(tmpl.description)
    setMin(tmpl.minChars)
    setMax(tmpl.maxChars)
    setShowTemplates(false)
  }

  const speakers = speakerText.split(',').map(s => s.trim()).filter(Boolean)

  const handleCreate = async () => {
    if (!appUser || !title || !desc || !dueDate) {
      setErr('제목, 내용, 마감일을 모두 입력해주세요')
      return
    }
    const isItemType = contentType === 'sentence' || contentType === 'dialogue'
    if (isItemType && (!itemCount || itemCount < 1)) {
      setErr('문항 개수를 1개 이상 입력해주세요')
      return
    }
    if (contentType === 'dialogue') {
      if (speakers.length < 2) {
        setErr('대화문은 화자가 2명 이상 필요해요 (예: 가, 나)')
        return
      }
      if (itemCount < speakers.length) {
        setErr(`대화문은 최소 ${speakers.length}개 이상의 발화 칸이 필요해요 (화자당 최소 1회)`)
        return
      }
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
      if (isItemType) assignmentData.itemCount = itemCount
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-gray-400">과제 유형</label>
              <button
                type="button"
                onClick={() => setShowTemplates(v => !v)}
                className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
              >
                <span>📋</span>
                <span>TOPIK 추천 템플릿</span>
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {CONTENT_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => handleContentTypeChange(t.value)}
                  className={`p-2 rounded-xl border-2 text-center transition-colors ${
                    contentType === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
                  }`}>
                  <p className="text-xs font-bold text-gray-800">{t.label}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* TOPIK 템플릿 선택 패널 */}
          {showTemplates && (
            <div className="bg-amber-50/70 border-2 border-amber-200 rounded-2xl p-3.5 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between pb-1.5 border-b border-amber-200/60">
                <span className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                  <span>🏆</span> TOPIK 기출·단골 논제 템플릿 라이브러리
                </span>
                <button onClick={() => setShowTemplates(false)} className="text-xs text-amber-600 hover:text-amber-800 font-bold">닫기 ✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {TOPIK_TEMPLATES.map(tmpl => (
                  <div
                    key={tmpl.id}
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="bg-white p-3 rounded-xl border border-amber-200 hover:border-amber-400 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          tmpl.type === 'topik53' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {tmpl.type === 'topik53' ? '53번' : '54번'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-semibold">{tmpl.category}</span>
                      </div>
                      <p className="text-xs font-bold text-gray-800 group-hover:text-amber-700 line-clamp-1">
                        {tmpl.title}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                        {tmpl.description.slice(0, 70)}...
                      </p>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-amber-600 font-semibold">
                      <span>권장 {tmpl.minChars}~{tmpl.maxChars}자</span>
                      <span className="underline group-hover:font-black">적용하기 →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 문장/대화문 세부 설정 */}
          {(contentType === 'sentence' || contentType === 'dialogue') && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  {contentType === 'sentence' ? '문장 개수' : '대화 발화(칸) 개수'}
                </label>
                <input type="number" min={contentType === 'dialogue' ? Math.max(2, speakers.length) : 1} max={30}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={itemCount} onChange={e => setItemCount(Math.max(1, +e.target.value))} />
                {contentType === 'dialogue' && (
                  <p className="text-[11px] text-indigo-600 font-medium mt-1">
                    💡 학생 화면에 총 {Math.max(speakers.length, itemCount)}개의 대화 칸이 생성돼요 ({speakers.join(' ➔ ')} 순서로 번갈아 발화)
                  </p>
                )}
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
                    화자가 순서대로 번갈아 등장해요 (예: {speakers[0] || '가'} → {speakers[1] || '나'} → {speakers[0] || '가'} ...)
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

          {contentType !== 'sentence' && contentType !== 'dialogue' && (
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