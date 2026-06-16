'use client'
import { useEffect, useState } from 'react'
import {
  getRoster, addRosterEntry, updateRosterEntry,
  deleteRosterEntry, addRosterBulk, type RosterEntry,
} from '@/lib/firestore/roster'
import { hashStudentId } from '@/lib/crypto'

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
  const [form, setForm] = useState({
    nameEn:    '',   // 여권 영문명
    nameKr:    '',   // 한글명
    nickname:  '',   // 부르는 이름
    studentId: '',   // 학번 (입력용, 저장 시 해시)
  })

  // 일괄 입력
  const [bulkText,    setBulkText]    = useState('')
  const [showBulk,    setShowBulk]    = useState(false)
  const [bulkPreview, setBulkPreview] = useState<{
    nameEn: string; nameKr: string; nickname: string; studentId: string
  }[]>([])

  const load = async () => {
    setLoading(true)
    try { setRoster(await getRoster(schoolId, semester, classId)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [schoolId, semester, classId])

  // 단일 추가
  const handleAdd = async () => {
    if (!form.nameEn.trim() || !form.nameKr.trim() || !form.studentId.trim()) {
      alert('여권 영문명, 한글명, 학번은 필수예요.')
      return
    }
    const studentIdHash = await hashStudentId(form.studentId)
    await addRosterEntry({
      nameEn:        form.nameEn.trim().toUpperCase(),
      nameKr:        form.nameKr.trim(),
      nickname:      form.nickname.trim() || form.nameKr.trim(),
      studentIdHash,
      schoolId, semester, classId,
    })
    setForm({ nameEn: '', nameKr: '', nickname: '', studentId: '' })
    await load()
  }

  // 삭제
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}"을 출석부에서 삭제할까요?`)) return
    await deleteRosterEntry(id)
    await load()
  }

  // 일괄 파싱: 여권영문명 탭 한글명 탭 학번 (탭 구분)
  const parseBulk = (text: string) => {
    return text.trim().split('\n').filter(l => l.trim()).map(line => {
      const parts = line.trim().split(/\t/)
      return {
        nameEn:    (parts[0] ?? '').toUpperCase().trim(),
        nameKr:    (parts[1] ?? '').trim(),
        studentId: (parts[2] ?? '').trim(),
        nickname:  (parts[1] ?? '').trim(),
      }
    }).filter(e => e.nameEn && e.nameKr && e.studentId)
  }

  const handleBulkPreview = () => setBulkPreview(parseBulk(bulkText))

  const handleBulkSubmit = async () => {
    if (!bulkPreview.length) return
    const entries = await Promise.all(bulkPreview.map(async e => ({
      nameEn:        e.nameEn,
      nameKr:        e.nameKr,
      nickname:      e.nickname,
      studentIdHash: await hashStudentId(e.studentId),
      schoolId, semester, classId,
    })))
    await addRosterBulk(entries)
    setBulkText(''); setBulkPreview([]); setShowBulk(false)
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

      {/* 일괄 입력 */}
      {showBulk && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-indigo-800">엑셀에서 복사해서 붙여넣기</p>
          <p className="text-xs text-indigo-600">형식: 여권영문명 [탭] 한글명 [탭] 학번 (한 줄에 한 명)</p>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
            placeholder={"JUNHO OH\t오준호\t2024001\nMINJUN KIM\t김민준\t2024002"}
            rows={6}
            className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-indigo-400" />
          <div className="flex gap-2">
            <button onClick={handleBulkPreview}
              className="px-4 py-2 bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-200">
              미리보기
            </button>
            {bulkPreview.length > 0 && (
              <button onClick={handleBulkSubmit}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700">
                {bulkPreview.length}명 등록
              </button>
            )}
          </div>
          {bulkPreview.length > 0 && (
            <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-indigo-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-600">여권 영문명</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-600">한글명</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-indigo-600">학번</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bulkPreview.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{e.nameEn}</td>
                      <td className="px-3 py-2">{e.nameKr}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{e.studentId}</td>
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
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={form.nameEn} onChange={e => setForm(p => ({ ...p, nameEn: e.target.value.toUpperCase() }))}
            placeholder="여권 영문명 * (예: JUNHO OH)"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <input value={form.nameKr} onChange={e => setForm(p => ({ ...p, nameKr: e.target.value }))}
            placeholder="한글명 *"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <input value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))}
            placeholder="학번 *"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
            placeholder="부르는 이름 (비워두면 한글명)"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <button onClick={handleAdd}
          className="w-full py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          + 추가
        </button>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">여권 영문명</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">한글명</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">부르는 이름</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td></tr>
                ))
              ) : roster.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  <p className="text-2xl mb-2">📋</p>
                  <p>출석부가 비어 있어요.</p>
                </td></tr>
              ) : roster.map(entry => (
                <RosterRow
                  key={entry.id}
                  entry={entry}
                  isEditing={editId === entry.id}
                  onEdit={() => setEditId(entry.id)}
                  onSave={async (data) => { await updateRosterEntry(entry.id, data); setEditId(null); await load() }}
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

function RosterRow({ entry, isEditing, onEdit, onSave, onCancel, onDelete }: {
  entry:     RosterEntry
  isEditing: boolean
  onEdit:    () => void
  onSave:    (data: Partial<RosterEntry>) => void
  onCancel:  () => void
  onDelete:  () => void
}) {
  const [nameEn,   setNameEn]   = useState(entry.nameEn)
  const [nameKr,   setNameKr]   = useState(entry.nameKr)
  const [nickname, setNickname] = useState(entry.nickname)

  if (isEditing) {
    return (
      <tr className="bg-indigo-50">
        <td className="px-4 py-2">
          <input value={nameEn} onChange={e => setNameEn(e.target.value.toUpperCase())}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none font-mono" />
        </td>
        <td className="px-4 py-2">
          <input value={nameKr} onChange={e => setNameKr(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
        </td>
        <td className="px-4 py-2">
          <input value={nickname} onChange={e => setNickname(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
        </td>
        <td className="px-4 py-2 text-center"><StatusBadge status={entry.status} /></td>
        <td className="px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => onSave({ nameEn, nameKr, nickname })}
              className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">저장</button>
            <button onClick={onCancel}
              className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-200">취소</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-gray-600">{entry.nameEn}</td>
      <td className="px-4 py-3 font-semibold text-gray-900">{entry.nameKr}</td>
      <td className="px-4 py-3 text-gray-600">
        {entry.nickname !== entry.nameKr
          ? <span className="text-indigo-600 font-medium">{entry.nickname}</span>
          : <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3 text-center"><StatusBadge status={entry.status} /></td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <button onClick={onEdit}
            className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200">수정</button>
          {entry.status === 'unregistered' && (
            <button onClick={onDelete}
              className="px-2.5 py-1 text-red-400 hover:text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50">삭제</button>
          )}
        </div>
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: RosterEntry['status'] }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
      status === 'registered' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {status === 'registered' ? '✅ 가입완료' : '⏳ 미가입'}
    </span>
  )
}