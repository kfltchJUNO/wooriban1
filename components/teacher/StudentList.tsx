'use client'
import { useState } from 'react'
import { AppUser } from '@/types/user'
import { Submission, FreeWriting, Assignment } from '@/types/assignment'

interface Props {
  students:     AppUser[]
  assignments:  Assignment[]
  submissions:  Submission[]
  freeWritings: FreeWriting[]
  onReview:     (studentUid: string, submission: Submission) => void
  onReviewFreeWriting: (studentUid: string, freeWriting: FreeWriting) => void
  onlyPending?:    boolean          // true면 검토 필요한 학생만 표시
  onClearFilter?:  () => void       // 필터 해제 콜백
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

export default function StudentList({
  students, assignments, submissions, freeWritings, onReview, onReviewFreeWriting,
  onlyPending, onClearFilter,
}: Props) {
  const [sort, setSort] = useState<'order'|'asc'|'desc'>('order')
  const [expandedUid, setExpandedUid] = useState<string | null>(null)

  const sorted = [...students].sort((a, b) => {
    if (sort === 'order') return a.sortOrder - b.sortOrder
    if (sort === 'asc')   return a.nameKr.localeCompare(b.nameKr)
    return b.nameKr.localeCompare(a.nameKr)
  })

  // 학생의 과제별 제출(모든 시도) 그룹핑
  const getAssignmentSubs = (uid: string) => {
    const mine = submissions.filter(s => s.studentUid === uid)
    return assignments
      .map(a => ({
        assignment: a,
        attempts: mine
          .filter(s => s.assignmentId === a.id)
          .sort((x, y) => (y.submittedAt?.getTime?.() ?? 0) - (x.submittedAt?.getTime?.() ?? 0)),
      }))
      .filter(g => g.attempts.length > 0)
  }

  const getPendingFreeWritings = (uid: string) =>
    freeWritings.filter(fw => fw.studentUid === uid &&
      ['pending_approval', 'ai_processing', 'ai_done'].includes(fw.status))
      .sort((a, b) => (b.submittedAt?.getTime?.() ?? 0) - (a.submittedAt?.getTime?.() ?? 0))

  // 요약 배지용: 학생의 대표 상태(가장 최근 활동 기준)
  const getSummary = (uid: string) => {
    const groups = getAssignmentSubs(uid)
    const allAttempts = groups.flatMap(g => g.attempts)
    const pendingCount = allAttempts.filter(s => s.status === 'ai_done' || s.status === 'submitted').length
      + getPendingFreeWritings(uid).filter(f => f.status === 'ai_done').length
    const latest = allAttempts[0]
    return { pendingCount, latest }
  }

  // onlyPending 필터 시: 검토 필요 항목이 있는 학생만, 전부 자동 펼침
  const visibleStudents = onlyPending
    ? sorted.filter(s => getSummary(s.uid).pendingCount > 0)
    : sorted

  const isExpanded = (uid: string) => onlyPending ? true : expandedUid === uid
  const toggleExpand = (uid: string) => {
    if (onlyPending) return   // 필터 모드에선 전부 펼쳐진 상태 유지
    setExpandedUid(expandedUid === uid ? null : uid)
  }

  return (
    <div className="bg-white rounded-[20px] p-6 shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-lg">
          👥 학생 현황
          {onlyPending && <span className="ml-2 text-sm font-normal text-amber-500">· 검토 필요만 보기</span>}
        </h2>
        <div className="flex items-center gap-2">
          {onlyPending && (
            <button onClick={onClearFilter}
              className="text-xs font-bold text-gray-400 hover:text-gray-600 underline underline-offset-2">
              전체 보기
            </button>
          )}
          <select value={sort} onChange={e => setSort(e.target.value as 'order'|'asc'|'desc')}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
            <option value="order">출석부 순</option>
            <option value="asc">이름 오름차순</option>
            <option value="desc">이름 내림차순</option>
          </select>
        </div>
      </div>

      {onlyPending && visibleStudents.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-8">
          🎉 검토할 항목이 모두 처리됐어요!
        </div>
      )}

      <div className="space-y-1">
        {visibleStudents.map(student => {
          const groups = getAssignmentSubs(student.uid)
          const pendingFW = getPendingFreeWritings(student.uid)
          const { pendingCount, latest } = getSummary(student.uid)
          const expanded = isExpanded(student.uid)
          const statusKey = (latest?.status ?? (student.status === 'active' ? 'none' : 'unused')) as keyof typeof STATUS_CONFIG
          const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.none

          return (
            <div key={student.uid} className="rounded-xl hover:bg-gray-50 transition-colors">
              <button
                className="w-full flex items-center gap-3 p-3 text-left"
                onClick={() => toggleExpand(student.uid)}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {student.nameKr[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{student.nameKr}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                    {groups.length}개 과제 제출{pendingFW.length > 0 && ` · 자유작문 ${pendingFW.length}건`}
                  </div>
                </div>
                {pendingCount > 0 && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                    검토 필요 {pendingCount}
                  </span>
                )}
                <span className="text-gray-300 text-xs">{expanded ? '접기 ▲' : '펼치기 ▼'}</span>
              </button>

              {expanded && (
                <div className="pl-12 pb-3 space-y-2">
                  {/* 과제별 — 모든 시도 표시 */}
                  {groups.length === 0 && pendingFW.length === 0 && (
                    <p className="text-xs text-gray-300 py-1">아직 제출한 게 없어요.</p>
                  )}
                  {groups.map(({ assignment, attempts }) => (
                    <div key={assignment.id} className="space-y-1">
                      <p className="text-[11px] font-bold text-gray-400">{assignment.title}</p>
                      {attempts.map((sub, i) => {
                        const subCfg = STATUS_CONFIG[sub.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.none
                        return (
                          <button key={sub.id} onClick={() => onReview(student.uid, sub)}
                            className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors">
                            <span className="text-[11px] font-bold text-indigo-400 w-8 flex-shrink-0">
                              {sub.attemptNumber ?? (attempts.length - i)}차
                            </span>
                            <span className="text-xs text-gray-500 flex-1 truncate">
                              {sub.submittedAt instanceof Date ? sub.submittedAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${subCfg.color}`}>
                              {subCfg.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))}

                  {/* 자유작문 */}
                  {pendingFW.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <p className="text-[11px] font-bold text-gray-400">자유작문</p>
                      {pendingFW.map(fw => {
                        const fwCfg = STATUS_CONFIG[fw.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.none
                        return (
                          <button key={fw.id} onClick={() => onReviewFreeWriting(student.uid, fw)}
                            className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors">
                            <span className="text-xs">✍️</span>
                            <span className="text-xs text-purple-700 font-semibold flex-1 truncate">
                              {fw.topic || '자유작문'}
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}