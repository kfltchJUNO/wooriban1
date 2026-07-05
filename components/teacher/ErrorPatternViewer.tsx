// 📁 components/teacher/ErrorPatternViewer.tsx

'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { getTextbooksByClass, getUnits } from '@/lib/firestore/textbooks'
import { getErrorPattern } from '@/lib/firestore/quizzes'
import { Textbook, TextbookUnit } from '@/types/textbook'
import { ErrorPattern } from '@/types/quiz'
import {
  useStudentErrorStats, ErrorSummaryView, type StudentInfo,
} from './StudentErrorStats'

interface Props {
  onClose:  () => void
  students: StudentInfo[]   // 실시간 요약 탭에서 이름 표시용 (teacher/page.tsx의 students 그대로 전달)
}

type MainTab = 'realtime' | 'unit'

const CATEGORY_COLOR: Record<string, string> = {
  '문법':  'border-indigo-200 bg-indigo-50',
  '어휘':  'border-emerald-200 bg-emerald-50',
  '관용어': 'border-amber-200 bg-amber-50',
}
const CATEGORY_BADGE: Record<string, string> = {
  '문법':  'bg-indigo-100 text-indigo-700',
  '어휘':  'bg-emerald-100 text-emerald-700',
  '관용어': 'bg-amber-100 text-amber-700',
}

export default function ErrorPatternViewer({ onClose, students }: Props) {
  const { appUser } = useAuth()
  const [mainTab, setMainTab] = useState<MainTab>('realtime')

  // ── 실시간 요약 탭 데이터 ─────────────────────────────────────
  const classId = appUser?.classId ?? ''
  const { patterns: statsPatterns, loading: statsLoading, classTotal, sortedCategories } =
    useStudentErrorStats(classId)

  // ── 단원별 심층 분석 탭 상태 (기존 기능) ──────────────────────
  const [textbooks, setTextbooks]       = useState<Textbook[]>([])
  const [units, setUnits]               = useState<TextbookUnit[]>([])
  const [selectedTb, setSelectedTb]     = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [pattern, setPattern]           = useState<ErrorPattern | null>(null)
  const [phase, setPhase]               = useState<'config' | 'analyzing' | 'result'>('config')
  const [err, setErr]                   = useState('')

  useEffect(() => {
    if (!appUser) return
    getTextbooksByClass(appUser.schoolId, appUser.semester, appUser.classId).then(setTextbooks)
  }, [appUser])

  const handleSelectTextbook = async (tbId: string) => {
    setSelectedTb(tbId)
    setSelectedUnit('')
    if (tbId) setUnits(await getUnits(tbId))
  }

  const handleAnalyze = async () => {
    if (!selectedTb || !selectedUnit || !appUser) { setErr('교재와 단원을 선택해주세요'); return }
    setErr('')
    setPhase('analyzing')
    try {
      // 기존 분석 결과 확인 (캐시)
      const existing = await getErrorPattern(appUser.classId, selectedUnit)
      if (existing) {
        setPattern(existing)
        setPhase('result')
        return
      }
      // 없으면 새로 분석
      const res = await fetch('/api/analysis/errors', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ classId: appUser.classId, unitId: selectedUnit, textbookId: selectedTb }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '분석 실패')
      }
      const data = await res.json()
      setPattern({
        id: '', classId: appUser.classId, unitId: selectedUnit, textbookId: selectedTb,
        patterns: data.patterns, analyzedAt: new Date(),
      })
      setPhase('result')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '분석 실패. 제출물이 충분한지 확인해주세요.'
      setErr(msg)
      setPhase('config')
    }
  }

  const handleReanalyze = async () => {
    setPhase('config')
    setPattern(null)
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-lg">📊 오류 분석</h2>
            <p className="text-xs text-gray-400 mt-0.5">학생 작문의 공통 오류를 확인해요</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        {/* 상위 탭: 실시간 요약 / 단원별 심층 분석 */}
        <div className="flex gap-1 bg-indigo-50 mx-6 mt-4 p-1 rounded-xl w-fit">
          {([
            ['realtime', '🔎 실시간 요약'],
            ['unit',     '📘 단원별 분석'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setMainTab(key)}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
                mainTab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {/* ══════════ 실시간 요약 탭 ══════════ */}
          {mainTab === 'realtime' && (
            statsLoading ? (
              <div className="text-center text-gray-400 py-10 text-sm animate-pulse">오류 데이터 분석 중...</div>
            ) : (
              <ErrorSummaryView
                patterns={statsPatterns}
                sortedCategories={sortedCategories}
                classTotal={classTotal}
                students={students}
              />
            )
          )}

          {/* ══════════ 단원별 심층 분석 탭 (기존 기능) ══════════ */}
          {mainTab === 'unit' && (
            <>
              {phase === 'config' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-400 mb-1.5 block">교재 선택</label>
                    <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 appearance-none"
                      value={selectedTb} onChange={e => handleSelectTextbook(e.target.value)}>
                      <option value="">교재를 선택하세요</option>
                      {textbooks.map(tb => <option key={tb.id} value={tb.id}>{tb.title} ({tb.level})</option>)}
                    </select>
                  </div>
                  {selectedTb && (
                    <div>
                      <label className="text-xs font-bold text-gray-400 mb-1.5 block">단원 선택</label>
                      <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 appearance-none"
                        value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)}>
                        <option value="">단원을 선택하세요</option>
                        {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber}과 {u.title}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="bg-indigo-50 rounded-xl p-4 text-xs text-indigo-700">
                    ℹ️ 해당 단원 학생들의 <b>선생님이 검토·전송한</b> 작문 피드백을 분석해 자주 나타나는
                    오류 패턴과 수업 제안을 제공해드려요. (검토 전 피드백은 분석 대상에서 제외돼요)
                  </div>
                  {err && <p className="text-red-500 text-sm">{err}</p>}
                  <button onClick={handleAnalyze} disabled={!selectedTb || !selectedUnit}
                    className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                    분석 시작하기 🔍
                  </button>
                </div>
              )}

              {phase === 'analyzing' && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4 animate-bounce">🔍</div>
                  <p className="font-bold text-indigo-600">학생 피드백을 분석하고 있어요...</p>
                  <p className="text-sm text-gray-400 mt-2">제출물 수에 따라 30초~1분 소요될 수 있어요</p>
                </div>
              )}

              {phase === 'result' && pattern && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 flex items-center gap-2">
                    <span>📅 분석 시점: {pattern.analyzedAt instanceof Date ? pattern.analyzedAt.toLocaleDateString('ko-KR') : '방금'}</span>
                    <button onClick={handleReanalyze} className="ml-auto text-indigo-600 font-bold hover:underline">재분석</button>
                  </div>

                  {pattern.patterns.map((p, i) => (
                    <div key={i} className={`border-2 rounded-2xl p-5 ${CATEGORY_COLOR[p.category] ?? 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CATEGORY_BADGE[p.category] ?? 'bg-gray-100 text-gray-600'}`}>
                          {p.category}
                        </span>
                        <span className="text-xs text-gray-400">{p.count}건 발견</span>
                      </div>
                      <p className="font-bold text-sm mb-2">{p.description}</p>

                      {p.examples.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-bold text-gray-400 mb-1">오류 예시 (익명)</div>
                          {p.examples.map((ex, j) => (
                            <div key={j} className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 mb-1">
                              ❌ {ex}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-white rounded-xl p-3 border border-gray-200">
                        <div className="text-xs font-bold text-gray-400 mb-1">💡 수업 제안</div>
                        <p className="text-sm text-gray-800">{p.suggestion}</p>
                      </div>
                    </div>
                  ))}

                  {pattern.patterns.length === 0 && (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      🎉 특별한 오류 패턴이 발견되지 않았어요!
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}