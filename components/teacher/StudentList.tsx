'use client'
import { useState } from 'react'
import { AppUser } from '@/types/user'
import { Submission, FreeWriting } from '@/types/assignment'

interface Props {
  students:     AppUser[]
  submissions:  Submission[]
  freeWritings: FreeWriting[]
  onReview:     (studentUid: string, submission: Submission) => void
  onReviewFreeWriting: (studentUid: string, freeWriting: FreeWriting) => void
}

const STATUS_CONFIG = {
  submitted:         { label: '검토 필요',   color: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-400' },
  pending_approval:  { label: '검토 필요',   color: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-400' },
  ai_processing:     { label: 'AI 분석 중',  color: 'bg-indigo-100 text-indigo-800',dot: 'bg-indigo-400' },
  ai_done:           { label: '검토 대기',   color: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-400' },
  teacher_reviewing: { label: '검토 중',     color: 'bg-blue-100 text-blue-800',    dot: 'bg-blue-400' },
  feedback_sent:     { label: '피드백 완료', color: 'bg-green-100 text-green-800',  dot: 'bg-green-400' },
  read:              { label: '확인 완료',   color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-300' },
  none:              { label: '미제출',      color: 'bg-red-100 text-red-700',      dot: 'bg-red-400' },
  unused:            { label: '반 미사용중', color: 'bg-gray-100 text-gray-400',    dot: 'bg-gray-300' },
}

export default function StudentList({ students, submissions, freeWritings, onReview, onReviewFreeWriting }: Props) {
  const [sort, setSort] = useState<'order'|'asc'|'desc'>('order')

  const sorted = [...students].sort((a, b) => {
    if (sort === 'order') return a.sortOrder - b.sortOrder
    if (sort === 'asc')   return a.nameKr.localeCompare(b.nameKr)
    return b.nameKr.localeCompare(a.nameKr)
  })

  const getLatestSub = (uid: string) =>
    submissions.filter(s => s.studentUid === uid)
               .sort((a, b) => (b.submittedAt?.getTime?.() ?? 0) - (a.submittedAt?.getTime?.() ?? 0))[0]

  // 학생별 미확인 자유작문 개수 (선생님이 검토 안 한 것들)
  const getPendingFreeWritings = (uid: string) =>
    freeWritings.filter(fw => fw.studentUid === uid &&
      ['pending_approval', 'ai_processing', 'ai_done'].includes(fw.status))
      .sort((a, b) => (b.submittedAt?.getTime?.() ?? 0) - (a.submittedAt?.getTime?.() ?? 0))

  return (
    <div className="bg-white rounded-[20px] p-6 shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-lg">👥 학생 현황</h2>
        <select value={sort} onChange={e => setSort(e.target.value as 'order'|'asc'|'desc')}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
          <option value="order">출석부 순</option>
          <option value="asc">이름 오름차순</option>
          <option value="desc">이름 내림차순</option>
        </select>
      </div>

      <div className="space-y-1">
        {sorted.map(student => {
          const sub = getLatestSub(student.uid)
          const pendingFW = getPendingFreeWritings(student.uid)
          const statusKey = (sub?.status ?? (student.status === 'active' ? 'none' : 'unused')) as keyof typeof STATUS_CONFIG
          const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.none

          return (
            <div key={student.uid} className="rounded-xl hover:bg-gray-50 transition-colors">
              <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => sub && onReview(student.uid, sub)}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {student.nameKr[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{student.nameKr}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                    {cfg.label}
                    {sub?.pasteAttempts ? <span className="text-red-400 ml-1">· 붙여넣기 {sub.pasteAttempts}회</span> : null}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
              </div>

              {/* 자유작문 — 검토 대기 중인 것들 */}
              {pendingFW.length > 0 && (
                <div className="pl-12 pb-2 space-y-1">
                  {pendingFW.map(fw => {
                    const fwCfg = STATUS_CONFIG[fw.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.none
                    return (
                      <button key={fw.id} onClick={() => onReviewFreeWriting(student.uid, fw)}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors">
                        <span className="text-xs">✍️</span>
                        <span className="text-xs text-purple-700 font-semibold flex-1 truncate">
                          자유작문 {fw.topic ? `· ${fw.topic}` : ''}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${fwCfg.color}`}>
                          {fwCfg.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}