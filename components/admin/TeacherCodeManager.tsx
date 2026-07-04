'use client'
// components/admin/TeacherCodeManager.tsx
// 학교/학기/반을 schools 컬렉션에서 동적 로드 + 인라인 생성
// → 선생님 코드의 classId가 항상 schools에 등록된 값과 일치 (불일치 원천 차단)

import { useState, useEffect } from 'react'
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import {
  buildTeacherCode, saveTeacherCode, getAllTeacherCodes,
  deleteTeacherCode, resetTeacherCode,
  SEASON_LABEL, SEASON_MAP,
  type TeacherCodeInfo,
} from '@/lib/firestore/teacherCodes'
import { getAllSchools, type SchoolData } from '@/lib/firestore/schools'
import { formatSemester, formatClassId } from '@/lib/utils/classUtils'

const LEVEL_OPTIONS = [
  { value: 10, label: '초급' },
  { value: 20, label: '중급' },
  { value: 30, label: '고급' },
  ...[1, 2, 3, 4, 5, 6].map(g => ({ value: g, label: `${g}급` })),
]

export default function TeacherCodeManager() {
  const [codes,   setCodes]   = useState<TeacherCodeInfo[]>([])
  const [schools, setSchools] = useState<SchoolData[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState('')
  const [busy,    setBusy]    = useState(false)

  // 선택 상태
  const [schoolId, setSchoolId] = useState('')
  const [semester, setSemester] = useState('')
  const [classId,  setClassId]  = useState('')

  // 인라인 생성 폼 토글
  const [showNewSchool,   setShowNewSchool]   = useState(false)
  const [showNewSemester, setShowNewSemester] = useState(false)
  const [showNewClass,    setShowNewClass]    = useState(false)

  // 새 학교 폼
  const [nsName, setNsName] = useState('')
  const [nsCode, setNsCode] = useState('')
  // 새 학기 폼
  const [nsemYear,   setNsemYear]   = useState('26')
  const [nsemSeason, setNsemSeason] = useState('SU')
  // 새 반 폼
  const [nclLevel, setNclLevel] = useState(30)
  const [nclNum,   setNclNum]   = useState(1)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const [codeList, schoolList] = await Promise.all([getAllTeacherCodes(), getAllSchools()])
      setCodes(codeList)
      setSchools(schoolList)
      // 초기 선택값
      if (!schoolId && schoolList.length > 0) {
        const s = schoolList[0]
        setSchoolId(s.id)
        const sems = s.semesters ?? []
        if (sems.length > 0) {
          setSemester(sems[0])
          setClassId((s.classes?.[sems[0]] ?? [])[0] ?? '')
        }
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const currentSchool  = schools.find(s => s.id === schoolId)
  const semesterList   = currentSchool?.semesters ?? []
  const classList      = currentSchool?.classes?.[semester] ?? []

  const handleSchoolChange = (id: string) => {
    setSchoolId(id)
    const s = schools.find(x => x.id === id)
    const sems = s?.semesters ?? []
    setSemester(sems[0] ?? '')
    setClassId((s?.classes?.[sems[0]] ?? [])[0] ?? '')
  }
  const handleSemesterChange = (sem: string) => {
    setSemester(sem)
    setClassId((currentSchool?.classes?.[sem] ?? [])[0] ?? '')
  }

  // ── 새 학교 생성 ─────────────────────────────────────────────
  const handleAddSchool = async () => {
    const name = nsName.trim()
    const code = nsCode.trim().toLowerCase()
    if (!name) { showToast('학교 이름을 입력해주세요.'); return }
    if (!/^[a-z]{2}$/.test(code)) { showToast('학교 코드는 영문 2자여야 해요. (예: dk)'); return }

    const ref  = doc(db, 'schools', code)
    const snap = await getDoc(ref)
    if (snap.exists()) { showToast(`코드 "${code.toUpperCase()}"는 이미 사용 중이에요.`); return }

    setBusy(true)
    try {
      await setDoc(ref, { name, semesters: [], classes: {} })
      showToast(`${name}(${code.toUpperCase()}) 학교가 생성됐어요!`)
      setNsName(''); setNsCode(''); setShowNewSchool(false)
      await load()
      setSchoolId(code)
      setSemester(''); setClassId('')
    } catch (e) {
      console.error(e); showToast('학교 생성 실패. 권한을 확인해주세요.')
    } finally { setBusy(false) }
  }

  // ── 새 학기 추가 ─────────────────────────────────────────────
  const handleAddSemester = async () => {
    if (!currentSchool) { showToast('학교를 먼저 선택해주세요.'); return }
    if (!/^\d{2}$/.test(nsemYear)) { showToast('연도는 숫자 2자리여야 해요. (예: 26)'); return }
    const semId = `${nsemYear}-${SEASON_MAP[nsemSeason]}`
    if (semesterList.includes(semId)) { showToast('이미 존재하는 학기예요.'); return }

    setBusy(true)
    try {
      await updateDoc(doc(db, 'schools', currentSchool.id), {
        semesters: arrayUnion(semId),
        [`classes.${semId}`]: [],
      })
      showToast(`${formatSemester(semId)} 학기가 추가됐어요!`)
      setShowNewSemester(false)
      await load()
      setSemester(semId); setClassId('')
    } catch (e) {
      console.error(e); showToast('학기 추가 실패.')
    } finally { setBusy(false) }
  }

  // ── 새 반 추가 ───────────────────────────────────────────────
  const handleAddClass = async () => {
    if (!currentSchool || !semester) { showToast('학교와 학기를 먼저 선택해주세요.'); return }
    if (nclNum < 1 || nclNum > 99) { showToast('반 번호는 1~99 사이여야 해요.'); return }
    const newClassId = `level${nclLevel}-${nclNum}`
    if (classList.includes(newClassId)) { showToast('이미 존재하는 반이에요.'); return }

    setBusy(true)
    try {
      await updateDoc(doc(db, 'schools', currentSchool.id), {
        [`classes.${semester}`]: arrayUnion(newClassId),
      })
      showToast(`${formatClassId(newClassId)}이 추가됐어요!`)
      setShowNewClass(false)
      await load()
      setClassId(newClassId)
    } catch (e) {
      console.error(e); showToast('반 추가 실패.')
    } finally { setBusy(false) }
  }

  // ── 코드 생성 미리보기 ────────────────────────────────────────
  const previewCodes = (schoolId && semester && classId)
    ? [1, 2, 3].map(no => buildTeacherCode(schoolId, semester, classId, no)).filter(Boolean) as string[]
    : []

  // ── 코드 생성 ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!currentSchool || !semester || !classId) {
      showToast('학교, 학기, 반을 모두 선택해주세요.'); return
    }
    setBusy(true)
    try {
      let created = 0, skipped = 0
      for (let no = 1; no <= 3; no++) {
        const code = buildTeacherCode(schoolId, semester, classId, no)
        if (!code) { showToast('코드 생성 불가: 형식을 확인해주세요.'); return }
        const result = await saveTeacherCode(code, {
          schoolId,
          schoolLabel:   currentSchool.name,
          semester,
          semesterLabel: formatSemester(semester),
          classId,                          // schools에 등록된 값 그대로 — 불일치 원천 차단
          classLabel:    formatClassId(classId),
          teacherNo:     no,
        })
        if (result === 'created') created++
        else skipped++
      }
      if (created > 0 && skipped > 0) showToast(`${created}개 생성, ${skipped}개는 이미 존재해요.`)
      else if (created > 0)           showToast(`선생님 코드 ${created}개 생성됐어요!`)
      else                            showToast('모두 이미 존재하는 코드예요.')
      await load()
    } catch (e) {
      console.error(e); showToast('생성 중 오류가 발생했어요.')
    } finally { setBusy(false) }
  }

  // ── 삭제 / 초기화 ─────────────────────────────────────────────
  const handleDelete = async (c: TeacherCodeInfo) => {
    const warning = c.used
      ? `"${c.code}"는 이미 사용된 코드예요.\n삭제해도 가입된 선생님 계정은 유지돼요.\n정말 삭제할까요?`
      : `"${c.code}" 코드를 삭제할까요?`
    if (!confirm(warning)) return
    try {
      await deleteTeacherCode(c.code)
      showToast('삭제됐어요.')
      await load()
    } catch { showToast('삭제 실패. 권한을 확인해주세요.') }
  }

  const handleReset = async (c: TeacherCodeInfo) => {
    if (!confirm(`"${c.code}"를 미사용 상태로 되돌릴까요?\n이 코드로 다시 가입할 수 있게 돼요.`)) return
    try {
      await resetTeacherCode(c.code)
      showToast('미사용 상태로 초기화됐어요.')
      await load()
    } catch { showToast('초기화 실패. 권한을 확인해주세요.') }
  }

  const [filter, setFilter] = useState<'all' | 'unused' | 'used'>('all')
  const filtered = codes
    .filter(c => filter === 'all' ? true : filter === 'used' ? c.used : !c.used)
    .sort((a, b) => a.code.localeCompare(b.code))

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400'
  const miniBtn  = 'text-[11px] font-bold text-indigo-500 hover:text-indigo-700 whitespace-nowrap'

  return (
    <div className="space-y-5">
      {/* 코드 생성 폼 */}
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 space-y-4">
        <p className="font-bold text-indigo-800 text-sm">선생님 코드 생성</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 학교 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-500">학교</label>
              <button onClick={() => setShowNewSchool(v => !v)} className={miniBtn}>+ 새 학교</button>
            </div>
            <select value={schoolId} onChange={e => handleSchoolChange(e.target.value)} className={inputCls}>
              {schools.length === 0 && <option value="">학교 없음</option>}
              {schools.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id.toUpperCase()})</option>)}
            </select>
          </div>
          {/* 학기 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-500">학기</label>
              <button onClick={() => setShowNewSemester(v => !v)} className={miniBtn}>+ 새 학기</button>
            </div>
            <select value={semester} onChange={e => handleSemesterChange(e.target.value)} className={inputCls}>
              {semesterList.length === 0 && <option value="">학기 없음</option>}
              {semesterList.map(s => <option key={s} value={s}>{formatSemester(s)}</option>)}
            </select>
          </div>
          {/* 반 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-500">반</label>
              <button onClick={() => setShowNewClass(v => !v)} className={miniBtn}>+ 새 반</button>
            </div>
            <select value={classId} onChange={e => setClassId(e.target.value)} className={inputCls}>
              {classList.length === 0 && <option value="">반 없음</option>}
              {classList.map(c => <option key={c} value={c}>{formatClassId(c)}</option>)}
            </select>
          </div>
        </div>

        {/* 인라인 생성 폼들 */}
        {showNewSchool && (
          <div className="bg-white rounded-xl p-3 flex flex-wrap items-end gap-2 border border-indigo-100">
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] font-bold text-gray-400 block mb-1">학교 이름</label>
              <input value={nsName} onChange={e => setNsName(e.target.value)} placeholder="예: 서울대학교" className={inputCls} />
            </div>
            <div className="w-24">
              <label className="text-[11px] font-bold text-gray-400 block mb-1">코드 (영문 2자)</label>
              <input value={nsCode} onChange={e => setNsCode(e.target.value.slice(0, 2))} placeholder="su" className={inputCls + ' font-mono uppercase'} />
            </div>
            <button onClick={handleAddSchool} disabled={busy}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40">
              학교 생성
            </button>
          </div>
        )}

        {showNewSemester && (
          <div className="bg-white rounded-xl p-3 flex flex-wrap items-end gap-2 border border-indigo-100">
            <div className="w-24">
              <label className="text-[11px] font-bold text-gray-400 block mb-1">연도 (2자리)</label>
              <input value={nsemYear} onChange={e => setNsemYear(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="26" className={inputCls} />
            </div>
            <div className="w-28">
              <label className="text-[11px] font-bold text-gray-400 block mb-1">학기</label>
              <select value={nsemSeason} onChange={e => setNsemSeason(e.target.value)} className={inputCls}>
                {Object.entries(SEASON_LABEL).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <button onClick={handleAddSemester} disabled={busy || !currentSchool}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40">
              학기 추가
            </button>
          </div>
        )}

        {showNewClass && (
          <div className="bg-white rounded-xl p-3 flex flex-wrap items-end gap-2 border border-indigo-100">
            <div className="w-28">
              <label className="text-[11px] font-bold text-gray-400 block mb-1">급수</label>
              <select value={nclLevel} onChange={e => setNclLevel(Number(e.target.value))} className={inputCls}>
                {LEVEL_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="text-[11px] font-bold text-gray-400 block mb-1">반 번호</label>
              <input type="number" min={1} max={99} value={nclNum}
                onChange={e => setNclNum(Math.min(99, Math.max(1, Number(e.target.value))))} className={inputCls} />
            </div>
            <button onClick={handleAddClass} disabled={busy || !semester}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40">
              반 추가
            </button>
          </div>
        )}

        {/* 미리보기 */}
        {previewCodes.length > 0 && (
          <div className="bg-white rounded-xl p-3 space-y-1">
            <p className="text-xs text-gray-400 font-semibold mb-2">생성될 코드 미리보기</p>
            {previewCodes.map((code, i) => {
              const exists = codes.some(c => c.code === code)
              return (
                <div key={code} className="flex items-center gap-3">
                  <span className={`font-mono font-bold text-sm ${exists ? 'text-gray-300 line-through' : 'text-indigo-700'}`}>
                    {code}
                  </span>
                  <span className="text-xs text-gray-400">
                    {currentSchool?.name} · {formatSemester(semester)} · {formatClassId(classId)} · 선생님{i + 1}번
                  </span>
                  {exists && <span className="text-[10px] font-bold text-amber-500">이미 존재 (건너뜀)</span>}
                </div>
              )
            })}
          </div>
        )}

        <button onClick={handleGenerate} disabled={busy || !schoolId || !semester || !classId}
          className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors">
          {busy ? '처리 중...' : '코드 3개 생성 (선생님 1~3번)'}
        </button>
      </div>

      {/* 코드 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-sm text-gray-800">발급된 코드 ({codes.length}개)</p>
          <div className="flex gap-1">
            {(['all', 'unused', 'used'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  filter === f ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100'
                }`}>
                {f === 'all' ? '전체' : f === 'unused' ? '미사용' : '사용됨'}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-5 text-center text-gray-400 text-sm animate-pulse">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-sm">코드가 없어요.</div>
          ) : filtered.map(c => (
            <div key={c.code} className="flex items-center gap-3 px-5 py-3">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.used ? 'bg-gray-300' : 'bg-green-400'}`} />
              <span className="font-mono font-bold text-sm text-indigo-700 w-32 flex-shrink-0">{c.code}</span>
              <span className="text-xs text-gray-400 flex-1 min-w-0 truncate">
                {c.schoolLabel} · {c.semesterLabel} · {c.classLabel} · 선생님{c.teacherNo}번
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                c.used ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-700'
              }`}>
                {c.used ? '사용됨' : '미사용'}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {c.used && (
                  <button onClick={() => handleReset(c)} title="미사용으로 초기화"
                    className="px-2 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                    초기화
                  </button>
                )}
                <button onClick={() => handleDelete(c)} title="코드 삭제"
                  className="px-2 py-1 text-[11px] font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  삭제
                </button>
              </div>
            </div>
          ))}
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