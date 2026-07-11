'use client'
// components/researcher/ResearchSubmissionReview.tsx
import { useState, useEffect } from 'react'
import {
  getAllResearchAssignments, getResearchSubmissionsForAssignment, getResearchFeedback,
} from '@/lib/firestore/research'
import { ResearchAssignment, ResearchSubmission, ResearchFeedback } from '@/types/research'

export default function ResearchSubmissionReview() {
  const [assignments, setAssignments] = useState<ResearchAssignment[]>([])
  const [selectedId, setSelectedId]   = useState('')
  const [submissions, setSubmissions] = useState<ResearchSubmission[]>([])
  const [loading, setLoading]         = useState(true)
  const [feedbackCache, setFeedbackCache] = useState<Record<string, ResearchFeedback | null>>({})

  useEffect(() => {
    getAllResearchAssignments().then(list => {
      setAssignments(list)
      if (list[0]) setSelectedId(list[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    getResearchSubmissionsForAssignment(selectedId).then(setSubmissions)
  }, [selectedId])

  // 학생별로 그룹핑
  const byStudent = submissions.reduce<Record<string, ResearchSubmission[]>>((acc, s) => {
    (acc[s.studentUid] ??= []).push(s)
    return acc
  }, {})
  Object.values(byStudent).forEach(list => list.sort((a, b) => (a.attemptNumber ?? 1) - (b.attemptNumber ?? 1)))

  const loadFeedback = async (id: string) => {
    if (feedbackCache[id] !== undefined) return
    const fb = await getResearchFeedback(id)
    setFeedbackCache(prev => ({ ...prev, [id]: fb }))
  }

  const selectedAssignment = assignments.find(a => a.id === selectedId)

  if (loading) return <div className="text-sm text-gray-400 animate-pulse py-4">불러오는 중...</div>

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">연구 과제 선택</label>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400">
          {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>

      {Object.keys(byStudent).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">아직 제출이 없어요.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(byStudent).map(([uid, attempts]) => (
            <StudentAttempts key={uid} uid={uid} attempts={attempts}
              assignment={selectedAssignment}
              feedbackCache={feedbackCache} loadFeedback={loadFeedback} />
          ))}
        </div>
      )}
    </div>
  )
}

function StudentAttempts({ uid, attempts, assignment, feedbackCache, loadFeedback }: {
  uid: string
  attempts: ResearchSubmission[]
  assignment?: ResearchAssignment
  feedbackCache: Record<string, ResearchFeedback | null>
  loadFeedback: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => { if (open) attempts.forEach(a => loadFeedback(a.id)) }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  const first = attempts[0]
  const second = attempts[1]

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-sm font-bold text-gray-700">참여자 {uid.slice(0, 8)}</span>
        <span className="text-xs text-gray-400">{attempts.length}회 제출 {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 border-t border-gray-50 space-y-4">
          {attempts.map(sub => {
            const fb = feedbackCache[sub.id]
            return (
              <div key={sub.id} className="bg-gray-50 rounded-xl p-3.5">
                <p className="text-xs font-bold text-purple-500 mb-2">{sub.attemptNumber ?? 1}차 제출</p>
                <div className="space-y-1.5 mb-3">
                  {sub.items.map(it => (
                    <div key={it.label} className="text-xs">
                      <span className="font-bold text-gray-500">[{it.label}] </span>
                      <span className="text-gray-700">{it.text}</span>
                    </div>
                  ))}
                </div>
                {fb ? (
                  <div className="bg-white rounded-lg p-3 space-y-1 text-xs">
                    <p><span className="font-bold text-gray-400">주장 명확성: </span>{fb.argumentFeedback.claimClarity}</p>
                    <p><span className="font-bold text-gray-400">근거 강도: </span>{fb.argumentFeedback.evidenceStrength}</p>
                    <p><span className="font-bold text-gray-400">반론 고려: </span>{fb.argumentFeedback.counterargument}</p>
                    <p><span className="font-bold text-gray-400">종합: </span>{fb.argumentFeedback.overallImpression}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300">피드백 생성 중이거나 아직 없어요.</p>
                )}
              </div>
            )
          })}

          {/* 1차 vs 2차 요소별 비교 */}
          {second && (
            <div className="border-2 border-indigo-100 rounded-xl p-3.5 bg-indigo-50/40">
              <p className="text-xs font-bold text-indigo-500 mb-2">📊 1차 → 2차 변화</p>
              {assignment?.argumentLabels.map(label => {
                const beforeText = first.items.find(it => it.label === label)?.text ?? ''
                const afterText  = second.items.find(it => it.label === label)?.text ?? ''
                const changed = beforeText.trim() !== afterText.trim()
                return (
                  <div key={label} className="flex items-center gap-2 text-xs py-1">
                    <span className={changed ? 'text-green-600' : 'text-gray-300'}>{changed ? '✏️' : '—'}</span>
                    <span className="font-bold text-gray-500 w-14 flex-shrink-0">{label}</span>
                    <span className={changed ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                      {changed ? '수정됨' : '변화 없음'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}