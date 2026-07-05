'use client'
// components/teacher/ErrorPatternViewer.tsx
// "📊 오류 분석" 버튼으로 열리는 모달. [요약] [상세] 두 탭으로 구성.

import { useState } from 'react'
import { useAuth } from '@/lib/auth/authContext'
import {
  useErrorPatterns, ErrorSummaryView, ErrorDetailView,
  type StudentInfo,
} from './ErrorAnalysisPanel'

interface Props {
  onClose:  () => void
  students: StudentInfo[]   // teacher/page.tsx의 students(AppUser[])를 그대로 넘겨도 됨 (uid/nameKr/nickname만 사용)
}

type Tab = 'summary' | 'detail'

export default function ErrorPatternViewer({ onClose, students }: Props) {
  const { appUser } = useAuth()
  const [tab, setTab] = useState<Tab>('summary')

  const classId = appUser?.classId ?? ''
  const { patterns, loading, classTotal, sortedCategories } = useErrorPatterns(classId)

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-lg">📊 오류 분석</h2>
            <p className="text-xs text-gray-400 mt-0.5">AI 피드백에서 자동으로 태깅된 오류를 집계했어요</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-indigo-50 mx-6 mt-4 p-1 rounded-xl w-fit">
          {([
            ['summary', '🔎 요약'],
            ['detail',  '📋 상세'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
                tab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm animate-pulse">오류 데이터 분석 중...</div>
          ) : tab === 'summary' ? (
            <ErrorSummaryView
              patterns={patterns}
              sortedCategories={sortedCategories}
              classTotal={classTotal}
              students={students}
            />
          ) : (
            <ErrorDetailView
              patterns={patterns}
              sortedCategories={sortedCategories}
              classTotal={classTotal}
              students={students}
              classId={classId}
            />
          )}
        </div>
      </div>
    </div>
  )
}