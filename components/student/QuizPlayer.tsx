// 📁 components/student/QuizPlayer.tsx

'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import { saveAttempt } from '@/lib/firestore/quizzes'
import { Quiz, QuizQuestion } from '@/types/quiz'

interface Props {
  quiz: Quiz
  onClose: () => void
  onComplete: (score: number, total: number) => void
}

// ── 정답 체크 헬퍼 ────────────────────────────────────────────────
function checkAnswer(q: QuizQuestion, myAnswer: string): boolean {
  if (q.choices && q.correctIndex !== undefined) {
    // 사지선다: 선택한 선택지 텍스트와 answer 비교 또는 index 비교
    const selectedIndex = q.choices.indexOf(myAnswer)
    return selectedIndex === q.correctIndex
  }
  // 주관식: 텍스트 비교
  return myAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase()
}

export default function QuizPlayer({ quiz, onClose, onComplete }: Props) {
  const { appUser } = useAuth()
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers,    setAnswers]     = useState<Record<string, string>>({})
  const [showResult, setShowResult]  = useState(false)
  const [score,      setScore]       = useState(0)
  const [checked,    setChecked]     = useState(false)

  const currentQ = quiz.questions[currentIdx]
  const total    = quiz.questions.length
  const myAnswer = answers[currentQ?.id] ?? ''
  const isMultipleChoice = !!(currentQ?.choices && currentQ.choices.length > 0)
  const isCorrect = currentQ ? checkAnswer(currentQ, myAnswer) : false

  const handleAnswer = (val: string) => {
    if (checked) return
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }))
  }

  const handleCheck = () => {
    if (!myAnswer) return
    setChecked(true)
  }

  const handleNext = () => {
    setChecked(false)
    if (currentIdx + 1 >= total) {
      submitQuiz()
    } else {
      setCurrentIdx(i => i + 1)
    }
  }

  const submitQuiz = async () => {
    if (!appUser) return
    const correctCount = quiz.questions.reduce((acc, q) => {
      const a = answers[q.id] ?? ''
      return checkAnswer(q, a) ? acc + 1 : acc
    }, 0)
    setScore(correctCount)
    setShowResult(true)
    await saveAttempt({
      quizId:         quiz.id,
      studentUid:     appUser.uid,
      classId:        appUser.classId,
      answers,
      score:          correctCount,
      totalQuestions: total,
    })
    onComplete(correctCount, total)
  }

  const PROGRESS = Math.round(((currentIdx + 1) / total) * 100)

  const TYPE_LABEL: Record<string, string> = {
    fill_blank:      '빈칸 채우기',
    grammar:         '문법 활용',
    idiom:           '관용어',
    ox:              'O/X',
    matching:        '매칭',
    multiple_choice: '사지선다',
  }

  if (showResult) {
    return (
      <QuizResult
        quiz={quiz}
        answers={answers}
        score={score}
        total={total}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* 헤더 */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-indigo-600">{currentIdx + 1} / {total}</span>
            <span className="text-sm font-bold text-gray-400 truncate max-w-[200px]">{quiz.title}</span>
            <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-500"
              style={{ width: `${PROGRESS}%` }}
            />
          </div>
        </div>

        {/* 문제 영역 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {TYPE_LABEL[currentQ.type] ?? currentQ.type}
            </span>
          </div>
          <p className="font-bold text-base leading-relaxed mb-6 whitespace-pre-line">{currentQ.question}</p>

          {/* ── 사지선다 ── */}
          {isMultipleChoice && (
            <div className="space-y-2.5">
              {currentQ.choices!.map((choice, ci) => {
                const isSelected  = myAnswer === choice
                const isAnswer    = ci === currentQ.correctIndex
                const showCorrect = checked && isAnswer
                const showWrong   = checked && isSelected && !isAnswer

                return (
                  <button
                    key={ci}
                    onClick={() => handleAnswer(choice)}
                    disabled={checked}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      showCorrect
                        ? 'border-green-400 bg-green-50 text-green-800'
                        : showWrong
                        ? 'border-red-400 bg-red-50 text-red-700 line-through'
                        : isSelected
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                        : 'border-gray-200 hover:border-indigo-300 text-gray-700'
                    }`}
                  >
                    <span>{choice}</span>
                    {showCorrect && <span className="ml-2 text-green-600 text-xs font-bold">✓ 정답</span>}
                    {showWrong  && <span className="ml-2 text-red-500 text-xs font-bold">✗</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── O/X ── */}
          {currentQ.type === 'ox' && !isMultipleChoice && (
            <div className="grid grid-cols-2 gap-4">
              {['O', 'X'].map(opt => (
                <button
                  key={opt}
                  onClick={() => handleAnswer(opt)}
                  disabled={checked}
                  className={`py-6 text-3xl font-black rounded-2xl border-2 transition-all
                    ${myAnswer === opt
                      ? checked
                        ? isCorrect
                          ? 'border-green-400 bg-green-50 text-green-600'
                          : 'border-red-400 bg-red-50 text-red-600'
                        : 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-indigo-300'
                    }
                    ${checked && opt === currentQ.answer ? 'border-green-400 bg-green-50' : ''}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* ── 주관식 (fill_blank / grammar / idiom) ── */}
          {!isMultipleChoice && currentQ.type !== 'ox' && (
            <div>
              <input
                className={`w-full border-2 rounded-xl px-4 py-3.5 text-base outline-none transition-colors
                  ${checked
                    ? isCorrect
                      ? 'border-green-400 bg-green-50'
                      : 'border-red-400 bg-red-50'
                    : 'border-gray-200 focus:border-indigo-500'
                  }`}
                placeholder="정답을 입력하세요"
                value={myAnswer}
                onChange={e => handleAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !checked && myAnswer && handleCheck()}
                disabled={checked}
                autoFocus
              />
              {quiz.purpose === 'review' && (currentQ as QuizQuestion & { hint?: string }).hint && !checked && (
                <details className="mt-2">
                  <summary className="text-xs text-indigo-600 cursor-pointer select-none font-bold">💡 힌트 보기</summary>
                  <p className="text-xs text-gray-600 mt-1 pl-2">{(currentQ as QuizQuestion & { hint?: string }).hint}</p>
                </details>
              )}
            </div>
          )}

          {/* 피드백 박스 */}
          {checked && (
            <div className={`mt-4 p-4 rounded-2xl border ${
              isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className={`font-bold text-base mb-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect
                  ? '✅ 정답!'
                  : `❌ 오답 — 정답: ${currentQ.choices ? currentQ.choices[currentQ.correctIndex ?? 0] : currentQ.answer}`}
              </div>
              <p className="text-sm text-gray-700">{currentQ.explanation}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-5 border-t border-gray-100">
          {!checked ? (
            <button
              onClick={isMultipleChoice ? handleCheck : handleCheck}
              disabled={!myAnswer}
              className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors"
            >
              {isMultipleChoice ? '선택 확인' : '확인'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
            >
              {currentIdx + 1 >= total ? '결과 보기 🎉' : '다음 문제 →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 결과 화면 ─────────────────────────────────────────────────────
function QuizResult({ quiz, answers, score, total, onClose }: {
  quiz:    Quiz
  answers: Record<string, string>
  score:   number
  total:   number
  onClose: () => void
}) {
  const pct   = Math.round((score / total) * 100)
  const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '👍' : pct >= 50 ? '📚' : '💪'
  const msg   = pct >= 90 ? '완벽해요! 이번 단원을 완전히 이해했군요.'
              : pct >= 70 ? '잘 했어요! 조금 더 복습하면 완벽해질 거예요.'
              : pct >= 50 ? '절반 이상 맞혔어요. 어휘·문법을 다시 확인해 보세요.'
              :             '아직 어렵군요. 교재를 다시 확인하고 재도전해 보세요!'

  const wrongQuestions = quiz.questions.filter(q => !checkAnswer(q, answers[q.id] ?? ''))

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-10 w-full max-w-[420px] text-center shadow-2xl">
        <div className="text-6xl mb-4">{emoji}</div>
        <div className="font-black text-6xl text-indigo-600 leading-none">{score}</div>
        <div className="text-gray-400 text-lg mb-2">/ {total}점</div>
        <div className="text-gray-600 text-sm leading-relaxed mb-6">{msg}</div>

        {/* 오답 목록 */}
        {wrongQuestions.length > 0 && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left max-h-[200px] overflow-y-auto">
            <div className="text-xs font-bold text-gray-400 mb-2">오답 복습</div>
            {wrongQuestions.map(q => (
              <div key={q.id} className="mb-2 pb-2 border-b border-gray-100 last:border-0">
                <p className="text-xs text-gray-600 line-clamp-2">{q.question}</p>
                <p className="text-xs font-bold text-green-600 mt-0.5">
                  정답: {q.choices ? q.choices[q.correctIndex ?? 0] : q.answer}
                </p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  )
}