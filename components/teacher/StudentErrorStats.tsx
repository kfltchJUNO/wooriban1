'use client'
// components/teacher/StudentErrorStats.tsx
// 학생별 오류 통계 실시간 누적 뷰. 제출/AI 피드백마다 자동으로 쌓이는 데이터.
// ⚠️ 기존 'errorPatterns' 컬렉션(단원별 심층 분석 결과 캐시, ErrorPatternViewer가 사용)과는
//    완전히 다른 스키마라서 별도 컬렉션 'studentErrorStats'를 씀. 이름 헷갈리지 않도록 주의.
// 데이터 훅(useStudentErrorStats) + 요약뷰(ErrorSummaryView) + 상세뷰(ErrorDetailView)로 분리.

import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

export const ERROR_CATEGORIES = [
  '조사 오류', '시제 사용 오류', '어순 오류', '불규칙 활용 오류',
  '연결어미 오류', '높임법 오류', '어휘 선택 오류', '기타',
] as const

export interface ErrorPatternDoc {
  studentUid:         string
  classId:            string
  categoryCounts?:    Record<string, number>
  totalSubmissions?:  number
  totalErrorsTagged?: number
  lastSubmittedAt?:   { toDate: () => Date }
}

export interface StudentInfo {
  uid:      string
  nameKr:   string
  nickname: string
}

export const CATEGORY_COLOR: Record<string, string> = {
  '조사 오류':        'bg-rose-400',
  '시제 사용 오류':   'bg-orange-400',
  '어순 오류':        'bg-amber-400',
  '불규칙 활용 오류': 'bg-yellow-400',
  '연결어미 오류':    'bg-lime-400',
  '높임법 오류':      'bg-teal-400',
  '어휘 선택 오류':   'bg-sky-400',
  '기타':             'bg-gray-300',
}

// ── 데이터 훅 ─────────────────────────────────────────────────────
export function useStudentErrorStats(classId: string) {
  const [patterns, setPatterns] = useState<ErrorPatternDoc[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!classId) return
    setLoading(true)
    const q = query(collection(db, 'studentErrorStats'), where('classId', '==', classId))
    getDocs(q)
      .then(snap => setPatterns(snap.docs.map(d => d.data() as ErrorPatternDoc)))
      .finally(() => setLoading(false))
  }, [classId])

  const classTotal = useMemo(() => {
    const totals: Record<string, number> = {}
    let totalTagged = 0
    patterns.forEach(p => {
      Object.entries(p.categoryCounts ?? {}).forEach(([cat, count]) => {
        totals[cat] = (totals[cat] ?? 0) + count
        totalTagged += count
      })
    })
    return { totals, totalTagged }
  }, [patterns])

  const sortedCategories = ERROR_CATEGORIES
    .map(cat => ({ category: cat, count: classTotal.totals[cat] ?? 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)

  return { patterns, loading, classTotal, sortedCategories }
}

function nameOf(students: StudentInfo[], uid: string) {
  const s = students.find(s => s.uid === uid)
  return s?.nickname || s?.nameKr || '알 수 없음'
}

// 익명화 CSV 내보내기 (연구용) — 실명 대신 uid 앞 8자리만 사용
export function exportErrorPatternsCsv(patterns: ErrorPatternDoc[], classId: string) {
  const rows: string[] = ['익명ID,전체제출수,전체오류수,' + ERROR_CATEGORIES.join(',')]
  patterns.forEach(p => {
    const anonId = p.studentUid.slice(0, 8)
    const counts = ERROR_CATEGORIES.map(cat => p.categoryCounts?.[cat] ?? 0)
    rows.push([anonId, p.totalSubmissions ?? 0, p.totalErrorsTagged ?? 0, ...counts].join(','))
  })
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `error-patterns-${classId}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ══════════════════════════════════════════════════════════════════
// 요약 뷰 — 클릭 없이 바로 읽히는 카드 3~4개
// ══════════════════════════════════════════════════════════════════
export function ErrorSummaryView({
  patterns, sortedCategories, classTotal, students,
}: {
  patterns:         ErrorPatternDoc[]
  sortedCategories: { category: string; count: number }[]
  classTotal:       { totals: Record<string, number>; totalTagged: number }
  students:         StudentInfo[]
}) {
  const top3 = sortedCategories.slice(0, 3)

  const needsHelp = [...patterns]
    .sort((a, b) => (b.totalErrorsTagged ?? 0) - (a.totalErrorsTagged ?? 0))
    .slice(0, 3)
    .filter(p => (p.totalErrorsTagged ?? 0) > 0)

  if (patterns.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10 text-sm">
        아직 축적된 오류 데이터가 없어요.<br />
        학생들이 과제를 제출하고 AI 피드백을 받으면 여기 통계가 쌓여요.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 카드 1: 반이 가장 자주 틀리는 것 */}
      <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-indigo-400 mb-2">🔴 우리 반이 가장 자주 틀리는 문법</p>
        {top3.length === 0 ? (
          <p className="text-sm text-gray-400">아직 태깅된 오류가 없어요.</p>
        ) : (
          <div className="space-y-1.5">
            {top3.map((c, i) => (
              <div key={c.category} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 ${
                  i === 0 ? 'bg-rose-400' : i === 1 ? 'bg-orange-300' : 'bg-amber-200'
                }`}>{i + 1}</span>
                <span className="text-sm font-bold text-gray-800 flex-1">{c.category}</span>
                <span className="text-xs text-gray-400">{c.count}건</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 카드 2: 도움이 필요한 학생 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-gray-400 mb-2">⚠️ 오류가 많은 학생</p>
        {needsHelp.length === 0 ? (
          <p className="text-sm text-gray-400">모두 양호해요!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {needsHelp.map(p => (
              <span key={p.studentUid} className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
                {nameOf(students, p.studentUid)} · {p.totalErrorsTagged}건
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 카드 3: 전체 현황 + 다음 액션 제안 */}
      <div className="bg-gray-50 rounded-2xl p-4">
        <p className="text-xs text-gray-500">
          전체 <b className="text-gray-700">{classTotal.totalTagged}건</b> 오류 ·
          <b className="text-gray-700"> {patterns.length}명</b> 데이터 축적됨
        </p>
        {top3[0] && (
          <p className="text-xs text-indigo-500 mt-2">
            💡 <b>{top3[0].category}</b>로 쌤툴에서 복습 퀴즈를 만들어보는 건 어떨까요?
          </p>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// 상세 뷰 — 전체 그래프 + 학생별 펼침 + CSV 내보내기
// ══════════════════════════════════════════════════════════════════
export function ErrorDetailView({
  patterns, sortedCategories, classTotal, students, classId,
}: {
  patterns:         ErrorPatternDoc[]
  sortedCategories: { category: string; count: number }[]
  classTotal:       { totals: Record<string, number>; totalTagged: number }
  students:         StudentInfo[]
  classId:          string
}) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const maxCount = sortedCategories[0]?.count ?? 1

  if (patterns.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10 text-sm">
        아직 축적된 오류 데이터가 없어요.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 반 전체 그래프 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-base text-gray-800">카테고리별 전체 현황</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              전체 {classTotal.totalTagged}건 · {patterns.length}명 데이터
            </p>
          </div>
          <button onClick={() => exportErrorPatternsCsv(patterns, classId)}
            className="text-xs font-bold text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
            📊 익명 CSV 내보내기
          </button>
        </div>

        <div className="space-y-2">
          {sortedCategories.map(({ category, count }) => (
            <div key={category} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-600 w-28 flex-shrink-0">{category}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${CATEGORY_COLOR[category]}`}
                  style={{ width: `${(count / maxCount) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-gray-500 w-8 text-right flex-shrink-0">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 학생별 상세 */}
      <div>
        <h3 className="font-bold text-base text-gray-800 mb-3">학생별 오류 현황</h3>
        <div className="space-y-2">
          {patterns
            .sort((a, b) => (b.totalErrorsTagged ?? 0) - (a.totalErrorsTagged ?? 0))
            .map(p => {
              const isOpen = selectedUid === p.studentUid
              const topCategory = Object.entries(p.categoryCounts ?? {})
                .sort((a, b) => b[1] - a[1])[0]
              return (
                <div key={p.studentUid} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => setSelectedUid(isOpen ? null : p.studentUid)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                    <div>
                      <span className="font-bold text-sm text-gray-800">{nameOf(students, p.studentUid)}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        제출 {p.totalSubmissions ?? 0}회 · 오류 {p.totalErrorsTagged ?? 0}건
                      </span>
                    </div>
                    {topCategory && (
                      <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
                        {topCategory[0]} {topCategory[1]}회
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-4 py-3 border-t border-gray-50 space-y-1.5">
                      {Object.entries(p.categoryCounts ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, count]) => (
                          <div key={cat} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full ${CATEGORY_COLOR[cat] ?? 'bg-gray-300'}`} />
                            <span className="text-gray-600 flex-1">{cat}</span>
                            <span className="font-bold text-gray-500">{count}회</span>
                          </div>
                        ))}
                      {Object.keys(p.categoryCounts ?? {}).length === 0 && (
                        <p className="text-xs text-gray-300">아직 태깅된 오류가 없어요.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}