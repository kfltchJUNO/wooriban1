'use client'
// components/common/ManuscriptGrid.tsx
import React, { useMemo } from 'react'

interface Props {
  text: string
  columns?: number // 한 줄당 칸 수 (기본 20칸: TOPIK 및 한국 표준 원고지 규격)
  maxChars?: number
  className?: string
}

/**
 * 한국 표준 200자 원고지 (줄당 20칸) 격자 렌더러
 * - 실제 시험 원고지처럼 줄마다 20개의 격자 사각형을 렌더링
 * - 줄바꿈(\n)은 새 줄의 첫 칸으로 이동
 * - 글자 수와 원고지 칸 수의 차이(띄어쓰기, 줄바꿈 빈칸)를 시각적으로 보여줌
 */
export default function ManuscriptGrid({
  text,
  columns = 20,
  maxChars,
  className = '',
}: Props) {
  // 텍스트를 줄바꿈 및 20칸 기준으로 그리드 셀 2차원 배열로 분할
  const lines = useMemo(() => {
    const result: string[][] = []
    const paragraphs = text.split('\n')

    paragraphs.forEach((p) => {
      // 빈 줄이면 빈 행 하나 추가
      if (p.length === 0) {
        result.push(Array(columns).fill(''))
        return
      }

      // 문단을 columns(20)자 단위로 슬라이스
      for (let i = 0; i < p.length; i += columns) {
        const slice = p.slice(i, i + columns)
        const row: string[] = []
        for (let j = 0; j < columns; j++) {
          row.push(slice[j] || '')
        }
        result.push(row)
      }
    })

    // 최소 5줄은 표시
    while (result.length < 5) {
      result.push(Array(columns).fill(''))
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
            <span className="bg-[#8C4A2F] text-white px-2 py-0.5 rounded text-[10px] font-bold">원고지 모드</span>
            <span>한 줄 20칸 규격</span>
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
                {row.map((char, colIdx) => {
                  const isFilled = char !== ''
                  const isSpace = char === ' '
                  return (
                    <div
                      key={colIdx}
                      className={`w-6 h-7 sm:w-7 sm:h-8 border-r border-b border-[#D8C7B5] flex items-center justify-center relative text-sm sm:text-base ${
                        (colIdx + 1) % 5 === 0 ? 'border-r-[#8C4A2F]' : ''
                      }`}
                    >
                      {/* 원고지 십자 보조선 (워터마크) */}
                      <div className="absolute inset-0 pointer-events-none opacity-15">
                        <div className="w-full h-full border-b border-r border-dashed border-[#8C4A2F]" />
                      </div>

                      {/* 글자 표기 */}
                      {isFilled && (
                        <span className={`relative z-10 font-bold ${isSpace ? 'text-gray-200' : 'text-gray-900'}`}>
                          {isSpace ? '·' : char}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 원고지 작성 규칙 팁 */}
        <div className="mt-3 pt-2.5 border-t border-[#D8C7B5] text-[11px] text-[#8C4A2F]/80 flex items-center justify-between">
          <span>💡 문단의 시작은 첫 칸을 비우고 둘째 칸부터 씁니다. 문장부호(. , ? !)는 원고지 한 칸을 차지합니다.</span>
        </div>
      </div>
    </div>
  )
}
