// types/assignment.ts
export type SubmissionStatus =
  | 'submitted'
  | 'ai_processing'
  | 'ai_done'
  | 'teacher_reviewing'
  | 'feedback_sent'
  | 'read'

export interface Assignment {
  id:          string
  schoolId:    string
  semester:    string
  classId:     string
  createdBy:   string
  title:       string
  description: string
  grammar?:    string
  minChars:    number
  maxChars:    number
  dueDate:     Date
  isActive:    boolean
  label:       string
  createdAt:   Date
  allowPaste:  boolean   // 붙여넣기 허용 여부 (기본 false)
}

// ── 붙여넣기/편집 로그 항목 ───────────────────────────────────────
export interface PasteLogEntry {
  time:      string    // "HH:MM:SS"
  type:      'paste'
  content:   string    // 붙여넣은 원본 텍스트 전체
  position:  number    // 커서 위치 (몇 번째 글자)
  length:    number    // 붙여넣은 글자 수
}

export interface EditLogEntry {
  time:    string
  type:    'delete' | 'cut'
  deleted: string    // 삭제/잘라내기된 텍스트
  position: number
  length:  number
}

export type LogEntry = PasteLogEntry | EditLogEntry

export interface Submission {
  id:            string
  assignmentId:  string
  studentUid:    string
  classId:       string
  content:       string
  charCount:     number
  pasteAttempts: number    // 붙여넣기 시도 횟수 (허용/금지 모두 카운트)
  pasteAllowed:  boolean   // 과제에서 허용됐는지 여부
  status:        SubmissionStatus
  submittedAt:   Date
}

// 붙여넣기 로그는 별도 컬렉션으로 분리 (1MB 문서 제한 방지)
// /submissionLogs/{submissionId}
export interface SubmissionLog {
  submissionId: string
  studentUid:   string
  assignmentId: string
  logs:         LogEntry[]
  createdAt:    Date
  updatedAt:    Date
}

export interface FreeWriting {
  id:            string
  studentUid:    string
  classId:       string
  topic:         string
  content:       string
  charCount:     number
  pasteAttempts: number
  status:        'pending_approval' | 'ai_processing' | 'ai_done' | 'feedback_sent' | 'read'
  submittedAt:   Date
}