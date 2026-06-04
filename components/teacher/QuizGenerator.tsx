// 📁 components/teacher/QuizGenerator.tsx

'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { getTextbooksByClass, getUnits } from '@/lib/firestore/textbooks'
import { createQuiz } from '@/lib/firestore/quizzes'
import { Textbook, TextbookUnit } from '@/types/textbook'
import { QuizPurpose, QuizQuestion } from '@/types/quiz'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function QuizGenerator({ onClose, onCreated }: Props) {
  const { appUser } = useAuth()
  const [textbooks, setTextbooks]   = useState<Textbook[]>([])
  const [units, setUnits]           = useState<TextbookUnit[]>([])
  const [selectedTb, setSelectedTb] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [purpose, setPurpose]       = useState<QuizPurpose>('review')
  const [counts, setCounts]         = useState({ vocab: 8, grammar: 6, idiom: 4, ox: 2 })
  const [phase, setPhase]           = useState<'config' | 'generating' | 'preview' | 'saving'>('config')
  const [questions, setQuestions]   = useState<QuizQuestion[]>([])
  const [quizTitle, setQuizTitle]   = useState('')
  const [err, setErr]               = useState('')

  useEffect(() => {
    if (!appUser) return
    getTextbooksByClass(appUser.schoolId, appUser.semester, appUser.classId).then(setTextbooks)
  }, [appUser])

  const handleSelectTextbook = async (tbId: string) => {
    setSelectedTb(tbId)
    setSelectedUnit('')
    if (tbId) {
      const u = await getUnits(tbId)
      setUnits(u)
    }
  }

  const totalQ = counts.vocab + counts.grammar + counts.idiom + counts.ox

  const handleGenerate = async () => {
    if (!selectedTb || !selectedUnit) { setErr('교재와 단원을 선택해주세요'); return }
    setErr('')
    setPhase('generating')
    try {
      const res = await fetch('/api/quiz/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ textbookId: selectedTb, unitId: selectedUnit, purpose, counts }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setQuestions(data.questions)
      const unit = units.find(u => u.id === selectedUnit)
      setQuizTitle(`${unit?.unitNumber}과 ${unit?.title ?? ''} ${purpose === 'review' ? '복습' : '시험'} 퀴즈`)
      setPhase('preview')
    } catch {
      setErr('퀴즈 생성에 실패했어요. 다시 시도해주세요.')
      setPhase('config')
    }
  }

  const handleSave = async (publish: boolean) => {
    if (!appUser || !selectedTb || !selectedUnit) return
    setPhase('saving')
    const unit = units.find(u => u.id === selectedUnit)!
    await createQuiz({
      textbookId:      selectedTb,
      unitId:          selectedUnit,
      unitTitle:       unit.title,
      title:           quizTitle,
      purpose,
      questions,
      assignedClasses: [{ schoolId: appUser.schoolId, semester: appUser.semester, classId: appUser.classId }],
      isPublished:     publish,
      createdBy:       appUser.uid,
    })
    onCreated()
  }

  const TYPE_LABEL: Record<string, string> = {
    fill_blank: '빈칸', grammar: '문법', idiom: '관용어', ox: 'O/X', matching: '매칭'
  }
  const CATEGORY_COLOR: Record<string, string> = {
    vocabulary:    'bg-indigo-100 text-indigo-700',
    grammar:       'bg-emerald-100 text-emerald-700',
    idiom:         'bg-amber-100 text-amber-700',
    comprehension: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-lg">🎯 퀴즈 생성</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {phase === 'config' ? '설정' : phase === 'generating' ? 'AI 생성 중...' : phase === 'preview' ? '미리보기 & 수정' : '저장 중...'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {/* ── 설정 단계 ── */}
          {phase === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">교재 선택</label>
                <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 appearance-none"
                  value={selectedTb} onChange={e => handleSelectTextbook(e.target.value)}>
                  <option value="">교재를 선택하세요</option>
                  {textbooks.map(tb => <option key={tb.id} value={tb.id}>{tb.title} ({tb.level})</option>)}
                </select>
                {textbooks.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ 배정된 교재가 없어요. 관리자에게 교재 배정을 요청해주세요.</p>
                )}
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

              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">용도</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['review', 'exam'] as const).map(p => (
                    <button key={p} onClick={() => setPurpose(p)}
                      className={`p-4 border-2 rounded-xl text-sm font-bold transition-all text-center ${purpose === p ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-indigo-300'}`}>
                      {p === 'review' ? '📚 복습용\n(힌트 있음)' : '📝 시험용\n(힌트 없음)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 mb-2 block">문항 수 설정 (총 {totalQ}문항)</label>
                <div className="grid grid-cols-2 gap-3">
                  {([['vocab','어휘 빈칸'],['grammar','문법 활용'],['idiom','관용어'],['ox','내용 이해 O/X']] as const).map(([k, label]) => (
                    <div key={k}>
                      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                      <input type="number" min="0" max="20"
                        className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
                        value={counts[k]}
                        onChange={e => setCounts({ ...counts, [k]: Math.max(0, +e.target.value) })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {err && <p className="text-red-500 text-sm">{err}</p>}

              <button onClick={handleGenerate} disabled={!selectedTb || !selectedUnit}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors">
                AI로 퀴즈 생성하기 🤖
              </button>
            </div>
          )}

          {/* ── 생성 중 ── */}
          {phase === 'generating' && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4 animate-bounce">🤖</div>
              <p className="font-bold text-indigo-600">퀴즈를 생성하고 있어요...</p>
              <p className="text-sm text-gray-400 mt-2">교재 내용을 분석해서 {totalQ}문항을 만들고 있어요</p>
            </div>
          )}

          {/* ── 미리보기 ── */}
          {phase === 'preview' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">퀴즈 제목</label>
                <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  value={quizTitle} onChange={e => setQuizTitle(e.target.value)}/>
              </div>

              <div className="space-y-3">
                {questions.map((q, i) => (
                  <div key={q.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-gray-400">Q{i + 1}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[q.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[q.type] ?? q.type}
                      </span>
                      <span className="text-xs text-gray-300 ml-auto">{q.difficulty}</span>
                    </div>
                    <p className="text-sm text-gray-800 mb-1 whitespace-pre-line">{q.question}</p>
                    <p className="text-xs font-bold text-green-600">정답: {q.answer}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{q.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 저장 중 ── */}
          {phase === 'saving' && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">💾</div>
              <p className="font-bold text-indigo-600 animate-pulse">저장 중...</p>
            </div>
          )}
        </div>

        {/* 푸터 버튼 */}
        {phase === 'preview' && (
          <div className="p-6 border-t border-gray-100 flex gap-3">
            <button onClick={() => setPhase('config')} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl text-sm">← 다시 생성</button>
            <button onClick={() => handleSave(false)} className="flex-1 border-2 border-indigo-200 text-indigo-600 font-bold py-3 rounded-xl text-sm hover:bg-indigo-50">임시 저장</button>
            <button onClick={() => handleSave(true)} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors">학생에게 배포 📤</button>
          </div>
        )}
      </div>
    </div>
  )
}