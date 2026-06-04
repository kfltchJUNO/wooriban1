// 📁 components/teacher/ErrorPatternViewer.tsx

'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { getTextbooksByClass, getUnits } from '@/lib/firestore/textbooks'
import { getErrorPattern } from '@/lib/firestore/quizzes'
import { Textbook, TextbookUnit } from '@/types/textbook'
import { ErrorPattern } from '@/types/quiz'

interface Props {
  onClose: () => void
}

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

export default function ErrorPatternViewer({ onClose }: Props) {
  const { appUser }           = useAuth()
  const [textbooks, setTextbooks] = useState<Textbook[]>([])
  const [units, setUnits]     = useState<TextbookUnit[]>([])
  const [selectedTb, setSelectedTb] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [pattern, setPattern] = useState<ErrorPattern | null>(null)
  const [phase, setPhase]     = useState<'config' | 'analyzing' | 'result'>('config')
  const [err, setErr]         = useState('')

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
      // 기존 분석 결과 확인
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
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setPattern({ id: '', classId: appUser.classId, unitId: selectedUnit, textbookId: selectedTb, patterns: data.patterns, analyzedAt: new Date() })
      setPhase('result')
    } catch (e: any) {
      setErr(e.message ?? '분석 실패. 제출물이 충분한지 확인해주세요.')
      setPhase('config')
    }
  }

  const handleReanalyze = async () => {
    setPhase('config')
    setPattern(null)
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[620px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-lg">📊 학생 오류 패턴 분석</h2>
            <p className="text-xs text-gray-400 mt-0.5">제출된 작문 피드백을 분석해 공통 오류를 찾아드려요</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {/* ── 설정 단계 ── */}
          {(phase === 'config') && (
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
                ℹ️ 해당 반 학생들의 작문 피드백을 분석해 자주 나타나는 오류 패턴과 수업 제안을 제공해드려요.
              </div>
              {err && <p className="text-red-500 text-sm">{err}</p>}
              <button onClick={handleAnalyze} disabled={!selectedTb || !selectedUnit}
                className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                분석 시작하기 🔍
              </button>
            </div>
          )}

          {/* ── 분석 중 ── */}
          {phase === 'analyzing' && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4 animate-bounce">🔍</div>
              <p className="font-bold text-indigo-600">학생 피드백을 분석하고 있어요...</p>
              <p className="text-sm text-gray-400 mt-2">제출물 수에 따라 30초~1분 소요될 수 있어요</p>
            </div>
          )}

          {/* ── 결과 ── */}
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
                    <span className="text-xs text-gray-400">{p.count}명에서 발견</span>
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
        </div>
      </div>
    </div>
  )
}