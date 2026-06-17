'use client'
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
  studentId: string
  nickname:  string
  error?:    string
}

export default function RosterManager({ schoolId: rawSchoolId, semester, classId }: Props) {
  const [roster,    setRoster]    = useState<RosterEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [toast,     setToast]     = useState('')
  const [inputMode, setInputMode] = useState<'single' | 'excel' | 'paste'>('single')
  const [schoolId,  setSchoolId]  = useState(rawSchoolId)  // 정규화된 schoolId

  // schools 컬렉션에서 실제 문서 ID로 정규화
  // appUser.schoolId("dankook")와 schools 문서 ID("dk")가 다를 수 있음
  useEffect(() => {
    getAllSchools().then(schools => {
      // 1. 직접 일치
      const direct = schools.find(s => s.id === rawSchoolId)
      if (direct) { setSchoolId(direct.id); return }
      // 2. name으로 매칭 (예: "단국대학교" 포함)
      const byName = schools.find(s =>
        s.name.includes(rawSchoolId) || rawSchoolId.includes(s.id)
      )
      if (byName) { setSchoolId(byName.id); return }
      // 3. code 소문자로 매칭 (dankook → dk 처럼 앞 2자 비교)
      const byCode = schools.find(s =>
        rawSchoolId.startsWith(s.id) || s.id === rawSchoolId.slice(0, 2)
      )
      if (byCode) setSchoolId(byCode.id)
    })
  }, [rawSchoolId])

  const [form, setForm] = useState({
    nameEn: '', nameKr: '', nickname: '', studentId: '',
  })

  const fileRef = useRef<HTMLInputElement>(null)
  const [preview,     setPreview]     = useState<PreviewRow[]>([])
  const [bulkText,    setBulkText]    = useState('')
  const [bulkPreview, setBulkPreview] = useState<PreviewRow[]>([])
  const [migrating,   setMigrating]   = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      // 정규화된 schoolId로 조회, 없으면 rawSchoolId로도 조회
      const data = await getRoster(schoolId, semester, classId)
      if (data.length === 0 && schoolId !== rawSchoolId) {
        const fallback = await getRoster(rawSchoolId, semester, classId)
        setRoster(fallback)
      } else {
        setRoster(data)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { if (schoolId) load() }, [schoolId, semester, classId])

  // ── 기존 데이터 마이그레이션 ─────────────────────────────────
  const handleMigrate = async () => {
    if (!confirm(`기존 출석부 데이터의 schoolId를 "${schoolId}"로 일괄 수정할까요?`)) return
    setMigrating(true)
    try {
      // rawSchoolId로 저장된 roster 문서 조회
      const q    = query(
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
      sortOrder:     roster.length,  // 현재 인원 수 = 다음 순서
      schoolId, semester, classId,
    })
    setForm({ nameEn: '', nameKr: '', nickname: '', studentId: '' })
    showToast('학생이 추가됐어요!')
    await load()
  }

  // ── 엑셀 파싱 ─────────────────────────────────────────────────
  const matchCol = (header: string, keywords: string[]) =>
    keywords.some(k => header.toLowerCase().includes(k.toLowerCase()))

  const parseExcel = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
        if (!rows.length) { showToast('데이터가 없어요.'); return }

        const headers      = Object.keys(rows[0])
        const colNameEn    = headers.find(h => matchCol(h, ['여권','영문명','passport','english','en']))
        const colNameKr    = headers.find(h => matchCol(h, ['한글','이름','korean','name','kr']) && !matchCol(h, ['영문','en']))
        const colStudentId = headers.find(h => matchCol(h, ['학번','번호','student','id','no']))
        const colNickname  = headers.find(h => matchCol(h, ['닉','부르','nick']))

        setPreview(rows.map(row => {
          const nameEn    = colNameEn    ? String(row[colNameEn]).trim().toUpperCase() : ''
          const nameKr    = colNameKr    ? String(row[colNameKr]).trim()               : ''
          const studentId = colStudentId ? String(row[colStudentId]).trim()            : ''
          const nickname  = colNickname  ? String(row[colNickname]).trim()             : nameKr
          const error = !nameEn ? '영문명 없음' : !nameKr ? '한글명 없음' : !studentId ? '학번 없음' : undefined
          return { nameEn, nameKr, studentId, nickname, error }
        }).filter(r => r.nameEn || r.nameKr || r.studentId))
      } catch { showToast('파일 읽기 실패') }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── 붙여넣기 파싱 ─────────────────────────────────────────────
  const parseBulk = (text: string): PreviewRow[] =>
    text.trim().split('\n').filter(l => l.trim()).map(line => {
      const p = line.trim().split(/\t/)
      const nameEn = (p[0] ?? '').toUpperCase().trim()
      const nameKr = (p[1] ?? '').trim()
      const studentId = (p[2] ?? '').trim()
      const nickname  = (p[3] ?? nameKr).trim()
      const error = !nameEn ? '영문명 없음' : !nameKr ? '한글명 없음' : !studentId ? '학번 없음' : undefined
      return { nameEn, nameKr, studentId, nickname, error }
    }).filter(r => r.nameEn || r.nameKr || r.studentId)

  // ── 일괄 등록 ─────────────────────────────────────────────────
  const handleBulkSubmit = async (rows: PreviewRow[]) => {
    const valid = rows.filter(r => !r.error)
    if (!valid.length) { showToast('등록 가능한 데이터가 없어요.'); return }
    const base = roster.length  // 기존 인원 수부터 순서 시작
    const entries = await Promise.all(valid.map(async (r, i) => ({
      nameEn:        r.nameEn,
      nameKr:        r.nameKr,
      nickname:      r.nickname || r.nameKr,
      studentIdHash: await hashStudentId(r.studentId),
      sortOrder:     base + i,  // 입력 순서 그대로
      schoolId, semester, classId,
    })))
    await addRosterBulk(entries)
    showToast(`${entries.length}명 등록됐어요!`)
    setPreview([]); setBulkPreview([]); setBulkText('')
    if (fileRef.current) fileRef.current.value = ''
    await load()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}"을 출석부에서 삭제할까요?`)) return
    await deleteRosterEntry(id)
    showToast('삭제됐어요.')
    await load()
  }

  // ── 순서 변경 ─────────────────────────────────────────────────
  const moveEntry = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= roster.length) return
    const a = roster[idx]
    const b = roster[next]
    await Promise.all([
      updateRosterEntry(a.id, { sortOrder: b.sortOrder ?? next }),
      updateRosterEntry(b.id, { sortOrder: a.sortOrder ?? idx }),
    ])
    await load()
  }

  const [sortBy, setSortBy] = useState<'manual' | 'nameKr' | 'nameEn' | 'status'>('manual')

  // ── 정렬 ─────────────────────────────────────────────────────
  const sorted = [...roster].sort((a, b) => {
    switch (sortBy) {
      case 'nameKr':
        return (a.nameKr ?? '').localeCompare(b.nameKr ?? '', 'ko')
      case 'nameEn':
        return (a.nameEn ?? '').localeCompare(b.nameEn ?? '')
      case 'status':
        // 미가입 먼저
        if (a.status !== b.status) return a.status === 'unregistered' ? -1 : 1
        return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
      case 'manual':
      default:
        // sortOrder 없는 항목은 createdAt 기준으로 뒤로
        const aOrder = a.sortOrder ?? 9999
        const bOrder = b.sortOrder ?? 9999
        return aOrder - bOrder
    }
  })

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
        {/* schoolId 불일치 시 마이그레이션 버튼 */}
        {schoolId !== rawSchoolId && (
          <button onClick={handleMigrate} disabled={migrating}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40">
            {migrating ? '수정 중...' : '⚠️ 데이터 수정 필요 (클릭)'}
          </button>
        )}
      </div>

      {/* schoolId 불일치 경고 */}
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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          ['single', '✏️ 직접 입력'],
          ['excel',  '📊 엑셀 업로드'],
          ['paste',  '📋 붙여넣기'],
        ] as const).map(([mode, label]) => (
          <button key={mode} onClick={() => setInputMode(mode)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              inputMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 직접 입력 */}
      {inputMode === 'single' && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
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
            className="w-full py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700">
            + 추가
          </button>
        </div>
      )}

      {/* 엑셀 업로드 */}
      {inputMode === 'excel' && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-700 space-y-2">
            <p className="font-bold">📊 엑셀 형식 안내</p>
            <div className="bg-white rounded-xl p-2 font-mono text-[11px] overflow-x-auto">
              <table className="w-full">
                <thead className="text-blue-600">
                  <tr>
                    {['여권영문명','한글명','학번','부르는이름'].map(h =>
                      <th key={h} className="px-2 py-1 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr>{['JUNHO OH','오준호','2024001','준호'].map((v,i) =>
                    <td key={i} className="px-2 py-0.5">{v}</td>)}</tr>
                  <tr>{['MINJU KIM','김민준','2024002',''].map((v,i) =>
                    <td key={i} className="px-2 py-0.5">{v}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-blue-500">열 이름은 한글/영문 자동 인식. 부르는이름은 선택.</p>
          </div>
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-indigo-300 rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm font-bold text-indigo-600">엑셀 파일 클릭하여 선택</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls 지원</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) parseExcel(f) }} />
          {preview.length > 0 && (
            <PreviewTable rows={preview}
              onSubmit={() => handleBulkSubmit(preview)}
              onClear={() => { setPreview([]); if (fileRef.current) fileRef.current.value = '' }} />
          )}
        </div>
      )}

      {/* 붙여넣기 */}
      {inputMode === 'paste' && (
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs text-gray-600">
            <p className="font-bold mb-1">📋 엑셀에서 복사 후 붙여넣기</p>
            <p className="font-mono bg-white px-2 py-1 rounded-lg text-[11px]">
              여권영문명 [탭] 한글명 [탭] 학번 [탭] 부르는이름(선택)
            </p>
          </div>
          <textarea value={bulkText}
            onChange={e => { setBulkText(e.target.value); setBulkPreview(parseBulk(e.target.value)) }}
            placeholder={"JUNHO OH\t오준호\t2024001\nMINJU KIM\t김민준\t2024002"}
            rows={5}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-indigo-400" />
          {bulkPreview.length > 0 && (
            <PreviewTable rows={bulkPreview}
              onSubmit={() => handleBulkSubmit(bulkPreview)}
              onClear={() => { setBulkText(''); setBulkPreview([]) }} />
          )}
        </div>
      )}

      {/* 출석부 목록 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-gray-400">↕ 순서 버튼으로 출석부 순서를 고정할 수 있어요</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-semibold">정렬:</span>
            {([
              ['manual',  '입력순'],
              ['nameKr',  '가나다순'],
              ['nameEn',  '영문순'],
              ['status',  '미가입 먼저'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                  sortBy === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-3 text-center text-xs font-semibold text-gray-400 w-16">순서</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">여권 영문명</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">한글명</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">부르는 이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">학번</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td></tr>
                ))
              ) : sorted.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  <p className="text-2xl mb-2">📋</p>
                  <p>출석부가 비어 있어요.</p>
                </td></tr>
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
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── 미리보기 테이블 ────────────────────────────────────────────────
function PreviewTable({ rows, onSubmit, onClear }: {
  rows: PreviewRow[]; onSubmit: () => void; onClear: () => void
}) {
  const valid   = rows.filter(r => !r.error)
  const invalid = rows.filter(r => r.error)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">
          미리보기 — {rows.length}명
          {invalid.length > 0 && <span className="ml-2 text-red-500">({invalid.length}명 오류)</span>}
        </p>
        <div className="flex gap-2">
          <button onClick={onClear}
            className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">초기화</button>
          {valid.length > 0 && (
            <button onClick={onSubmit}
              className="px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              {valid.length}명 등록
            </button>
          )}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {['여권 영문명','한글명','학번','부르는 이름','상태'].map(h =>
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr key={i} className={row.error ? 'bg-red-50' : ''}>
                <td className="px-3 py-2 font-mono">{row.nameEn || <span className="text-red-400">없음</span>}</td>
                <td className="px-3 py-2">{row.nameKr || <span className="text-red-400">없음</span>}</td>
                <td className="px-3 py-2 text-gray-500">{row.studentId || <span className="text-red-400">없음</span>}</td>
                <td className="px-3 py-2 text-gray-400">{row.nickname || row.nameKr}</td>
                <td className="px-3 py-2">
                  {row.error
                    ? <span className="text-red-500 font-bold">⚠ {row.error}</span>
                    : <span className="text-green-600 font-bold">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 출석부 행 ─────────────────────────────────────────────────────
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
  const [nameEn,    setNameEn]    = useState(entry.nameEn)
  const [nameKr,    setNameKr]    = useState(entry.nameKr)
  const [nickname,  setNickname]  = useState(entry.nickname)
  const [studentId, setStudentId] = useState('')  // 학번은 원본 없음, 새로 입력

  if (isEditing) {
    return (
      <tr className="bg-indigo-50">
        <td className="px-2 py-2 text-center text-xs text-gray-400">{idx + 1}</td>
        <td className="px-4 py-2">
          <input value={nameEn} onChange={e => setNameEn(e.target.value.toUpperCase())}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-xs focus:outline-none font-mono" />
        </td>
        <td className="px-4 py-2">
          <input value={nameKr} onChange={e => setNameKr(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
        </td>
        <td className="px-4 py-2">
          <input value={nickname} onChange={e => setNickname(e.target.value)}
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
        </td>
        <td className="px-4 py-2">
          <input value={studentId} onChange={e => setStudentId(e.target.value)}
            placeholder="새 학번 입력 (변경 시)"
            className="w-full border border-indigo-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
          <p className="text-[10px] text-gray-400 mt-0.5">비워두면 기존 학번 유지</p>
        </td>
        <td className="px-4 py-2 text-center"><StatusBadge status={entry.status} /></td>
        <td className="px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <button onClick={async () => {
              const data: Partial<RosterEntry> = { nameEn, nameKr, nickname }
              if (studentId.trim()) {
                data.studentIdHash = await hashStudentId(studentId.trim())
              }
              onSave(data)
            }} className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg">저장</button>
            <button onClick={onCancel}
              className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-lg">취소</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* 순서 버튼 */}
      <td className="px-2 py-3 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <button onClick={onMoveUp} disabled={!isManualSort || idx === 0}
            className="text-gray-300 hover:text-indigo-500 disabled:opacity-20 text-xs leading-none">▲</button>
          <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
          <button onClick={onMoveDown} disabled={!isManualSort || idx === total - 1}
            className="text-gray-300 hover:text-indigo-500 disabled:opacity-20 text-xs leading-none">▼</button>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-600">{entry.nameEn}</td>
      <td className="px-4 py-3 font-semibold text-gray-900">{entry.nameKr}</td>
      <td className="px-4 py-3 text-gray-600">
        {entry.nickname !== entry.nameKr
          ? <span className="text-indigo-600 font-medium">{entry.nickname}</span>
          : <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 font-mono">
        <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px]">해시 저장됨</span>
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