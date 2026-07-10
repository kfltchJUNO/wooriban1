// 📁 components/teacher/QuizGenerator.tsx
'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { auth } from '@/firebase/firebaseConfig'
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
  const [textbooks,    setTextbooks]    = useState<Textbook[]>([])
  const [units,        setUnits]        = useState<TextbookUnit[]>([])
  const [selectedTb,   setSelectedTb]   = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [purpose,      setPurpose]      = useState<QuizPurpose>('review')
  const [counts,       setCounts]       = useState({ vocab: 5, grammar: 3, idiom: 2, ox: 2 })
  const [phase,        setPhase]        = useState<'config' | 'generating' | 'preview' | 'saving'>('config')
  const [questions,    setQuestions]    = useState<QuizQuestion[]>([])
  const [quizTitle,    setQuizTitle]    = useState('')
  const [err,          setErr]          = useState('')

  useEffect(() => {
    if (!appUser) return
    getTextbooksByClass(appUser.schoolId, appUser.semester, appUser.classId).then(setTextbooks)
  }, [appUser])

  const handleSelectTextbook = async (tbId: string) => {
    setSelectedTb(tbId)
    setSelectedUnit('')
    if (tbId) setUnits(await getUnits(tbId))
  }

  const totalQ = counts.vocab + counts.grammar + counts.idiom + counts.ox

  const handleGenerate = async () => {
    if (!selectedTb || !selectedUnit) { setErr('교재와 단원을 선택해주세요'); return }
    setErr('')
    setPhase('generating')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { setErr('로그인이 필요해요. 다시 로그인해주세요.'); setPhase('config'); return }

      const res = await fetch('/api/quiz/generate', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body:    JSON.stringify({ textbookId: selectedTb, unitId: selectedUnit, purpose, counts }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '퀴즈 생성 실패')
      }
      const data = await res.json()
      setQuestions(data.questions)
      const unit = units.find(u => u.id === selectedUnit)
      setQuizTitle(`${unit?.unitNumber}과 ${unit?.title ?? ''} ${purpose === 'review' ? '복습' : '시험'} 퀴즈`)
      setPhase('preview')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '퀴즈 생성에 실패했어요. 다시 시도해주세요.')
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

  const CATEGORY_COLOR: Record<string, string> = {
    vocabulary:    'bg-indigo-100 text-indigo-700',
    grammar:       'bg-emerald-100 text-emerald-700',
    idiom:         'bg-amber-100 text-amber-700',
    comprehension: 'bg-purple-100 text-purple-700',
  }

  const CATEGORY_LABEL: Record<string, string> = {
    vocabulary: '어휘', grammar: '문법', idiom: '관용어', comprehension: '내용 이해',
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-lg">🎯 퀴즈 생성</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {phase === 'config'     ? '사지선다형 퀴즈 설정'
               : phase === 'generating' ? 'AI 생성 중...'
               : phase === 'preview'    ? `미리보기 · ${questions.length}문항`
               : '저장 중...'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {/* ── 설정 단계 ── */}
          {phase === 'config' && (
            <div className="space-y-4">
              {/* 교재 선택 */}
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">교재 선택</label>
                <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 appearance-none"
                  value={selectedTb} onChange={e => handleSelectTextbook(e.target.value)}>
                  <option value="">교재를 선택하세요</option>
                  {textbooks.map(tb => <option key={tb.id} value={tb.id}>{tb.title} ({tb.level})</option>)}
                </select>
                {textbooks.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ 배정된 교재가 없어요.</p>
                )}
              </div>

              {/* 단원 선택 */}
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

              {/* 용도 */}
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">용도</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['review', 'exam'] as const).map(p => (
                    <button key={p} onClick={() => setPurpose(p)}
                      className={`p-3 border-2 rounded-xl text-sm font-bold transition-all text-center ${
                        purpose === p ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-indigo-300'
                      }`}>
                      {p === 'review' ? '📘 복습용' : '📝 시험용'}
                      <p className="text-xs font-normal text-gray-400 mt-0.5">
                        {p === 'review' ? '힌트 포함' : '힌트 없음'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 문항 수 */}
              <div>
                <label className="text-xs font-bold text-gray-400 mb-2 block">
                  문항 수 설정 <span className="text-indigo-600 font-bold">총 {totalQ}문항 · 모두 사지선다</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['vocab',   '어휘'],
                    ['grammar', '문법'],
                    ['idiom',   '관용어'],
                    ['ox',      '내용 이해'],
                  ] as const).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                      <span className="text-sm text-gray-600 flex-1">{label}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCounts(p => ({ ...p, [k]: Math.max(0, p[k] - 1) }))}
                          className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold flex items-center justify-center">
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-bold">{counts[k]}</span>
                        <button onClick={() => setCounts(p => ({ ...p, [k]: Math.min(20, p[k] + 1) }))}
                          className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold flex items-center justify-center">
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {err && <p className="text-red-500 text-sm">{err}</p>}

              <button onClick={handleGenerate} disabled={!selectedTb || !selectedUnit}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors">
                AI로 퀴즈 생성하기 →
              </button>
            </div>
          )}

          {/* ── 생성 중 ── */}
          {phase === 'generating' && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4 animate-bounce">🎯</div>
              <p className="font-bold text-indigo-600">퀴즈를 생성하고 있어요...</p>
              <p className="text-sm text-gray-400 mt-2">사지선다 {totalQ}문항을 만들고 있어요</p>
            </div>
          )}

          {/* ── 미리보기 ── */}
          {phase === 'preview' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">퀴즈 제목</label>
                <input className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
                  value={quizTitle} onChange={e => setQuizTitle(e.target.value)} />
              </div>

              <div className="space-y-4">
                {questions.map((q, i) => (
                  <QuestionPreviewCard
                    key={q.id ?? i}
                    question={q}
                    index={i}
                    purpose={purpose}
                    canDelete={questions.length > 1}
                    categoryColor={CATEGORY_COLOR}
                    categoryLabel={CATEGORY_LABEL}
                    onUpdate={updated => setQuestions(prev => prev.map((p, pi) => pi === i ? updated : p))}
                    onDelete={() => setQuestions(prev => prev.filter((_, pi) => pi !== i))}
                  />
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

        {/* 푸터 */}
        {phase === 'preview' && (
          <div className="p-6 border-t border-gray-100 flex gap-3">
            <button onClick={() => setPhase('config')}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl text-sm hover:bg-gray-50">
              다시 생성
            </button>
            <button onClick={() => handleSave(false)}
              className="flex-1 border-2 border-indigo-200 text-indigo-600 font-bold py-3 rounded-xl text-sm hover:bg-indigo-50">
              임시 저장
            </button>
            <button onClick={() => handleSave(true)}
              className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors">
              학생에게 배포하기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 문항 미리보기 카드 — 수정/삭제 지원
// ══════════════════════════════════════════════════════════════════
function QuestionPreviewCard({
  question, index, purpose, canDelete, categoryColor, categoryLabel, onUpdate, onDelete,
}: {
  question:      QuizQuestion
  index:         number
  purpose:       QuizPurpose
  canDelete:     boolean
  categoryColor: Record<string, string>
  categoryLabel: Record<string, string>
  onUpdate:      (q: QuizQuestion) => void
  onDelete:      () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState<QuizQuestion>(question)

  const hasChoices = Array.isArray(question.choices) && question.choices.length > 0

  const startEdit = () => { setDraft(question); setEditing(true) }
  const cancelEdit = () => setEditing(false)
  const saveEdit = () => { onUpdate(draft); setEditing(false) }

  const updateChoice = (ci: number, value: string) => {
    if (!draft.choices) return
    const next = [...draft.choices]
    next[ci] = value
    setDraft({ ...draft, choices: next })
  }

  if (editing) {
    return (
      <div className="border-2 border-indigo-300 rounded-2xl p-4 space-y-3 bg-indigo-50/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full">Q{index + 1} 수정 중</span>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 block mb-1">문제</label>
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none"
            rows={2}
            value={draft.question}
            onChange={e => setDraft({ ...draft, question: e.target.value })}
          />
        </div>

        {hasChoices ? (
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">선택지 (정답 클릭해서 지정)</label>
            <div className="space-y-1.5">
              {draft.choices!.map((choice, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <button onClick={() => setDraft({ ...draft, correctIndex: ci })}
                    title="정답으로 지정"
                    className={`w-7 h-7 flex-shrink-0 rounded-full text-xs font-bold border-2 transition-colors ${
                      ci === draft.correctIndex
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 text-gray-400 hover:border-green-400'
                    }`}>
                    {ci === draft.correctIndex ? '✓' : ci + 1}
                  </button>
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                    value={choice}
                    onChange={e => updateChoice(ci, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">정답</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={draft.answer}
              onChange={e => setDraft({ ...draft, answer: e.target.value })}
            />
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-gray-400 block mb-1">해설</label>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500 resize-none"
            rows={2}
            value={draft.explanation ?? ''}
            onChange={e => setDraft({ ...draft, explanation: e.target.value })}
          />
        </div>

        {purpose === 'review' && (
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1">힌트</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
              value={draft.hint ?? ''}
              onChange={e => setDraft({ ...draft, hint: e.target.value })}
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={cancelEdit}
            className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-2 rounded-xl text-xs hover:bg-gray-50">
            취소
          </button>
          <button onClick={saveEdit}
            className="flex-[2] bg-indigo-600 text-white font-bold py-2 rounded-xl text-xs hover:bg-indigo-700 transition-colors">
            수정 완료
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Q{index + 1}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${categoryColor[question.category] ?? 'bg-gray-100 text-gray-600'}`}>
          {categoryLabel[question.category] ?? question.category}
        </span>
        <span className="text-xs text-gray-300">{question.difficulty}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={startEdit}
            className="text-xs font-bold text-indigo-500 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors">
            ✏️ 수정
          </button>
          {canDelete && (
            <button onClick={onDelete}
              className="text-xs font-bold text-red-400 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors">
              🗑
            </button>
          )}
        </div>
      </div>

      <p className="text-sm font-semibold text-gray-800 whitespace-pre-line">{question.question}</p>

      {hasChoices ? (
        <div className="space-y-1.5">
          {question.choices!.map((choice, ci) => (
            <div key={ci} className={`text-sm px-3 py-2 rounded-xl border ${
              ci === question.correctIndex
                ? 'border-green-300 bg-green-50 text-green-800 font-semibold'
                : 'border-gray-100 text-gray-600'
            }`}>
              {choice}
              {ci === question.correctIndex && <span className="ml-2 text-green-600 text-xs">✓ 정답</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
          정답: {question.answer}
        </p>
      )}

      {question.explanation && (
        <p className="text-xs text-gray-400 border-t border-gray-50 pt-2">{question.explanation}</p>
      )}

      {purpose === 'review' && question.hint && (
        <p className="text-xs text-indigo-400 bg-indigo-50 px-3 py-1.5 rounded-lg">💡 힌트: {question.hint}</p>
      )}
    </div>
  )
}