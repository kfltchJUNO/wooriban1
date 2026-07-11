// types/feedback.ts

export type ErrorCategory =
  | '조사 오류'
  | '시제 사용 오류'
  | '어순 오류'
  | '불규칙 활용 오류'
  | '연결어미 오류'
  | '높임법 오류'
  | '어휘 선택 오류'
  | '기타'

export type ErrorSeverity = 'minor' | 'moderate' | 'major'

export interface ErrorTag {
  category:    ErrorCategory
  severity:    ErrorSeverity
  original:    string
  correction:  string
  explanation: string
}

export interface AIFeedback {
  grammar:     string
  vocabulary:  string
  structure:   string
  positive:    string
  errorTags?:  ErrorTag[]
  generatedAt: Date
}

// 선생님이 오류 태그별로 남긴 검수 판정 (정오표 대조군 연구용)
export type AuditChoice = 'confirmed' | 'corrected'

export interface Feedback {
  id:              string
  submissionId:    string
  studentUid:      string
  assignmentId:    string
  classId?:        string
  aiFeedback:      AIFeedback
  teacherComment:  string
  teacherApproved: boolean
  sentAt?:         Date

  // 정오표 대조군 (AI 태깅 정확도 검증용)
  needsAudit?:   boolean
  auditResult?:  'confirmed' | 'corrected'
  auditedAt?:    Date
  auditDetail?:  Record<number, AuditChoice>

  // 선생님이 AI 피드백 원문을 직접 수정했는지 (투명성 목적)
  teacherEdited?: boolean
}