// lib/adapters/hanupAdapter.ts
// 한업(HanUp) 플랫폼과 우리반(UriBan) 간 데이터 양방향 변환 어댑터 (Mapper)
// 우리반의 단독 실행(Standalone) 아키텍처를 100% 보존하면서 느슨한 결합(Loose Coupling) 지원

import { AppUser } from '@/types/user'
import { Assignment, Submission, AssignmentContentType } from '@/types/assignment'
import { Feedback, ErrorTag, ErrorCategory } from '@/types/feedback'

// ── 한업(HanUp) 플랫폼 수신/송신 데이터 인터페이스 ────────────────────────
export interface HanupStudentPayload {
  hanupUserId: string
  nameKr: string
  nameEn?: string
  email?: string
  studentNumber?: string
  classCode: string
}

export interface HanupClassPayload {
  classCode: string
  className: string
  semesterCode?: string // 예: "26-summer"
  schoolCode?: string   // 예: "dk"
  students?: HanupStudentPayload[]
}

export interface HanupWritingSubmissionPayload {
  hanupSubmissionId: string
  hanupPromptId: string
  hanupUserId: string
  topikType: 'topik53' | 'topik54' | 'freeWriting'
  title: string
  promptDescription?: string
  submittedText: string
  handwritingImageUrl?: string
  submittedAt?: string | Date
  charCount?: number
}

export interface HanupFeedbackExportPayload {
  version: '1.0'
  exportedAt: string
  platform: 'wooriban'
  data: {
    hanupSubmissionId: string
    wooribanSubmissionId: string
    student: {
      hanupUserId?: string
      uid: string
      nameKr: string
    }
    assignment: {
      hanupPromptId?: string
      title: string
      contentType: AssignmentContentType
    }
    result: {
      content: string
      charCount: number
      topikScore?: string
      topikModelEssay?: string
      betterExpression?: string
      teacherComment?: string
      teacherApproved: boolean
      errorSummary: {
        totalErrors: number
        categories: Record<ErrorCategory, number>
      }
      errorTags: ErrorTag[]
    }
  }[]
}

// ── 1. 한업 학생 데이터 ➔ 우리반 AppUser 매핑 ───────────────────────────
export function mapHanupStudentToAppUser(
  hanupStudent: HanupStudentPayload,
  schoolId: string,
  semester: string,
  classId: string,
  sortOrder: number = 0
): AppUser {
  return {
    uid: `hanup_${hanupStudent.hanupUserId}`,
    email: hanupStudent.email || `hanup_${hanupStudent.hanupUserId}@hanup.edu`,
    nameKr: hanupStudent.nameKr,
    nameEn: hanupStudent.nameEn,
    nickname: hanupStudent.nameKr,
    studentIdHash: hanupStudent.studentNumber,
    role: 'student',
    status: 'active',
    schoolId,
    semester,
    classId,
    sortOrder,
    freeWritingEnabled: true,
    loginType: 'google',
    createdAt: new Date(),
    topikEnabled: true,
    ocrEnabled: true,
    externalRef: {
      platform: 'hanup',
      hanupUserId: hanupStudent.hanupUserId,
      hanupClassCode: hanupStudent.classCode,
      syncedAt: new Date(),
    },
  }
}

// ── 2. 한업 쓰기 답안 ➔ 우리반 Assignment 및 Submission 매핑 ───────────
export function mapHanupWritingToWooriban(
  payload: HanupWritingSubmissionPayload,
  classId: string,
  schoolId: string,
  semester: string,
  teacherUid: string
): { assignment: Omit<Assignment, 'id' | 'createdAt'>; submission: Omit<Submission, 'id'> } {
  const contentType: AssignmentContentType =
    payload.topikType === 'topik53'
      ? 'topik53'
      : payload.topikType === 'topik54'
      ? 'topik54'
      : 'freeWriting'

  const minChars = contentType === 'topik53' ? 200 : contentType === 'topik54' ? 600 : 150
  const maxChars = contentType === 'topik53' ? 300 : contentType === 'topik54' ? 700 : 2000

  const assignment: Omit<Assignment, 'id' | 'createdAt'> = {
    schoolId,
    semester,
    classId,
    createdBy: teacherUid,
    title: payload.title || (contentType === 'topik53' ? 'TOPIK II 53번 쓰기' : 'TOPIK II 54번 논술'),
    description: payload.promptDescription || '한업(HanUp) 플랫폼에서 연동된 쓰기 문항입니다.',
    minChars,
    maxChars,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일 후
    isActive: true,
    label: `[한업연동] ${payload.title || 'TOPIK 쓰기'}`,
    allowPaste: true,
    contentType,
    externalRef: {
      platform: 'hanup',
      hanupPromptId: payload.hanupPromptId,
      hanupSubmissionId: payload.hanupSubmissionId,
      syncedAt: new Date(),
    },
  }

  const studentUid = `hanup_${payload.hanupUserId}`
  const charCount = payload.charCount || payload.submittedText.length

  const submission: Omit<Submission, 'id'> = {
    assignmentId: '', // 과제 생성 후 주입
    studentUid,
    classId,
    content: payload.submittedText,
    charCount,
    contentType,
    pasteAttempts: 0,
    pasteAllowed: true,
    status: 'submitted',
    submittedAt: payload.submittedAt ? new Date(payload.submittedAt) : new Date(),
    attemptNumber: 1,
    handwritingImageUrl: payload.handwritingImageUrl,
    externalRef: {
      platform: 'hanup',
      hanupUserId: payload.hanupUserId,
      hanupPromptId: payload.hanupPromptId,
      hanupSubmissionId: payload.hanupSubmissionId,
      syncedAt: new Date(),
    },
  }

  return { assignment, submission }
}

// ── 3. 우리반 Submission + Feedback ➔ 한업 리포트 포맷 매핑 ───────────
export function exportWooribanToHanupReport({
  submissions,
  assignments,
  feedbacks,
  students,
}: {
  submissions: Submission[]
  assignments: Assignment[]
  feedbacks: Record<string, Feedback | null>
  students: AppUser[]
}): HanupFeedbackExportPayload {
  const assignmentMap = new Map(assignments.map(a => [a.id, a]))
  const studentMap = new Map(students.map(s => [s.uid, s]))

  const exportedData = submissions.map(sub => {
    const assignment = assignmentMap.get(sub.assignmentId)
    const student = studentMap.get(sub.studentUid)
    const fb = feedbacks[sub.id]
    const errorTags: ErrorTag[] = fb?.aiFeedback?.errorTags ?? []

    // 8대 오류 카테고리별 집계
    const categoryCountMap: Record<ErrorCategory, number> = {
      '조사 오류': 0,
      '시제 사용 오류': 0,
      '어순 오류': 0,
      '불규칙 활용 오류': 0,
      '연결어미 오류': 0,
      '높임법 오류': 0,
      '어휘 선택 오류': 0,
      '기타': 0,
    }

    errorTags.forEach(t => {
      if (t.category in categoryCountMap) {
        categoryCountMap[t.category]++
      } else {
        categoryCountMap['기타']++
      }
    })

    return {
      hanupSubmissionId: sub.externalRef?.hanupSubmissionId || sub.id,
      wooribanSubmissionId: sub.id,
      student: {
        hanupUserId: sub.externalRef?.hanupUserId || student?.externalRef?.hanupUserId,
        uid: sub.studentUid,
        nameKr: student?.nameKr || '미등록 학습자',
      },
      assignment: {
        hanupPromptId: assignment?.externalRef?.hanupPromptId,
        title: assignment?.title || '작문 과제',
        contentType: sub.contentType || assignment?.contentType || 'freeWriting',
      },
      result: {
        content: sub.content,
        charCount: sub.charCount,
        topikScore: fb?.aiFeedback?.topikScore,
        topikModelEssay: fb?.aiFeedback?.topikModelEssay,
        betterExpression: fb?.aiFeedback?.betterExpression,
        teacherComment: fb?.teacherComment || '',
        teacherApproved: fb?.teacherApproved ?? false,
        errorSummary: {
          totalErrors: errorTags.length,
          categories: categoryCountMap,
        },
        errorTags,
      },
    }
  })

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    platform: 'wooriban',
    data: exportedData,
  }
}
