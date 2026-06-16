'use client'
import { useEffect, useState } from 'react'
import {
  getRoster, addRosterEntry, updateRosterEntry,
  deleteRosterEntry, addRosterBulk, type RosterEntry,
} from '@/lib/firestore/roster'

interface Props {
  schoolId: string
  semester: string
  classId:  string
}

export default function RosterManager({ schoolId, semester, classId }: Props) {
  const [roster,  setRoster]  = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editId,  setEditId]  = useState<string | null>(null)

  // 단일 추가 폼
  const [form, setForm] = useState({ nameKr: '', nickname: '', studentId: '' })

  // 일괄 입력 (붙여넣기)
  const [bulkText,    setBulkText]    = useState('')
  const [showBulk,    setShowBulk]    = useState(false)
  const [bulkPreview, setBulkPreview] = useState<{ nameKr: string; nickname: string; studentId: string }[]>([])

  const load = async () => {
    setLoading(true)
    try { setRoster(await getRoster(schoolId, semester, classId)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [schoolId, semester, classId]) // eslint-disable-line

  // 단일 추가
  const handleAdd = async () => {
    if (!form.nameKr.trim() || !form.studentId.trim()) {
      alert('이름과 학번은 필수예요.')
      return
    }
    await addRosterEntry({
      nameKr:    form.nameKr.trim(),
      nickname:  form.nickname.trim() || form.nameKr.trim(),
      studentId: form.studentId.trim(),
      schoolId, semester, classId,
    })
    setForm({ nameKr: '', nickname: '', studentId: '' })
    await load()
  }

  // 인라인 수정
  const handleUpdate = async (id: string, data: Partial<RosterEntry>) => {
    await updateRosterEntry(id, data)
    setEditId(null)
    await load()
  }

  // 삭제
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}"을 출석부에서 삭제할까요?`)) return
    await deleteRosterEntry(id)
    await load()
  }

  // 일괄 입력 파싱
  // 형식: 이름 학번 (탭 또는 공백 구분)
  // 예: 오준호  2024001
  //     김민준  2024002
  const parseBulk = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    return lines.map(line => {
      const parts = line.trim().split(/\s+/)
      return {
        nameKr:    parts[0] ?? '',
        studentId: parts[1] ?? '',
        nickname:  parts[0] ?? '',  // 기본값: 이름과 동일
      }
    }).filter(e => e.nameKr && e.studentId)
  }

  const handleBulkPreview = () => {
    setBulkPreview(parseBulk(bulkText))
  }

  const handleBulkSubmit = async () => {
    if (!bulkPreview.length) return
    await addRosterBulk(bulkPreview.map(e => ({
      ...e, schoolId, semester, classId,
    })))
    setBulkText('')
    setBulkPreview([])
    setShowBulk(false)
    await load()
  }

  const registered   = roster.filter(r => r.status === 'registered')
  const unregistered = roster.filter(r => r.status === 'unregistered')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">출석부 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            전체 {roster.length}명 · 가입완료 {registered.length}명 · 미가입 {unregistered.length}명
          </p>
        </div>
        <button onClick={() => setShowBulk(v => !v)}
          className="px-4 py-2 border border-indigo-200 text-indigo-600 text-sm font-semibold rounded-xl hover:bg-indigo-50 transition-colors">
          📋 일괄 입력
        </button>
      </div>

      {/* 일괄 입력 패널 */}
      {showBulk && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-indigo-800">엑셀에서 복사해서 붙여넣기</p>
          <p className="text-xs text-indigo-600">형식: 이름 [탭] 학번 (한 줄에 한 명)</p>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
            placeholder={"오준호\t2024001\n김민준\t2024002\n이수진\t2024003"}
            rows={6}
            className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-indigo-400" />

          <div className="flex gap-2">
            <button onClick={handleBulkPreview}
              className="px-4 py-2 bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-200 transition-colors">
              미리보기
            </button>
            {bulkPreview.length > 0 && (
              <button onClick={handleBulkSubmit}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                {bulkPreview.length}명 등록
              </button>
            )}
          </div>

          {/* 미리보기 */}
          {bulkPreview.length > 0 && (
            <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-indigo-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-indigo-600">이름</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-indigo-600">학번</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-indigo-600">부르는 이름</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bulkPreview.map((e, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{e.nameKr}</td>
                      <td className="px-4 py-2 text-gray-500">{e.studentId}</td>
                      <td className="px-4 py-2 text-gray-400">{e.nickname}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 단일 추가 폼 */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 mb-3">학생 추가</p>
        <div className="flex gap-2 flex-wrap">
          <input value={form.nameKr} onChange={e => setForm(p => ({ ...p, nameKr: e.target.value }))}
            placeholder="출석부 이름 *"
            className="flex-1 min-w-[120px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <input value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))}
            placeholder="학번 *"
            className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
            placeholder="부르는 이름 (선택)"
            className="flex-1 min-w-[120px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <button onClick={handleAdd}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap">
            + 추가
          </button>
        </div>
      </div>

      {/* 출석부 목록 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">출석부 이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">부르는 이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">학번</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : roster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    <p className="text-2xl mb-2">📋</p>
                    <p>출석부가 비어 있어요. 학생을 추가해주세요.</p>
                  </td>
                </tr>
              ) : roster.map(entry => (
                <RosterRow
                  key={entry.id}
                  entry={entry}
                  isEditing={editId === entry.id}
                  onEdit={() => setEditId(entry.id)}
                  onSave={(data) => handleUpdate(entry.id, data)}
                  onCancel={() => setEditId(null)}
                  onDelete={() => handleDelete(entry.id, entry.nameKr)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── 출석부 행 컴포넌트 ─────────────────────────────────────────────
function RosterRow({
  entry, isEditing, onEdit, onSave, onCancel, onDelete,
}: {
  entry:     RosterEntry
  isEditing: boolean
  onEdit:    () => void
  onSave:    (data: Partial<RosterEntry>) => void
  onCancel:  () => void
  onDelete:  () => void
}) {
  const [nameKr,    setNameKr]    = useState(entry.nameKr)
  const [nickname,  setNickname]  = useState(entry.nickname)
  const [studentId, setStudentId] = useState(entry.studentId)

  if (isEditing) {
    return (
      <tr className="bg-indigo-50">
        <td className="px-4 py-2">
          <input value={nameKr} onChange={e => setNameKr(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
        </td>
        <td className="px-4 py-2">
          <input value={nickname} onChange={e => setNickname(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
        </td>
        <td className="px-4 py-2">
          <input value={studentId} onChange={e => setStudentId(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
            disabled={entry.status === 'registered'} // 가입완료 후 학번 수정 불가
          />
        </td>
        <td className="px-4 py-2 text-center">
          <StatusBadge status={entry.status} />
        </td>
        <td className="px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => onSave({ nameKr, nickname, studentId })}
              className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
              저장
            </button>
            <button onClick={onCancel}
              className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-200">
              취소
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-semibold text-gray-900">{entry.nameKr}</td>
      <td className="px-4 py-3 text-gray-600">
        {entry.nickname !== entry.nameKr
          ? <span className="text-indigo-600 font-medium">{entry.nickname}</span>
          : <span className="text-gray-400">—</span>
        }
      </td>
      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{entry.studentId}</td>
      <td className="px-4 py-3 text-center">
        <StatusBadge status={entry.status} />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <button onClick={onEdit}
            className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors">
            수정
          </button>
          {entry.status === 'unregistered' && (
            <button onClick={onDelete}
              className="px-2.5 py-1 text-red-400 hover:text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
              삭제
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: RosterEntry['status'] }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
      status === 'registered'
        ? 'bg-green-100 text-green-700'
        : 'bg-gray-100 text-gray-500'
    }`}>
      {status === 'registered' ? '✅ 가입완료' : '⏳ 미가입'}
    </span>
  )
}