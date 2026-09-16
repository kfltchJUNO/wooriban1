'use client'
// components/student/VocabularyVault.tsx
import React, { useState, useEffect } from 'react'
import { VaultItem } from '@/types/vault'
import { getVaultItemsByStudent, toggleVaultItemMastered, deleteVaultItem } from '@/lib/firestore/vault'

interface Props {
  studentUid: string
}

export default function VocabularyVault({ studentUid }: Props) {
  const [items, setItems] = useState<VaultItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | 'vocabulary' | 'grammar'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unmastered' | 'mastered'>('all')
  const [search, setSearch] = useState('')
  const [quizCardIdx, setQuizCardIdx] = useState<number | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)

  const loadVault = async () => {
    setLoading(true)
    const data = await getVaultItemsByStudent(studentUid)
    setItems(data)
    setLoading(false)
  }

  useEffect(() => {
    loadVault()
  }, [studentUid])

  const handleToggleMastered = async (item: VaultItem) => {
    const next = !item.mastered
    await toggleVaultItemMastered(item.id, next)
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, mastered: next } : it))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 표현을 단어장에서 삭제할까요?')) return
    await deleteVaultItem(id)
    setItems(prev => prev.filter(it => it.id !== id))
  }

  const filteredItems = items.filter(it => {
    // 단어/문법 필터 (기존 error_correction은 category에 따라 분류하거나 둘 다 노출)
    if (typeFilter === 'vocabulary') {
      const isVocab = it.type === 'vocabulary' || it.category?.includes('어휘') || it.category?.includes('단어')
      if (!isVocab) return false
    } else if (typeFilter === 'grammar') {
      const isGrammar = it.type === 'grammar' || (it.type !== 'vocabulary' && !it.category?.includes('어휘'))
      if (!isGrammar) return false
    }

    // 학습 상태 필터
    if (statusFilter === 'unmastered' && it.mastered) return false
    if (statusFilter === 'mastered' && !it.mastered) return false

    if (search.trim()) {
      const q = search.toLowerCase()
      const match = it.original.toLowerCase().includes(q) ||
        it.correction.toLowerCase().includes(q) ||
        (it.explanation && it.explanation.toLowerCase().includes(q)) ||
        (it.category && it.category.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })

  const masteredCount = items.filter(i => i.mastered).length
  const vocabCount = items.filter(i => i.type === 'vocabulary' || i.category?.includes('어휘') || i.category?.includes('단어')).length
  const grammarCount = items.filter(i => i.type === 'grammar' || (i.type !== 'vocabulary' && !i.category?.includes('어휘'))).length

  return (
    <div className="space-y-4">
      {/* 요약 헤더 카드 */}
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white rounded-2xl p-5 shadow-md flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">나만의 맞춤 학습장</span>
          <h2 className="text-lg font-bold mt-1">📖 오답 & 표현 단어장·문법노트</h2>
          <p className="text-xs text-purple-100 mt-0.5">내가 틀렸던 어휘와 문법을 분리하여 효과적으로 복습해보세요.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black">{items.length}개</div>
          <div className="text-[11px] text-purple-200">
            암기 완료: <strong className="text-white">{masteredCount}</strong>개 ({items.length ? Math.round(masteredCount / items.length * 100) : 0}%)
          </div>
        </div>
      </div>

      {/* 필터 및 검색 바 */}
      <div className="space-y-2 bg-white p-3 rounded-2xl border border-gray-100 shadow-xs">
        {/* 상위 탭: 단어 vs 문법 구분 */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100 flex-wrap">
          <div className="flex gap-1">
            {[
              ['all', `전체 (${items.length})`],
              ['vocabulary', `📚 단어장 (${vocabCount})`],
              ['grammar', `📝 문법노트 (${grammarCount})`],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key as any)}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                  typeFilter === key
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="단어/문법/오류 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-purple-400 w-36 sm:w-48"
            />
            {filteredItems.length > 0 && (
              <button
                onClick={() => {
                  setQuizCardIdx(0)
                  setShowAnswer(false)
                }}
                className="text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors whitespace-nowrap shadow-xs"
              >
                ⚡ 플래시카드 복습
              </button>
            )}
          </div>
        </div>

        {/* 하위 탭: 암기 여부 상태 */}
        <div className="flex gap-1 pt-0.5">
          {[
            ['all', '전체 상태'],
            ['unmastered', `학습 중 (${filteredItems.filter(i => !i.mastered).length})`],
            ['mastered', `암기 완료 (${filteredItems.filter(i => i.mastered).length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key as any)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-purple-100 text-purple-800 font-bold'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 플래시카드 퀴즈 모달 */}
      {quizCardIdx !== null && items[quizCardIdx] && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-[440px] shadow-2xl space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-400 font-bold border-b pb-2">
              <span>⚡ 플래시카드 ({quizCardIdx + 1}/{items.length})</span>
              <button onClick={() => setQuizCardIdx(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="min-h-[160px] bg-purple-50/60 border border-purple-100 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-[11px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                {items[quizCardIdx].category || '오답 표현'}
              </span>
              <div>
                <p className="text-xs text-gray-400 mb-1">틀렸던 표현</p>
                <p className="text-base font-bold text-red-500 line-through font-mono">
                  {items[quizCardIdx].original}
                </p>
              </div>

              {showAnswer ? (
                <div className="pt-2 border-t border-purple-100 w-full animate-fadeIn">
                  <p className="text-xs text-gray-400 mb-1">올바른 표현</p>
                  <p className="text-lg font-black text-green-700 font-mono">
                    {items[quizCardIdx].correction}
                  </p>
                  {items[quizCardIdx].explanation && (
                    <p className="text-xs text-gray-600 mt-2 bg-white/80 p-2 rounded-xl">
                      {items[quizCardIdx].explanation}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="text-xs text-purple-600 font-bold underline underline-offset-4 mt-2"
                >
                  정답 확인하기 👀
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                disabled={quizCardIdx === 0}
                onClick={() => {
                  setQuizCardIdx(quizCardIdx - 1)
                  setShowAnswer(false)
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 disabled:opacity-40"
              >
                ← 이전
              </button>
              <button
                onClick={() => {
                  handleToggleMastered(items[quizCardIdx])
                  if (quizCardIdx < items.length - 1) {
                    setQuizCardIdx(quizCardIdx + 1)
                    setShowAnswer(false)
                  } else {
                    setQuizCardIdx(null)
                  }
                }}
                className="flex-[2] py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
              >
                {items[quizCardIdx].mastered ? '복습 완료 해제' : '✓ 외웠어요! 다음'}
              </button>
              <button
                disabled={quizCardIdx === items.length - 1}
                onClick={() => {
                  setQuizCardIdx(quizCardIdx + 1)
                  setShowAnswer(false)
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 disabled:opacity-40"
              >
                다음 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 목록 리스트 */}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-xs">단어장을 불러오는 중...</div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 space-y-2">
          <div className="text-3xl">📖</div>
          <p className="text-sm font-bold text-gray-700">등록된 표현이 없어요.</p>
          <p className="text-xs text-gray-400">과제 피드백을 확인할 때 '+ 단어장' 버튼을 눌러 표현을 저장해보세요!</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map(it => (
            <div
              key={it.id}
              className={`bg-white rounded-2xl p-4 border transition-all flex items-start justify-between gap-3 shadow-2xs ${
                it.mastered ? 'border-gray-200 opacity-60 bg-gray-50/50' : 'border-purple-100'
              }`}
            >
              <div className="flex items-start gap-3 flex-1">
                <input
                  type="checkbox"
                  checked={!!it.mastered}
                  onChange={() => handleToggleMastered(it)}
                  className="w-4 h-4 mt-1 accent-purple-600 cursor-pointer flex-shrink-0"
                  title="암기 완료 체크"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      it.type === 'vocabulary' || it.category?.includes('어휘') || it.category?.includes('단어')
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {it.type === 'vocabulary' || it.category?.includes('어휘') || it.category?.includes('단어')
                        ? '📚 단어'
                        : '📝 문법'}
                    </span>
                    {it.category && (
                      <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                        {it.category}
                      </span>
                    )}
                    {it.mastered && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        ✓ 암기 완료
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap font-mono">
                    <span className="text-xs text-red-500 line-through">{it.original}</span>
                    <span className="text-xs text-gray-400">➔</span>
                    <span className="text-sm font-bold text-green-700">{it.correction}</span>
                  </div>
                  {it.explanation && (
                    <p className="text-xs text-gray-500 font-sans">{it.explanation}</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDelete(it.id)}
                className="text-gray-300 hover:text-red-400 text-xs px-2 py-1 transition-colors"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
