'use client'
// components/admin/SchoolManager.tsx

import { useState, useEffect } from 'react'
import {
  getAllSchools, addSchool, updateSchool, deleteSchool,
  addSemester, removeSemester, addClass, removeClass,
  buildClassId, buildSemesterId, formatSemesterId, formatClassId,
  type SchoolData,
} from '@/lib/firestore/schools'

const SEASONS = [
  { value: 'spring', label: '봄' },
  { value: 'summer', label: '여름' },
  { value: 'fall',   label: '가을' },
  { value: 'winter', label: '겨울' },
]

const LEVEL_TYPES = [
  { value: 'beginner',     label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced',     label: '고급' },
]

const GRADES = [1, 2, 3, 4, 5, 6]  // 1~6급

export default function SchoolManager() {
  const [schools, setSchools] = useState<SchoolData[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState('')

  // 학교 추가 폼
  const [showAddSchool, setShowAddSchool] = useState(false)
  const [schoolForm, setSchoolForm] = useState({ name: '', code: '' })

  // 학기 추가
  const [semesterForms, setSemesterForms] = useState<Record<string, { year: string; season: string }>>({})

  // 반 추가
  const [classForms, setClassForms] = useState<Record<string, { level: string; grade: string; num: string }>>({})

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = async () => {
    setLoading(true)
    setSchools(await getAllSchools())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // ── 학교 추가 ─────────────────────────────────────────────────
  const handleAddSchool = async () => {
    if (!schoolForm.name.trim() || !schoolForm.code.trim()) {
      showToast('학교명과 코드를 입력해주세요.')
      return
    }
    try {
      await addSchool({ name: schoolForm.name.trim(), code: schoolForm.code.trim().toUpperCase(), semesters: [], classes: {} })
      setSchoolForm({ name: '', code: '' })
      setShowAddSchool(false)
      showToast('학교가 추가됐어요!')
      await load()
    } catch (e) { showToast('추가 중 오류가 발생했어요.') }
  }

  // ── 학교 삭제 ─────────────────────────────────────────────────
  const handleDeleteSchool = async (school: SchoolData) => {
    if (!confirm(`"${school.name}"을 삭제할까요?\n해당 학교의 모든 학기/반 정보가 삭제됩니다.`)) return
    await deleteSchool(school.id)
    showToast('삭제됐어요.')
    await load()
  }

  // ── 학기 추가 ─────────────────────────────────────────────────
  const handleAddSemester = async (schoolId: string) => {
    const form = semesterForms[schoolId] ?? { year: '26', season: 'summer' }
    const semId = buildSemesterId(form.year, form.season)
    await addSemester(schoolId, semId)
    showToast(`${formatSemesterId(semId)} 학기가 추가됐어요!`)
    await load()
  }

  // ── 반 추가 ───────────────────────────────────────────────────
  const handleAddClass = async (schoolId: string, semesterId: string) => {
    const key  = `${schoolId}-${semesterId}`
    const form = classForms[key] ?? { level: 'advanced', grade: '', num: '1' }
    // classId: "advanced-6" 또는 "grade2-3" (급수 있으면 grade{N}-{반번호})
    const levelPart = form.grade ? `grade${form.grade}` : form.level
    const classId   = buildClassId(levelPart, parseInt(form.num))
    await addClass(schoolId, semesterId, classId)
    showToast(`${formatClassId(classId)} 반이 추가됐어요!`)
    await load()
  }

  if (loading) return <div className="text-center text-gray-400 py-10 animate-pulse">불러오는 중...</div>

  return (
    <div className="space-y-6">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">학교/학기/반 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">기관 정보를 설정하면 가입/출석부에 자동 반영돼요</p>
        </div>
        <button onClick={() => setShowAddSchool(v => !v)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          + 학교 추가
        </button>
      </div>

      {/* 학교 추가 폼 */}
      {showAddSchool && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-indigo-800">새 학교/기관 추가</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 block mb-1">학교명</label>
              <input value={schoolForm.name} onChange={e => setSchoolForm(p => ({ ...p, name: e.target.value }))}
                placeholder="예: 단국대학교"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div className="w-28">
              <label className="text-xs font-semibold text-gray-500 block mb-1">코드 (2자리)</label>
              <input value={schoolForm.code} onChange={e => setSchoolForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="DK"
                maxLength={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <p className="text-xs text-gray-400">코드는 선생님 가입 코드에 사용돼요. (예: DK→단국대, DG→동국대)</p>
          <div className="flex gap-2">
            <button onClick={handleAddSchool}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700">
              추가
            </button>
            <button onClick={() => setShowAddSchool(false)}
              className="px-4 py-2 bg-gray-100 text-gray-500 text-sm font-semibold rounded-xl hover:bg-gray-200">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 학교 목록 없음 */}
      {schools.length === 0 && (
        <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-gray-100">
          <p className="text-3xl mb-2">🏫</p>
          <p className="text-sm">등록된 학교가 없어요. 학교를 추가해주세요.</p>
        </div>
      )}

      {/* 학교 카드 목록 */}
      {schools.map(school => (
        <div key={school.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* 학교 헤더 */}
          <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-lg font-black text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-lg font-mono">
                {school.code}
              </span>
              <div>
                <p className="font-bold text-gray-900">{school.name}</p>
                <p className="text-xs text-gray-400">{school.semesters.length}개 학기</p>
              </div>
            </div>
            <button onClick={() => handleDeleteSchool(school)}
              className="text-xs text-red-400 hover:text-red-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              삭제
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* 학기 추가 폼 */}
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">연도</label>
                <input
                  value={semesterForms[school.id]?.year ?? '26'}
                  onChange={e => setSemesterForms(p => ({ ...p, [school.id]: { ...p[school.id], year: e.target.value } }))}
                  placeholder="26"
                  maxLength={2}
                  className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">학기</label>
                <select
                  value={semesterForms[school.id]?.season ?? 'summer'}
                  onChange={e => setSemesterForms(p => ({ ...p, [school.id]: { ...p[school.id], season: e.target.value } }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                  {SEASONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <button onClick={() => handleAddSemester(school.id)}
                className="px-3 py-2 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-xl hover:bg-indigo-200 transition-colors whitespace-nowrap">
                + 학기 추가
              </button>
            </div>

            {/* 학기별 반 목록 */}
            {school.semesters.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">학기를 추가해주세요.</p>
            ) : (
              school.semesters.map(semId => {
                const classes   = school.classes[semId] ?? []
                const formKey   = `${school.id}-${semId}`
                const classForm = classForms[formKey] ?? { level: 'advanced', num: '1' }

                return (
                  <div key={semId} className="border border-gray-100 rounded-xl overflow-hidden">
                    {/* 학기 헤더 */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-600">📅 {formatSemesterId(semId)}</span>
                        <span className="text-xs text-gray-400">({semId})</span>
                        <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                          {classes.length}개 반
                        </span>
                      </div>
                      <button onClick={() => {
                        if (!confirm(`${formatSemesterId(semId)} 학기를 삭제할까요?`)) return
                        removeSemester(school.id, semId).then(() => { showToast('삭제됐어요.'); load() })
                      }} className="text-xs text-red-400 hover:text-red-600 font-semibold">
                        삭제
                      </button>
                    </div>

                    <div className="p-4 space-y-3">
                      {/* 반 목록 */}
                      <div className="flex flex-wrap gap-2">
                        {classes.map(classId => (
                          <div key={classId}
                            className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-semibold">
                            <span>{formatClassId(classId)}</span>
                            <span className="text-gray-400 text-[10px]">({classId})</span>
                            <button
                              onClick={() => {
                                if (!confirm(`${formatClassId(classId)} 반을 삭제할까요?`)) return
                                removeClass(school.id, semId, classId).then(() => { showToast('삭제됐어요.'); load() })
                              }}
                              className="text-red-400 hover:text-red-600 ml-1 text-sm leading-none">
                              ×
                            </button>
                          </div>
                        ))}
                        {classes.length === 0 && (
                          <p className="text-xs text-gray-400">반을 추가해주세요.</p>
                        )}
                      </div>

                      {/* 반 추가 폼 */}
                      <div className="space-y-2">
                        <div className="flex gap-2 items-end flex-wrap">
                          {/* 초/중/고급 선택 */}
                          <div>
                            <label className="text-xs font-semibold text-gray-400 block mb-1">구분</label>
                            <select
                              value={classForm.level}
                              onChange={e => setClassForms(p => ({
                                ...p, [formKey]: { ...p[formKey], level: e.target.value, grade: '' }
                              }))}
                              className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-400">
                              {LEVEL_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                            </select>
                          </div>

                          {/* 급수 선택 (선택사항) */}
                          <div>
                            <label className="text-xs font-semibold text-gray-400 block mb-1">급수 (선택)</label>
                            <select
                              value={classForm.grade ?? ''}
                              onChange={e => setClassForms(p => ({
                                ...p, [formKey]: { ...p[formKey], grade: e.target.value }
                              }))}
                              className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-400">
                              <option value="">급수 없음</option>
                              {GRADES.map(g => <option key={g} value={String(g)}>{g}급</option>)}
                            </select>
                          </div>

                          {/* 반 번호 */}
                          <div>
                            <label className="text-xs font-semibold text-gray-400 block mb-1">반 번호</label>
                            <input
                              type="number" min="1" max="99"
                              value={classForm.num}
                              onChange={e => setClassForms(p => ({
                                ...p, [formKey]: { ...p[formKey], num: e.target.value }
                              }))}
                              className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-xs text-center focus:outline-none focus:border-indigo-400" />
                          </div>

                          <button onClick={() => handleAddClass(school.id, semId)}
                            className="px-3 py-2 bg-green-100 text-green-700 text-xs font-bold rounded-xl hover:bg-green-200 transition-colors whitespace-nowrap">
                            + 반 추가
                          </button>
                        </div>

                        {/* 미리보기 */}
                        <p className="text-[11px] text-gray-400">
                          생성될 반 ID:{' '}
                          <span className="font-mono text-indigo-600">
                            {classForm.grade
                              ? `grade${classForm.grade}-${classForm.num}`
                              : `${classForm.level || 'advanced'}-${classForm.num}`}
                          </span>
                          {' '}→{' '}
                          <span className="font-semibold text-gray-600">
                            {classForm.grade
                              ? `${classForm.grade}급 ${classForm.num}반`
                              : `${LEVEL_TYPES.find(l => l.value === classForm.level)?.label ?? '고급'} ${classForm.num}반`}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ))}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E1B4B] text-white px-6 py-3 rounded-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}