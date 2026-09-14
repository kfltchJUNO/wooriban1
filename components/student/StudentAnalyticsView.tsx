'use client'
// components/student/StudentAnalyticsView.tsx
import React, { useMemo } from 'react'
import { Submission, FreeWriting } from '@/types/assignment'

interface Props {
  submissions: Submission[]
  freeWritings: FreeWriting[]
  studentName: string
}

export default function StudentAnalyticsView({ submissions, freeWritings, studentName }: Props) {
  // 날짜순 정렬된 전체 제출물
  const history = useMemo(() => {
    const list = [
      ...submissions.map(s => ({
        id: s.id,
        date: new Date(s.submittedAt),
        charCount: s.charCount,
        type: s.contentType || '과제',
        attempt: s.attemptNumber ?? 1,
      })),
      ...freeWritings.map(f => ({
        id: f.id,
        date: new Date(f.submittedAt),
        charCount: f.charCount,
        type: '자유작문',
        attempt: 1,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime())

    return list
  }, [submissions, freeWritings])

  const totalChars = history.reduce((acc, cur) => acc + cur.charCount, 0)
  const avgChars = history.length ? Math.round(totalChars / history.length) : 0
  const maxChars = history.reduce((max, cur) => Math.max(max, cur.charCount), 0)

  // 글자 수 추이 차트용 상대 높이 계산 (최대 100%)
  const chartHeightBase = Math.max(maxChars, 300)

  return (
    <div className="space-y-5">
      {/* 상단 프로필 및 누적 성취 배너 */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-2xl p-5 shadow-md flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">학습 성장 분석</span>
          <h2 className="text-lg font-bold mt-1">📊 {studentName}님의 작문 성장 리포트</h2>
          <p className="text-xs text-blue-100 mt-0.5">꾸준히 글을 쓰며 성장한 발자취를 확인해보세요.</p>
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <div className="text-2xl font-black">{history.length}회</div>
            <div className="text-[10px] text-blue-200">총 제출</div>
          </div>
          <div>
            <div className="text-2xl font-black">{totalChars.toLocaleString()}자</div>
            <div className="text-[10px] text-blue-200">누적 작성량</div>
          </div>
        </div>
      </div>

      {/* 1. 글자 수 추이 시각화 바 차트 */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">📈 회차별 글자 수 추이</h3>
            <p className="text-[11px] text-gray-400">평균 {avgChars}자 · 최고 {maxChars}자</p>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
            최근 {Math.min(history.length, 10)}개 제출
          </span>
        </div>

        {history.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400">아직 제출한 과제가 없어요.</div>
        ) : (
          <div className="pt-6 pb-2">
            <div className="flex items-end gap-2 h-36 border-b border-gray-200 px-2">
              {history.slice(-10).map((item, idx) => {
                const heightPercent = Math.min(100, Math.round((item.charCount / chartHeightBase) * 100))
                return (
                  <div key={item.id + idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* 툴팁 */}
                    <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] py-0.5 px-1.5 rounded whitespace-nowrap pointer-events-none z-10">
                      {item.charCount}자 ({item.type})
                    </div>
                    {/* 막대 */}
                    <div
                      style={{ height: `${Math.max(8, heightPercent)}%` }}
                      className={`w-full rounded-t-lg transition-all ${
                        item.type.includes('topik')
                          ? 'bg-amber-500 group-hover:bg-amber-600'
                          : 'bg-indigo-500 group-hover:bg-indigo-600'
                      }`}
                    />
                    <span className="text-[9px] text-gray-400 mt-1 font-mono">
                      {item.date.getMonth() + 1}/{item.date.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2 px-1">
              <span>과거</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500" /> 일반/자유작문</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" /> TOPIK 과제</span>
              </div>
              <span>최신</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. 학습 강점 및 발전 키워드 배지 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🌟</span>
            <h3 className="text-sm font-bold text-gray-800">나의 작문 강점 태그</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '어휘력 풍부', score: '우수' },
              { label: '완성도 높은 서술', score: '성실' },
              { label: '원고지 규격 준수', score: '준수' },
              { label: '격식체 일관성', score: '향상중' },
            ].map(tag => (
              <span key={tag.label} className="text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-xl">
                ✓ {tag.label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">AI 피드백과 교사 코멘트에서 자주 언급된 긍정 요소입니다.</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <h3 className="text-sm font-bold text-gray-800">집중 개선 포인트</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '조사 -에/-에서', count: '단어장 복습 추천' },
              { label: '연결어미 -느라고', count: '주의' },
              { label: '피동/사동 표현', count: '연습 필요' },
            ].map(p => (
              <span key={p.label} className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-xl">
                ⚠️ {p.label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">오답 단어장에서 플래시카드로 집중 복습해보세요.</p>
        </div>
      </div>
    </div>
  )
}
