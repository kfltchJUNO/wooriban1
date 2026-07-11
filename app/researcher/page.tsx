'use client'
// app/researcher/page.tsx
import { useState } from 'react'
import RoleGuard from '@/components/auth/RoleGuard'
import Header from '@/components/layout/Header'
import ResearchAssignmentCreator from '@/components/researcher/ResearchAssignmentCreator'
import ResearchSubmissionReview from '@/components/researcher/ResearchSubmissionReview'

type Tab = 'create' | 'review'

export default function ResearcherPage() {
  const [tab, setTab] = useState<Tab>('review')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <RoleGuard allowedRoles={['researcher', 'admin']}>
      <div className="min-h-screen bg-[#F5F5FF]">
        <Header />
        <main className="max-w-[680px] mx-auto px-5 py-8">
          <div className="mb-5">
            <h1 className="font-bold text-xl">🔬 연구자 대시보드</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              논증문 연구 과제를 만들고 참여자 제출물을 검토해요.
            </p>
          </div>

          <div className="flex gap-1 bg-purple-100 p-1 rounded-xl mb-5 w-fit">
            {([['review', '📋 제출물 확인'], ['create', '➕ 과제 만들기']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
                  tab === key ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-md">
            {tab === 'create' ? (
              <ResearchAssignmentCreator onCreated={() => { setRefreshKey(k => k + 1); setTab('review') }} />
            ) : (
              <ResearchSubmissionReview key={refreshKey} />
            )}
          </div>
        </main>
      </div>
    </RoleGuard>
  )
}