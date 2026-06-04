// 📁 components/admin/TextbookList.tsx

'use client'
import { useState, useEffect } from 'react'
import { getAllTextbooks, updateAssignedClasses, getUnits, updateUnit } from '@/lib/firestore/textbooks'
import { Textbook, TextbookUnit, AssignedClass } from '@/types/textbook'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  uploading: { label: '업로드 중',    color: 'bg-blue-100 text-blue-700'   },
  parsing:   { label: 'AI 분석 중',   color: 'bg-amber-100 text-amber-700 animate-pulse' },
  ready:     { label: '사용 가능',    color: 'bg-green-100 text-green-700' },
  error:     { label: '오류',         color: 'bg-red-100 text-red-700'     },
}

// 현재 사용 가능한 학교/학기/반 목록 (추후 Firestore schools 컬렉션에서 가져오도록 확장 가능)
const AVAILABLE_CLASSES: AssignedClass[] = [
  { schoolId: 'dankook', semester: '26-summer', classId: 'advanced-6' },
]

interface Props {
  onRefresh?: () => void
}

export default function TextbookList({ onRefresh }: Props) {
  const [textbooks, setTextbooks]       = useState<Textbook[]>([])
  const [selectedTb, setSelectedTb]     = useState<Textbook | null>(null)
  const [units, setUnits]               = useState<TextbookUnit[]>([])
  const [editUnit, setEditUnit]         = useState<TextbookUnit | null>(null)
  const [assignModal, setAssignModal]   = useState<Textbook | null>(null)
  const [loading, setLoading]           = useState(false)
  const [toast, setToast]               = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadTextbooks = async () => {
    setLoading(true)
    setTextbooks(await getAllTextbooks())
    setLoading(false)
  }

  useEffect(() => { loadTextbooks() }, [])

  const openUnits = async (tb: Textbook) => {
    setSelectedTb(tb)
    const u = await getUnits(tb.id)
    setUnits(u)
  }

  const handleAssign = async (tb: Textbook, classes: AssignedClass[]) => {
    await updateAssignedClasses(tb.id, classes)
    showToast('반 배정이 저장되었어요!')
    setAssignModal(null)
    loadTextbooks()
    onRefresh?.()
  }

  const handleSaveUnit = async () => {
    if (!editUnit || !selectedTb) return
    await updateUnit(selectedTb.id, editUnit.id, {
      vocabulary:  editUnit.vocabulary,
      grammar:     editUnit.grammar,
      idioms:      editUnit.idioms,
      readingTopics:   editUnit.readingTopics,
      listeningPoints: editUnit.listeningPoints,
      writingTheme:    editUnit.writingTheme,
    })
    showToast('수정이 저장되었어요!')
    const updated = await getUnits(selectedTb.id)
    setUnits(updated)
    setEditUnit(null)
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-10 text-sm animate-pulse">교재 목록 불러오는 중...</div>
  }

  if (textbooks.length === 0) {
    return <div className="text-center text-gray-400 py-10 text-sm">등록된 교재가 없어요. 교재를 업로드해주세요.</div>
  }

  return (
    <div className="space-y-3">
      {textbooks.map(tb => {
        const sc = STATUS_LABEL[tb.status] ?? STATUS_LABEL.error
        return (
          <div key={tb.id} className="border border-gray-100 rounded-2xl p-4 hover:border-indigo-200 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm">{tb.title}</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{tb.level}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${sc.color}`}>{sc.label}</span>
                </div>

                {/* 배정된 반 */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {tb.assignedClasses?.length > 0 ? (
                    tb.assignedClasses.map((ac, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {formatSchool(ac.schoolId)} {formatSemester(ac.semester)} {formatClass(ac.classId)}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-300">배정된 반 없음</span>
                  )}
                </div>

                {tb.status === 'ready' && (
                  <div className="text-xs text-gray-400 mt-1">{tb.unitCount}개 단원 파싱 완료</div>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setAssignModal(tb)}
                  className="text-xs border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 font-bold transition-colors"
                >
                  반 배정
                </button>
                {tb.status === 'ready' && (
                  <button
                    onClick={() => openUnits(tb)}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-bold transition-colors"
                  >
                    단원 보기
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* ── 단원 목록 모달 ── */}
      {selectedTb && (
        <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-3xl w-full max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-lg">{selectedTb.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{units.length}개 단원</p>
              </div>
              <button onClick={() => { setSelectedTb(null); setEditUnit(null) }} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-2">
              {units.map(unit => (
                <div key={unit.id} className="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm">{unit.unitNumber}과 {unit.title}</div>
                    <div className="flex items-center gap-2">
                      {unit.manuallyEdited && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">수정됨</span>
                      )}
                      <button
                        onClick={() => setEditUnit({ ...unit })}
                        className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-50 font-bold"
                      >
                        수정
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    <span>어휘 {unit.vocabulary?.length ?? 0}개</span>
                    <span>문법 {unit.grammar?.length ?? 0}개</span>
                    <span>관용어 {unit.idioms?.length ?? 0}개</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 단원 수정 모달 ── */}
      {editUnit && (
        <div className="fixed inset-0 bg-[rgba(30,27,75,0.55)] backdrop-blur-sm z-[60] flex items-center justify-center p-5">
          <div className="bg-white rounded-3xl w-full max-w-[680px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-lg">{editUnit.unitNumber}과 수정 — {editUnit.title}</h2>
              <button onClick={() => setEditUnit(null)} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* 어휘 */}
              <div>
                <div className="text-xs font-bold text-gray-400 mb-2">핵심 어휘 (JSON 직접 편집)</div>
                <textarea
                  className="w-full border-2 border-gray-200 rounded-xl p-3 text-xs font-mono min-h-[120px] resize-y outline-none focus:border-indigo-400"
                  value={JSON.stringify(editUnit.vocabulary, null, 2)}
                  onChange={e => {
                    try { setEditUnit({ ...editUnit, vocabulary: JSON.parse(e.target.value) }) } catch {}
                  }}
                />
              </div>
              {/* 문법 */}
              <div>
                <div className="text-xs font-bold text-gray-400 mb-2">문법</div>
                <textarea
                  className="w-full border-2 border-gray-200 rounded-xl p-3 text-xs font-mono min-h-[100px] resize-y outline-none focus:border-indigo-400"
                  value={JSON.stringify(editUnit.grammar, null, 2)}
                  onChange={e => {
                    try { setEditUnit({ ...editUnit, grammar: JSON.parse(e.target.value) }) } catch {}
                  }}
                />
              </div>
              {/* 관용어 */}
              <div>
                <div className="text-xs font-bold text-gray-400 mb-2">관용어</div>
                <textarea
                  className="w-full border-2 border-gray-200 rounded-xl p-3 text-xs font-mono min-h-[80px] resize-y outline-none focus:border-indigo-400"
                  value={JSON.stringify(editUnit.idioms, null, 2)}
                  onChange={e => {
                    try { setEditUnit({ ...editUnit, idioms: JSON.parse(e.target.value) }) } catch {}
                  }}
                />
              </div>
              {/* 쓰기 주제 */}
              <div>
                <div className="text-xs font-bold text-gray-400 mb-2">쓰기 주제</div>
                <input
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                  value={editUnit.writingTheme}
                  onChange={e => setEditUnit({ ...editUnit, writingTheme: e.target.value })}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditUnit(null)} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl text-sm">취소</button>
              <button onClick={handleSaveUnit} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors">저장하기 ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 반 배정 모달 ── */}
      {assignModal && (
        <AssignClassModal
          textbook={assignModal}
          availableClasses={AVAILABLE_CLASSES}
          onSave={(classes) => handleAssign(assignModal, classes)}
          onClose={() => setAssignModal(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-[70]">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── 반 배정 모달 ──────────────────────────────────
function AssignClassModal({
  textbook, availableClasses, onSave, onClose
}: {
  textbook: Textbook
  availableClasses: AssignedClass[]
  onSave: (classes: AssignedClass[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<AssignedClass[]>(textbook.assignedClasses ?? [])

  const toggle = (ac: AssignedClass) => {
    const exists = selected.some(
      s => s.schoolId === ac.schoolId && s.semester === ac.semester && s.classId === ac.classId
    )
    setSelected(exists
      ? selected.filter(s => !(s.schoolId === ac.schoolId && s.semester === ac.semester && s.classId === ac.classId))
      : [...selected, ac]
    )
  }

  const isSelected = (ac: AssignedClass) =>
    selected.some(s => s.schoolId === ac.schoolId && s.semester === ac.semester && s.classId === ac.classId)

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.55)] backdrop-blur-sm z-[60] flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-8 w-full max-w-[480px] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-lg">반 배정</h2>
            <p className="text-xs text-gray-400 mt-0.5">{textbook.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="space-y-2 mb-6">
          {availableClasses.map((ac, i) => (
            <label key={i} className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors
              ${isSelected(ac) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'}`}>
              <input
                type="checkbox"
                checked={isSelected(ac)}
                onChange={() => toggle(ac)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
              <span className="text-sm font-bold">
                {formatSchool(ac.schoolId)} · {formatSemester(ac.semester)} · {formatClass(ac.classId)}
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl text-sm">취소</button>
          <button onClick={() => onSave(selected)} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors">저장 ✓</button>
        </div>
      </div>
    </div>
  )
}