'use client'
// components/common/ManuscriptGrid.tsx
import React, { useMemo } from 'react'

interface Props {
  text: string
  columns?: number // 한 줄당 칸 수 (기본 20칸: TOPIK 및 한국 표준 원고지 규격)
  maxChars?: number
  className?: string
}

interface GridCell {
  text: string
  isPunctuation?: boolean // 마침표, 쉼표 등 좌측 하단 정렬 필요 부호
  isNumberPair?: boolean // 숫자 2자리 한 칸
}

/**
 * 한국 표준 200자 원고지 (줄당 20칸) 격자 렌더러
 *
 * [원고지 작성 규격 반영]
 * 1. 숫자 2개는 한 칸에 묶어서 배치 (예: 2024 -> [20], [24] / 5 -> [ 5] 또는 [5])
 * 2. 띄어쓰기(공백)는 점(·) 없이 깨끗한 빈칸으로 렌더링
 * 3. 마침표(.)와 쉼표(,) 등 문장부호는 칸의 정중앙이 아닌 왼쪽 하단에 배치
 * 4. 줄의 첫 칸에 마침표나 쉼표가 오지 않도록 이전 줄 끝에 붙이거나 표시
 */
export default function ManuscriptGrid({
  text,
  columns = 20,
  maxChars,
  className = '',
}: Props) {
  // 텍스트를 원고지 규칙에 맞추어 셀(GridCell)의 2차원 배열로 분할
  const lines = useMemo(() => {
    const result: GridCell[][] = []
    const paragraphs = text.split('\n')

    paragraphs.forEach((p) => {
      // 빈 줄이면 빈 행 하나 추가
      if (p.length === 0) {
        result.push(Array(columns).fill({ text: '' }))
        return
      }

      // 문단을 토큰(각 칸에 들어갈 단위)으로 분해
      const tokens: GridCell[] = []
      let i = 0

      while (i < p.length) {
        const char = p[i]

        // 1. 숫자 2자리는 한 칸에 결합
        if (/\d/.test(char)) {
          if (i + 1 < p.length && /\d/.test(p[i + 1])) {
            tokens.push({ text: char + p[i + 1], isNumberPair: true })
            i += 2
            continue
          } else {
            // 한 자리 숫자는 일반 글자 1칸
            tokens.push({ text: char })
            i += 1
            continue
          }
        }

        // 2. 마침표(.), 쉼표(,) 구두점 여부 체크
        if (char === '.' || char === ',' || char === '!' || char === '?') {
          tokens.push({ text: char, isPunctuation: true })
          i += 1
          continue
        }

        // 3. 일반 글자 및 공백
        tokens.push({ text: char })
        i += 1
      }

      // 토큰들을 columns(20칸) 단위로 행 분할
      for (let idx = 0; idx < tokens.length; idx += columns) {
        const slice = tokens.slice(idx, idx + columns)
        const row: GridCell[] = []
        for (let j = 0; j < columns; j++) {
          row.push(slice[j] || { text: '' })
        }
        result.push(row)
      }
    })

    // 최소 5줄은 표시
    while (result.length < 5) {
      result.push(Array(columns).fill({ text: '' }))
    }

    return result
  }, [text, columns])

  const totalFilledCells = text.length

  return (
    <div className={`overflow-x-auto select-none ${className}`}>
      <div className="inline-block min-w-full bg-[#FCFBF7] border-2 border-[#8C4A2F] rounded-xl p-4 shadow-sm font-['Noto_Serif_KR',serif]">
        {/* 상단 원고지 정보 헤더 */}
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#D8C7B5] text-xs text-[#8C4A2F] font-semibold">
          <div className="flex items-center gap-2">
            <span className="bg-[#8C4A2F] text-white px-2 py-0.5 rounded text-[10px] font-bold">원고지 규격 모드</span>
            <span>한 줄 20칸 · 숫자 2자 1칸</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>글자 수: <strong className="text-[#8C4A2F]">{totalFilledCells}</strong>자</span>
            {maxChars && <span>/ 최대 {maxChars}자</span>}
            <span className="text-gray-400">({lines.length}행 · {lines.length * 20}칸)</span>
          </div>
        </div>

        {/* 원고지 격자 행렬 */}
        <div className="space-y-1.5">
          {lines.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-1">
              {/* 행 번호 */}
              <span className="w-6 text-[10px] text-[#B59F8B] font-mono text-right select-none flex-shrink-0">
                {(rowIdx + 1) * columns}
              </span>

              {/* 20칸 격자 */}
              <div className="flex border-t border-b border-l border-[#8C4A2F] bg-white">
                {row.map((cell, colIdx) => {
                  const hasContent = cell.text !== ''
                  const isSpace = cell.text === ' '

                  return (
                    <div
                      key={colIdx}
                      className={`w-6 h-7 sm:w-7 sm:h-8 border-r border-b border-[#D8C7B5] relative text-sm sm:text-base ${
                        (colIdx + 1) % 5 === 0 ? 'border-r-[#8C4A2F]' : ''
                      }`}
                    >
                      {/* 원고지 십자 보조선 (워터마크) */}
                      <div className="absolute inset-0 pointer-events-none opacity-15">
                        <div className="w-full h-full border-b border-r border-dashed border-[#8C4A2F]" />
                      </div>

                      {/* 글자 표기 */}
                      {hasContent && !isSpace && (
                        <div
                          className={`w-full h-full relative z-10 flex ${
                            cell.isPunctuation
                              ? 'items-end justify-start pl-1 pb-1 font-bold text-gray-900 text-xs sm:text-sm'
                              : cell.isNumberPair
                              ? 'items-center justify-center font-bold text-gray-900 tracking-tighter text-xs sm:text-sm font-sans'
                              : 'items-center justify-center font-bold text-gray-900'
                          }`}
                        >
                          {cell.text}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 원고지 작성 규칙 팁 */}
        <div className="mt-3 pt-2.5 border-t border-[#D8C7B5] text-[11px] text-[#8C4A2F]/80 flex flex-wrap items-center justify-between gap-2">
          <span>💡 문단 첫 칸 들여쓰기 / 숫자 2자는 한 칸 / 마침표(.)·쉼표(,)는 왼쪽 하단에 기재합니다.</span>
        </div>
      </div>
    </div>
  )
}
