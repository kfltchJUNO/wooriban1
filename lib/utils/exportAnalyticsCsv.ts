// lib/utils/exportAnalyticsCsv.ts
import { Submission, FreeWriting, Assignment } from '@/types/assignment'
import { AppUser } from '@/types/user'
import { Feedback } from '@/types/feedback'

export interface DetailedExportRow {
  studentAnonId: string
  studentNameKr?: string // 연구용 익명화 모드일 땐 마스킹
  classId: string
  semester: string
  schoolId: string
  isResearchParticipant: boolean
  assignmentId: string
  assignmentTitle: string
  assignmentType: string
  attemptNumber: number
  submittedAt: string
  charCount: number
  pasteAttempts: number
  totalDurationSeconds?: number
  activeDurationSeconds?: number
  topikScore?: string
  topikModelEssay?: string
  errorTagCount: number
  errorCategoriesTagged: string
  errorDetails: string
  submissionContent: string
}

/**
 * 연구자 및 교사를 위한 다차원 제출물/오류 데이터 CSV 다운로드
 */
export function exportSubmissionsMultiDimensionalCsv({
  submissions,
  assignments,
  students,
  feedbacks,
  filename = 'wooriban-analytics-export',
  anonymize = false,
}: {
  submissions: Submission[]
  assignments: Assignment[]
  students: AppUser[]
  feedbacks: Record<string, Feedback | null>
  filename?: string
  anonymize?: boolean
}) {
  const assignmentMap = new Map(assignments.map(a => [a.id, a]))
  const studentMap = new Map(students.map(s => [s.uid, s]))

  const headers = [
    '익명ID',
    ...(anonymize ? [] : ['학생이름']),
    '학급ID',
    '학기',
    '연구참여여부',
    '과제ID',
    '과제제목',
    '과제유형',
    '제출차수',
    '제출일시',
    '글자수',
    '붙여넣기시도수',
    '총작성시간(초)',
    '실제체류시간(초)',
    'TOPIK예상점수',
    '오류태그수',
    '발생오류유형목록',
    '오류상세(원문->교정:설명)',
    '제출본문',
  ]

  const csvRows: string[] = [headers.join(',')]

  submissions.forEach(sub => {
    const student = studentMap.get(sub.studentUid)
    const assignment = assignmentMap.get(sub.assignmentId)
    const fb = feedbacks[sub.id]
    const errorTags = fb?.aiFeedback?.errorTags ?? []

    const anonId = sub.studentUid.slice(0, 8)
    const studentName = student?.nameKr || '알 수 없음'
    const classId = sub.classId || student?.classId || ''
    const semester = student?.semester || ''
    const isParticipant = student?.researchParticipant ? 'Y' : 'N'
    const assignId = sub.assignmentId
    const assignTitle = assignment?.title || '기타 과제'
    const assignType = sub.contentType || assignment?.contentType || 'freeWriting'
    const attempt = sub.attemptNumber ?? 1
    const submittedAt = sub.submittedAt ? new Date(sub.submittedAt).toISOString() : ''
    const charCount = sub.charCount || sub.content.length
    const pasteAttempts = sub.pasteAttempts ?? 0
    const totalDurationSec = sub.totalDurationMs ? Math.round(sub.totalDurationMs / 1000) : ''
    const activeDurationSec = sub.activeDurationMs ? Math.round(sub.activeDurationMs / 1000) : ''
    const topikScore = fb?.aiFeedback?.topikScore || ''
    const errorCount = errorTags.length
    const errorCats = Array.from(new Set(errorTags.map(t => t.category))).join(';')
    const errorDetailText = errorTags
      .map(t => `[${t.category}] ${t.original} -> ${t.correction} (${t.explanation || ''})`)
      .join(' | ')

    // CSV 특수문자 및 줄바꿈 이스케이프
    const escapeCsv = (str: unknown) => {
      const s = String(str ?? '').replace(/"/g, '""')
      return `"${s}"`
    }

    const row = [
      escapeCsv(anonId),
      ...(anonymize ? [] : [escapeCsv(studentName)]),
      escapeCsv(classId),
      escapeCsv(semester),
      escapeCsv(isParticipant),
      escapeCsv(assignId),
      escapeCsv(assignTitle),
      escapeCsv(assignType),
      attempt,
      escapeCsv(submittedAt),
      charCount,
      pasteAttempts,
      totalDurationSec,
      activeDurationSec,
      escapeCsv(topikScore),
      errorCount,
      escapeCsv(errorCats),
      escapeCsv(errorDetailText),
      escapeCsv(sub.content),
    ]

    csvRows.push(row.join(','))
  })

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
