'use client'
// components/teacher/RosterManager.tsx
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  getRoster, addRosterEntry, updateRosterEntry,
  deleteRosterEntry, addRosterBulk, type RosterEntry,
} from '@/lib/firestore/roster'
import { hashStudentId } from '@/lib/crypto'
import { getAllSchools } from '@/lib/firestore/schools'
import { getDocs, collection, query, where, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

interface Props {
  schoolId: string
  semester: string
  classId:  string
}

interface PreviewRow {
  nameEn:    string
  nameKr:    string
  nickname:  string
  studentId: string
  error?:    string
}

// 레거시 schoolId → 현재 문서 ID 명시적 매핑
// (기존 휴리스틱은 "dankook".includes("dk")=false 등으로 전부 매칭 실패하는 결함이 있었음)
const LEGACY_SCHOOL_MAP: Record<string, string> = {
  dankook: 'dk',
  dongguk: 'dg',
}

export default function RosterManager({ schoolId: rawSchoolId, semester, classId }: Props) {
  const [roster,    setRoster]    = useState<RosterEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [toast,     setToast]     = useState('')
  const [inputMode, setInputMode] = useState<'single' | 'excel' | 'paste'>('single')
  const [schoolId,  setSchoolId]  = useState(rawSchoolId)
  const [sortBy,    setSortBy]    = useState<'manual' | 'nameKr' | 'nameEn' | 'status'>('manual')
  const [migrating, setMigrating] = useState(false)

  const [form, setForm] = useState({
    nameEn: '', nameKr: '', nickname: '', studentId: '',
  })

  const fileRef = useRef<HTMLInputElement>(null)
  const [preview,     setPreview]     = useState<PreviewRow[]>([])
  const [bulkText,    setBulkText]    = useState('')
  const [bulkPreview, setBulkPreview] = useState<PreviewRow[]>([])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // ── schoolId 정규화 (schools 컬렉션 문서 ID 기준) ─────────────
  useEffect(() => {
    getAllSchools().then(schools => {
      // 1. 직접 일치 (정상 케이스)
      if (schools.some(s => s.id === rawSchoolId)) {
        setSchoolId(rawSchoolId)
        return
      }
      // 2. 레거시 맵 (dankook → dk)
      const legacy = LEGACY_SCHOOL_MAP[rawSchoolId]
      if (legacy && schools.some(s => s.id === legacy)) {
        setSchoolId(legacy)
        return
      }
      // 3. 접두사 추정 (rawSchoolId가 "dk..." 형태로 시작하는 경우)
      const byPrefix = schools.find(s => rawSchoolId.toLowerCase().startsWith(s.id))
      if (byPrefix) {
        setSchoolId(byPrefix.id)
        return
      }
      // 매칭 실패 시 원본 유지 (마이그레이션 버튼은 schoolId !== rawSchoolId일 때만 표시)
      setSchoolId(rawSchoolId)
    })
  }, [rawSchoolId])

  // ── 로드 ──────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      const data = await getRoster(schoolId, semester, classId)
      if (data.length === 0 && schoolId !== rawSchoolId) {
        // 정규화된 ID로 없으면 레거시 ID로도 조회 (마이그레이션 전 데이터)
        const fallback = await getRoster(rawSchoolId, semester, classId)
        setRoster(fallback)
      } else {
        setRoster(data)
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { if (schoolId) load() }, [schoolId, semester, classId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 레거시 데이터 마이그레이션 ────────────────────────────────
  const handleMigrate = async () => {
    if (!confirm(`기존 출석부 데이터의 schoolId를 "${schoolId}"로 일괄 수정할까요?`)) return
    setMigrating(true)
    try {
      const q = query(
        collection(db, 'roster'),
        where('schoolId', '==', rawSchoolId),
        where('semester', '==', semester),
        where('classId',  '==', classId),
      )
      const snap = await getDocs(q)
      if (snap.empty) { showToast('마이그레이션할 데이터가 없어요.'); return }
      await Promise.all(snap.docs.map(d =>
        updateDoc(doc(db, 'roster', d.id), { schoolId })
      ))
      showToast(`${snap.size}개 데이터가 수정됐어요!`)
      await load()
    } catch (e) {
      showToast('마이그레이션 실패: ' + String(e))
    } finally { setMigrating(false) }
  }

  // ── 단일 추가 ─────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.nameEn.trim() || !form.nameKr.trim() || !form.studentId.trim()) {
      showToast('여권 영문명, 한글명, 학번은 필수예요.')
      return
    }
    const studentIdHash = await hashStudentId(form.studentId)
    await addRosterEntry({
      nameEn:        form.nameEn.trim().toUpperCase(),
      nameKr:        form.nameKr.trim(),
      nickname:      form.nickname.trim() || form.nameKr.trim(),
      studentIdHash,
      sortOrder:     roster.length,   // 입력 순서 자동 지정
      schoolId, semester, classId,
    })
    setForm({ nameEn: '', nameKr: '', nickname: '', studentId: '' })
    showToast('학생이 추가됐어요!')
    await load()
  }

  // ── 엑셀 업로드 ───────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf)
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    if (rows.length === 0) { showToast('엑셀에 데이터가 없어요.'); return }

    // 열 이름 자동 인식
    const keys = Object.keys(rows[0])
    const findKey = (...cands: string[]) =>
      keys.find(k => cands.some(c => k.toLowerCase().includes(c))) ?? ''
    const kEn   = findKey('영문', 'english', 'passport', 'nameen')
    const kKr   = findKey('한글', '이름', 'namekr', 'korean')
    const kNick = findKey('별명', '닉네임', 'nick')
    const kId   = findKey('학번', 'id', 'number', 'no')

    const parsed: PreviewRow[] = rows.map(r => {
      const nameEn    = String(r[kEn]   ?? '').trim().toUpperCase()
      const nameKr    = String(r[kKr]   ?? '').trim()
      const nickname  = String(r[kNick] ?? '').trim()
      const studentId = String(r[kId]   ?? '').trim()
      let error = ''
      if (!nameEn)    error = '영문명 없음'
      else if (!nameKr) error = '한글명 없음'
      else if (!studentId) error = '학번 없음'
      return { nameEn, nameKr, nickname, studentId, error: error || undefined }
    })
    setPreview(parsed)
  }

  // ── 붙여넣기 파싱 (탭/쉼표 구분: 영문명, 한글명, 별명, 학번) ──
  const parseBulkText = (text: string) => {
    const rows = text.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed: PreviewRow[] = rows.map(line => {
      const cols = line.split(/\t|,/).map(c => c.trim())
      const [nameEn = '', nameKr = '', nickname = '', studentId = ''] = cols
      let error = ''
      if (!nameEn)         error = '영문명 없음'
      else if (!nameKr)    error = '한글명 없음'
      else if (!studentId) error = '학번 없음'
      return {
        nameEn: nameEn.toUpperCase(), nameKr, nickname, studentId,
        error: error || undefined,
      }
    })
    setBulkPreview(parsed)
  }

  // ── 일괄 등록 ─────────────────────────────────────────────────
  const handleBulkSubmit = async (rows: PreviewRow[]) => {
    const valid = rows.filter(r => !r.error)
    if (!valid.length) { showToast('등록 가능한 데이터가 없어요.'); return }
    const base = roster.length
    const entries = await Promise.all(valid.map(async (r, i) => ({
      nameEn:        r.nameEn,
      nameKr:        r.nameKr,
      nickname:      r.nickname || r.nameKr,
      studentIdHash: await hashStudentId(r.studentId),
      sortOrder:     base + i,   // 파일/붙여넣기 순서 그대로
      schoolId, semester, classId,
    })))
    await addRosterBulk(entries)
    showToast(`${entries.length}명 등록됐어요!`)
    setPreview([]); setBulkPreview([]); setBulkText('')
    if (fileRef.current) fileRef.current.value = ''
    await load()
  }

  // ── 삭제 ──────────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} 학생을 출석부에서 삭제할까요?`)) return
    await deleteRosterEntry(id)
    showToast('삭제됐어요.')
    await load()
  }

  // ── 정렬 ──────────────────────────────────────────────────────
  const sorted = [...roster].sort((a, b) => {
    switch (sortBy) {
      case 'nameKr':
        return (a.nameKr ?? '').localeCompare(b.nameKr ?? '', 'ko')
      case 'nameEn':
        return (a.nameEn ?? '').localeCompare(b.nameEn ?? '')
      case 'status':
        if (a.status !== b.status) return a.status === 'unregistered' ? -1 : 1
        return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
      case 'manual':
      default:
        return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
    }
  })

  // ── 순서 이동 (manual 정렬에서만) ─────────────────────────────
  const moveEntry = async (idx: number, dir: -1 | 1) => {
    const target = sorted[idx]
    const swap   = sorted[idx + dir]
    if (!target || !swap) return
    const aOrder = target.sortOrder ?? idx
    const bOrder = swap.sortOrder   ?? idx + dir
    await Promise.all([
      updateRosterEntry(target.id, { sortOrder: bOrder }),
      updateRosterEntry(swap.id,   { sortOrder: aOrder }),
    ])
    await load()
  }

  const registered   = roster.filter(r => r.status === 'registered')
  const unregistered = roster.filter(r => r.status !== 'registered')

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">출석부 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            전체 {roster.length}명 · 가입완료 {registered.length}명 · 미가입 {unregistered.length}명
          </p>
        </div>
        {schoolId !== rawSchoolId && (
          <button onClick={handleMigrate} disabled={migrating}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40">
            {migrating ? '수정 중...' : '⚠️ 데이터 수정 필요 (클릭)'}
          </button>
        )}
      </div>

      {schoolId !== rawSchoolId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <p className="font-bold">⚠️ 출석부 데이터 수정이 필요해요</p>
          <p className="text-xs mt-0.5">
            기존 데이터의 schoolId({rawSchoolId})와 현재 학교 ID({schoolId})가 달라요.
            위 버튼을 눌러 일괄 수정해주세요.
          </p>
        </div>
      )}

      {/* 입력 모드 탭 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {([
            ['single', '직접 입력'],
            ['excel',  '엑셀 업로드'],
            ['paste',  '붙여넣기'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setInputMode(key)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                inputMode === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* 직접 입력 */}
        {inputMode === 'single' && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[130px]">
              <label className="text-xs font-bold text-gray-400 block mb-1">여권 영문명 *</label>
              <input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value.toUpperCase() }))}
                placeholder="JUNHO OH" className={inputCls} />
            </div>
            <div className="w-28">
              <label className="text-xs font-bold text-gray-400 block mb-1">한글명 *</label>
              <input value={form.nameKr} onChange={e => setForm(f => ({ ...f, nameKr: e.target.value }))}
                placeholder="오준호" className={inputCls} />
            </div>
            <div className="w-28">
              <label className="text-xs font-bold text-gray-400 block mb-1">별명</label>
              <input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                placeholder="(선택)" className={inputCls} />
            </div>
            <div className="w-32">
              <label className="text-xs font-bold text-gray-400 block mb-1">학번 *</label>
              <input value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}
                placeholder="20261234" className={inputCls} />
            </div>
            <button onClick={handleAdd}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors">
              추가
            </button>
          </div>
        )}

        {/* 엑셀 업로드 */}
        {inputMode === 'excel' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              열 이름에 <b>영문명 / 한글명(이름) / 별명 / 학번</b>이 포함된 엑셀 파일 (.xlsx)
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="text-sm" />
            {preview.length > 0 && (
              <BulkPreviewTable rows={preview} onSubmit={() => handleBulkSubmit(preview)} onCancel={() => {
                setPreview([]); if (fileRef.current) fileRef.current.value = ''
              }} />
            )}
          </div>
        )}

        {/* 붙여넣기 */}
        {inputMode === 'paste' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              한 줄에 한 명씩: <b>영문명 [탭/쉼표] 한글명 [탭/쉼표] 별명 [탭/쉼표] 학번</b> (별명 생략 가능)
            </p>
            <textarea value={bulkText}
              onChange={e => { setBulkText(e.target.value); parseBulkText(e.target.value) }}
              placeholder={'JUNHO OH\t오준호\t준호\t20261234\nMINJI KIM\t김민지\t\t20261235'}
              className="w-full min-h-[100px] border border-gray-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-indigo-400" />
            {bulkPreview.length > 0 && (
              <BulkPreviewTable rows={bulkPreview} onSubmit={() => handleBulkSubmit(bulkPreview)} onCancel={() => {
                setBulkText(''); setBulkPreview([])
              }} />
            )}
          </div>
        )}
      </div>

      {/* 출석부 목록 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-gray-400">↕ 순서 버튼으로 출석부 순서를 고정할 수 있어요</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-semibold">정렬:</span>
            {([
              ['manual', '입력순'],
              ['nameKr', '가나다순'],
              ['nameEn', '영문순'],
              ['status', '미가입 먼저'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                  sortBy === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="px-2 py-2 font-semibold w-12">순서</th>
              <th className="px-3 py-2 font-semibold text-left">영문명</th>
              <th className="px-3 py-2 font-semibold text-left">한글명</th>
              <th className="px-3 py-2 font-semibold text-left">별명</th>
              <th className="px-3 py-2 font-semibold text-center">상태</th>
              <th className="px-3 py-2 font-semibold text-center w-28">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="p-5 text-center text-gray-400 animate-pulse">불러오는 중...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} className="p-5 text-center text-gray-400">등록된 학생이 없어요.</td></tr>
            ) : sorted.map((entry, idx) => (
              <RosterRow
                key={entry.id}
                entry={entry}
                idx={idx}
                total={sorted.length}
                isEditing={editId === entry.id}
                isManualSort={sortBy === 'manual'}
                onEdit={() => setEditId(entry.id)}
                onSave={async data => { await updateRosterEntry(entry.id, data); setEditId(null); await load() }}
                onCancel={() => setEditId(null)}
                onDelete={() => handleDelete(entry.id, entry.nameKr)}
                onMoveUp={() => moveEntry(idx, -1)}
                onMoveDown={() => moveEntry(idx, 1)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── 일괄 미리보기 테이블 ────────────────────────────────────────
function BulkPreviewTable({ rows, onSubmit, onCancel }: {
  rows:     PreviewRow[]
  onSubmit: () => void
  onCancel: () => void
}) {
  const validCount = rows.filter(r => !r.error).length
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-400">
            <th className="px-3 py-2 text-left font-semibold">영문명</th>
            <th className="px-3 py-2 text-left font-semibold">한글명</th>
            <th className="px-3 py-2 text-left font-semibold">별명</th>
            <th className="px-3 py-2 text-left font-semibold">학번</th>
            <th className="px-3 py-2 text-left font-semibold">확인</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <tr key={i} className={r.error ? 'bg-red-50' : ''}>
              <td className="px-3 py-1.5">{r.nameEn}</td>
              <td className="px-3 py-1.5">{r.nameKr}</td>
              <td className="px-3 py-1.5 text-gray-400">{r.nickname}</td>
              <td className="px-3 py-1.5 font-mono">{r.studentId}</td>
              <td className="px-3 py-1.5">
                {r.error
                  ? <span className="text-red-500 font-bold">{r.error}</span>
                  : <span className="text-green-600">✓</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-xs text-gray-500">등록 가능 {validCount}명 / 전체 {rows.length}명</span>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            취소
          </button>
          <button onClick={onSubmit} disabled={validCount === 0}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40">
            {validCount}명 등록
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 출석부 행 ───────────────────────────────────────────────────
function RosterRow({ entry, idx, total, isEditing, isManualSort, onEdit, onSave, onCancel, onDelete, onMoveUp, onMoveDown }: {
  entry:        RosterEntry
  idx:          number
  total:        number
  isEditing:    boolean
  isManualSort: boolean
  onEdit:       () => void
  onSave:       (data: Partial<RosterEntry>) => void
  onCancel:     () => void
  onDelete:     () => void
  onMoveUp:     () => void
  onMoveDown:   () => void
}) {
  const [edit, setEdit] = useState({
    nameEn:   entry.nameEn,
    nameKr:   entry.nameKr,
    nickname: entry.nickname ?? '',
    newId:    '',
  })

  const handleSave = async () => {
    const data: Partial<RosterEntry> = {
      nameEn:   edit.nameEn.trim().toUpperCase(),
      nameKr:   edit.nameKr.trim(),
      nickname: edit.nickname.trim() || edit.nameKr.trim(),
    }
    if (edit.newId.trim()) {
      data.studentIdHash = await hashStudentId(edit.newId.trim())
    }
    onSave(data)
  }

  const cellInput = 'w-full border border-indigo-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400'

  if (isEditing) {
    return (
      <tr className="bg-indigo-50/50">
        <td className="px-2 py-2 text-center text-xs text-gray-400">{idx + 1}</td>
        <td className="px-3 py-2"><input value={edit.nameEn} onChange={e => setEdit(s => ({ ...s, nameEn: e.target.value.toUpperCase() }))} className={cellInput} /></td>
        <td className="px-3 py-2"><input value={edit.nameKr} onChange={e => setEdit(s => ({ ...s, nameKr: e.target.value }))} className={cellInput} /></td>
        <td className="px-3 py-2"><input value={edit.nickname} onChange={e => setEdit(s => ({ ...s, nickname: e.target.value }))} className={cellInput} /></td>
        <td className="px-3 py-2">
          <input value={edit.newId} onChange={e => setEdit(s => ({ ...s, newId: e.target.value }))}
            placeholder="학번 재입력 시 변경" className={cellInput} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <button onClick={handleSave} className="text-xs font-bold text-indigo-600 hover:underline mr-2">저장</button>
          <button onClick={onCancel} className="text-xs text-gray-400 hover:underline">취소</button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50/50">
      <td className="px-2 py-3 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <button onClick={onMoveUp} disabled={!isManualSort || idx === 0}
            className="text-gray-300 hover:text-indigo-500 disabled:opacity-20 text-xs leading-none">▲</button>
          <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
          <button onClick={onMoveDown} disabled={!isManualSort || idx === total - 1}
            className="text-gray-300 hover:text-indigo-500 disabled:opacity-20 text-xs leading-none">▼</button>
        </div>
      </td>
      <td className="px-3 py-3 font-mono text-xs">{entry.nameEn}</td>
      <td className="px-3 py-3 font-medium">{entry.nameKr}</td>
      <td className="px-3 py-3 text-gray-400 text-xs">{entry.nickname}</td>
      <td className="px-3 py-3 text-center">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
          entry.status === 'registered'
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-400'
        }`}>
          {entry.status === 'registered' ? '가입완료' : '미가입'}
        </span>
      </td>
      <td className="px-3 py-3 text-center whitespace-nowrap">
        <button onClick={onEdit} className="text-xs font-bold text-indigo-500 hover:underline mr-2">수정</button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:underline">삭제</button>
      </td>
    </tr>
  )
}