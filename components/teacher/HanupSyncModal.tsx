'use client'
// components/teacher/HanupSyncModal.tsx
// 한업(HanUp) 플랫폼과 쓰기 제출물 및 피드백 데이터를 원클릭으로 주고받는 연동 모달

import { useState } from 'react'
import { AppUser } from '@/types/user'
import { Assignment, Submission } from '@/types/assignment'
import { Feedback } from '@/types/feedback'
import {
  HanupWritingSubmissionPayload,
  mapHanupWritingToWooriban,
  exportWooribanToHanupReport,
  HanupStudentPayload,
  mapHanupStudentToAppUser,
} from '@/lib/adapters/hanupAdapter'
import { createAssignment } from '@/lib/firestore/assignments'
import { submitAssignment } from '@/lib/firestore/submissions'
import { createUser } from '@/lib/firestore/users'
import { getFeedbackBySubmission } from '@/lib/firestore/feedback'

interface Props {
  schoolId: string
  semester: string
  classId: string
  teacherUid: string
  students: AppUser[]
  assignments: Assignment[]
  submissions: Submission[]
  onClose: () => void
  onImportSuccess: () => void
}

export default function HanupSyncModal({
  schoolId,
  semester,
  classId,
  teacherUid,
  students,
  assignments,
  submissions,
  onClose,
  onImportSuccess,
}: Props) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')
  const [importJson, setImportJson] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [err, setErr] = useState('')

  // ── 1. 한업 쓰기 제출물 JSON 임포트 ─────────────────────────────────
  const handleImport = async () => {
    if (!importJson.trim()) {
      setErr('한업에서 복사한 JSON 데이터를 입력해주세요.')
      return
    }

    setLoading(true)
    setErr('')
    setStatusMsg('한업 데이터를 파싱하는 중...')

    try {
      const parsed = JSON.parse(importJson)

      // (A) 학생 목록 임포트가 포함된 경우 (students 배열)
      if (Array.isArray(parsed.students)) {
        setStatusMsg('한업 학생 계정 동기화 중...')
        for (let i = 0; i < parsed.students.length; i++) {
          const sPayload: HanupStudentPayload = parsed.students[i]
          const mappedUser = mapHanupStudentToAppUser(sPayload, schoolId, semester, classId, i + 1)
          await createUser(mappedUser.uid, mappedUser)
        }
      }

      // (B) 단일 제출물이거나 복수 제출물 배열 처리
      const items: HanupWritingSubmissionPayload[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.submissions)
        ? parsed.submissions
        : [parsed]

      let importedCount = 0

      for (const item of items) {
        if (!item.submittedText || !item.hanupUserId) continue

        setStatusMsg(`[${importedCount + 1}/${items.length}] 과제 및 답안 임포트 중...`)

        // 1) 과제 매핑 및 생성
        const { assignment, submission } = mapHanupWritingToWooriban(
          item,
          classId,
          schoolId,
          semester,
          teacherUid
        )

        // 동일 프롬프트 과제가 이미 있는지 검사
        let targetAssignmentId = assignments.find(
          a => a.externalRef?.hanupPromptId === item.hanupPromptId
        )?.id

        if (!targetAssignmentId) {
          targetAssignmentId = await createAssignment(assignment)
        }

        // 2) 제출물 등록
        const subId = await submitAssignment({
          ...submission,
          assignmentId: targetAssignmentId,
        })

        // 3) AI 자동 첨삭 백그라운드 호출
        fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: subId,
            content: submission.content,
            contentType: submission.contentType || 'topik54',
            level: '고급',
            assignment: assignment.description,
            studentUid: submission.studentUid,
            classId,
            schoolId,
            semester,
          }),
        }).catch(e => console.error('AI 피드백 자동요청 실패:', e))

        importedCount++
      }

      setStatusMsg(`🎉 한업 제출물 ${importedCount}건 임포트 완료!`)
      setTimeout(() => {
        onImportSuccess()
      }, 1500)
    } catch (e: any) {
      console.error(e)
      setErr(`JSON 파싱 및 임포트 실패: ${e?.message || '형식을 확인해주세요.'}`)
    } finally {
      setLoading(false)
    }
  }

  // ── 2. 우리반 첨삭 결과 ➔ 한업 리포트 포맷 JSON 익스포트 ───────────
  const handleExport = async () => {
    setLoading(true)
    setErr('')
    setStatusMsg('첨삭 데이터 수집 중...')

    try {
      const feedbackMap: Record<string, Feedback | null> = {}

      await Promise.all(
        submissions.map(async sub => {
          try {
            const fb = await getFeedbackBySubmission(sub.id)
            feedbackMap[sub.id] = fb
          } catch {
            feedbackMap[sub.id] = null
          }
        })
      )

      const report = exportWooribanToHanupReport({
        submissions,
        assignments,
        feedbacks: feedbackMap,
        students,
      })

      const jsonStr = JSON.stringify(report, null, 2)

      // 파일 다운로드 트리거
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wooriban-hanup-sync-${classId}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)

      setStatusMsg('한업 연동용 JSON 파일이 다운로드되었습니다! 📥')
    } catch (e: any) {
      console.error(e)
      setErr(`익스포트 실패: ${e?.message || '데이터를 불러오지 못했습니다.'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,27,75,0.45)] backdrop-blur-sm z-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-7 w-full max-w-[620px] max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📘</span>
            <div>
              <h2 className="font-bold text-lg text-gray-900">한업(HanUp) 플랫폼 연동 허브</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                우리반의 단독 실행을 유지하면서 한업의 TOPIK 제출물과 피드백을 동기화해요.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ✕
          </button>
        </div>

        {/* 상위 탭 전환 */}
        <div className="flex bg-indigo-50 p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('import')
              setErr('')
              setStatusMsg('')
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'import' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📥 한업 답안 임포트 (가져오기)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('export')
              setErr('')
              setStatusMsg('')
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'export' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📤 우리반 첨삭결과 익스포트 (내보내기)
          </button>
        </div>

        {/* 임포트 탭 */}
        {activeTab === 'import' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-800 space-y-1">
              <p className="font-bold">💡 한업 쓰기 답안을 우리반으로 가져오는 방법:</p>
              <p className="text-blue-700 leading-relaxed">
                한업 플랫폼에서 내보낸 <strong>TOPIK 53·54번 답안 JSON</strong>을 아래에 붙여넣으세요.
                우리반 과제 및 학생 제출물로 자동 등록되며 AI 정밀 첨삭이 즉시 시작됩니다.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 mb-1.5 block">
                한업 JSON 데이터 입력
              </label>
              <textarea
                value={importJson}
                onChange={e => setImportJson(e.target.value)}
                rows={7}
                placeholder={`{\n  "hanupSubmissionId": "sub_101",\n  "hanupPromptId": "prompt_54",\n  "hanupUserId": "user_202",\n  "topikType": "topik54",\n  "title": "TOPIK 54번 인공지능과 교육",\n  "submittedText": "최근 인공지능 기술의 발전으로..."\n}`}
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-xs font-mono outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>

            <button
              onClick={handleImport}
              disabled={loading || !importJson.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? '임포트 처리 중...' : '한업 답안 임포트 & AI 첨삭 시작 🚀'}
            </button>
          </div>
        )}

        {/* 익스포트 탭 */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-800 space-y-1">
              <p className="font-bold">📤 한업 플랫폼 연동용 리포트 규격 내보내기:</p>
              <p className="text-emerald-700 leading-relaxed">
                우리반에서 승인된 교사 피드백, 8대 오류 카테고리 태그 통계, TOPIK 예상 점수 및 모범 답안을
                한업 시스템과 100% 호환되는 JSON 파일로 내보냅니다.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1 border border-gray-100">
              <p>• 대상 학급: <strong className="text-gray-800">{classId}</strong></p>
              <p>• 누적 제출물: <strong className="text-gray-800">{submissions.length}건</strong></p>
              <p>• 포함 내용: 학생 식별자, 원문, 교정문, 8대 오류 태그, TOPIK 점수, 선생님 의견</p>
            </div>

            <button
              onClick={handleExport}
              disabled={loading || submissions.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? 'JSON 생성 중...' : '한업 연동용 첨삭 JSON 다운로드 📥'}
            </button>
          </div>
        )}

        {statusMsg && (
          <p className="text-xs font-bold text-indigo-600 bg-indigo-50 p-2.5 rounded-lg animate-pulse text-center">
            {statusMsg}
          </p>
        )}

        {err && (
          <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-lg text-center">
            {err}
          </p>
        )}
      </div>
    </div>
  )
}
