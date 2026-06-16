'use client'
// components/admin/TeacherCodeManager.tsx

import { useState, useEffect } from 'react'
import {
  generateTeacherCode, parseTeacherCode,
  saveTeacherCode, getAllTeacherCodes, type TeacherCodeInfo,
} from '@/lib/firestore/teacherCodes'

const SCHOOLS   = [{ code: 'DG', label: '동국대' }, { code: 'DK', label: '단국대' }]
const SEASONS   = [{ code: 'SP', label: '봄' }, { code: 'SU', label: '여름' }, { code: 'FA', label: '가을' }, { code: 'WI', label: '겨울' }]

export default function TeacherCodeManager() {
  const [codes,   setCodes]   = useState<TeacherCodeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState('')

  // 폼
  const [school,    setSchool]    = useState('DG')
  const [year,      setYear]      = useState('26')
  const [season,    setSeason]    = useState('SU')
  const [level,     setLevel]     = useState(2)
  const [classNum,  setClassNum]  = useState(1)
  const [busy,      setBusy]      = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = async () => {
    setLoading(true)
    setCodes(await getAllTeacherCodes())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // 미리보기: 3개 코드 생성
  const previewCodes = [1, 2, 3].map(no =>
    generateTeacherCode(school, year, season, level, classNum, no)
  )

  const handleGenerate = async () => {
    setBusy(true)
    try {
      let generated = 0
      for (let no = 1; no <= 3; no++) {
        const code = generateTeacherCode(school, year, season, level, classNum, no)
        const info = parseTeacherCode(code)
        if (!info) continue
        // 이미 있으면 스킵
        await saveTeacherCode(code, info).catch(() => {})
        generated++
      }
      showToast(`선생님 코드 ${generated}개 생성됐어요!`)
      await load()
    } catch (e) {
      showToast('생성 중 오류가 발생했어요.')
      console.error(e)
    } finally { setBusy(false) }
  }

  // 필터
  const [filter, setFilter] = useState<'all' | 'unused' | 'used'>('all')
  const filtered = codes.filter(c =>
    filter === 'all' ? true : filter === 'used' ? c.used : !c.used
  )

  return (
    <div className="space-y-5">
      {/* 코드 생성 폼 */}
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 space-y-4">
        <p className="font-bold text-indigo-800 text-sm">선생님 코드 생성</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">학교</label>
            <select value={school} onChange={e => setSchool(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {SCHOOLS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">연도 (2자리)</label>
            <input value={year} onChange={e => setYear(e.target.value.slice(-2))}
              placeholder="26"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">학기</label>
            <select value={season} onChange={e => setSeason(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {SEASONS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">급수</label>
            <select value={level} onChange={e => setLevel(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <optgroup label="초/중/고급">
                <option value={10}>초급</option>
                <option value={20}>중급</option>
                <option value={30}>고급</option>
              </optgroup>
              <optgroup label="1~6급">
                {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}급</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">반</label>
            <input type="number" min={1} max={99} value={classNum} onChange={e => setClassNum(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
        </div>

        {/* 미리보기 */}
        <div className="bg-white rounded-xl p-3 space-y-1">
          <p className="text-xs text-gray-400 font-semibold mb-2">생성될 코드 미리보기</p>
          {previewCodes.map((code, i) => {
            const info = parseTeacherCode(code)
            return (
              <div key={code} className="flex items-center gap-3">
                <span className="font-mono font-bold text-indigo-700 text-sm">{code}</span>
                <span className="text-xs text-gray-400">
                  {info ? `${info.schoolLabel} · ${info.semesterLabel} · ${info.classLabel} · 선생님${i + 1}` : ''}
                </span>
              </div>
            )
          })}
        </div>

        <button onClick={handleGenerate} disabled={busy}
          className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors">
          {busy ? '생성 중...' : '코드 3개 생성 (선생님 1~3번)'}
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
              <span className="text-xs text-gray-400 flex-1">
                {c.schoolLabel} · {c.semesterLabel} · {c.classLabel} · 선생님{c.teacherNo}번
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                c.used ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-700'
              }`}>
                {c.used ? '사용됨' : '미사용'}
              </span>
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