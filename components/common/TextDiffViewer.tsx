'use client'
// components/common/TextDiffViewer.tsx
import React, { useMemo } from 'react'

interface Props {
  oldText: string
  newText: string
  oldLabel?: string
  newLabel?: string
  className?: string
}

type DiffPart = {
  type: 'same' | 'added' | 'removed'
  value: string
}

/**
 * 한국어 어절(단어 및 조사 단위) 기반 간이 LCS Diff 알고리즘
 */
function computeWordDiff(oldStr: string, newStr: string): DiffPart[] {
  // 토큰화: 공백, 줄바꿈, 어절 단위 보존
  const tokenize = (s: string) => s.split(/(\s+)/).filter(Boolean)
  const a = tokenize(oldStr)
  const b = tokenize(newStr)

  const n = a.length
  const m = b.length

  // 메모리 절약을 위한 2D LCS 행렬
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // 역추적(Backtrack)하여 diff 결과 도출
  let i = n
  let j = m
  const rawParts: DiffPart[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rawParts.push({ type: 'same', value: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawParts.push({ type: 'added', value: b[j - 1] })
      j--
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawParts.push({ type: 'removed', value: a[i - 1] })
      i--
    }
  }

  rawParts.reverse()

  // 인접한 같은 타입 토큰 병합
  const merged: DiffPart[] = []
  rawParts.forEach(p => {
    if (merged.length > 0 && merged[merged.length - 1].type === p.type) {
      merged[merged.length - 1].value += p.value
    } else {
      merged.push({ ...p })
    }
  })

  return merged
}

export default function TextDiffViewer({
  oldText,
  newText,
  oldLabel = '1차 제출',
  newLabel = '2차 제출(현재)',
  className = '',
}: Props) {
  const diffParts = useMemo(() => computeWordDiff(oldText, newText), [oldText, newText])

  const addedCount = diffParts.filter(p => p.type === 'added').length
  const removedCount = diffParts.filter(p => p.type === 'removed').length

  return (
    <div className={`border-2 border-indigo-100 bg-white rounded-2xl p-4 shadow-sm space-y-3 ${className}`}>
      <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-indigo-700">🔍 리라이팅 수정 사항 (Diff 비교)</span>
          <span className="text-gray-400">({oldLabel} ➔ {newLabel})</span>
        </div>
        <div className="flex items-center gap-2 font-medium text-[11px]">
          <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <strong className="font-bold">+{addedCount}</strong> 추가/개선
          </span>
          <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <strong className="font-bold">-{removedCount}</strong> 삭제/수정
          </span>
        </div>
      </div>

      {/* Diff 본문 하이라이트 */}
      <div className="text-sm leading-relaxed p-3.5 bg-gray-50/70 rounded-xl font-['Noto_Sans_KR'] whitespace-pre-wrap max-h-[220px] overflow-y-auto">
        {diffParts.map((part, idx) => {
          if (part.type === 'same') {
            return <span key={idx} className="text-gray-700">{part.value}</span>
          }
          if (part.type === 'added') {
            return (
              <span
                key={idx}
                className="bg-green-100 text-green-800 font-bold px-1 py-0.5 rounded mx-0.5 underline decoration-green-500 underline-offset-2"
                title="2차 제출에서 새로 추가되거나 개선된 부분"
              >
                {part.value}
              </span>
            )
          }
          if (part.type === 'removed') {
            return (
              <span
                key={idx}
                className="bg-red-100 text-red-700 line-through opacity-80 px-1 py-0.5 rounded mx-0.5"
                title="1차 제출에서 삭제되거나 변경된 부분"
              >
                {part.value}
              </span>
            )
          }
          return null
        })}
      </div>

      <div className="text-[11px] text-gray-400 flex items-center justify-between pt-1">
        <span>초록색 하이라이트는 <strong className="text-green-700 font-semibold">새로 수정/보완된 어휘·문장</strong>이며, 빨간색 취소선은 <strong className="text-red-600 font-semibold">수정 전 원문</strong>입니다.</span>
      </div>
    </div>
  )
}
