// types/assignment.ts
export type SubmissionStatus =
  | 'submitted'
  | 'ai_processing'
  | 'ai_done'
  | 'teacher_reviewing'
  | 'feedback_sent'
  | 'read'

// ── 과제 콘텐츠 유형 ──────────────────────────────────────────────
export type AssignmentContentType = 'freeWriting' | 'sentence' | 'dialogue'

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

  contentType: AssignmentContentType   // 기본 'freeWriting' (기존 과제 호환)
  itemCount?:  number                  // 문장/대화문일 때 입력 칸 개수
  speakers?:   string[]                // 대화문일 때 화자 이름 목록 (기본 ["가","나"])
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

// 문장/대화문 제출 시 항목별로 구조화해서 함께 저장 (AI 프롬프트 구성에 사용)
export interface SubmissionItem {
  index:   number
  speaker?: string   // 대화문일 때만 (예: "민정")
  text:    string
}

export interface Submission {
  id:            string
  assignmentId:  string
  studentUid:    string
  classId:       string
  content:       string          // 최종 합쳐진 텍스트 (기존 화면/검색 호환용)
  items?:        SubmissionItem[] // 문장/대화문일 때 구조화된 원본 (선택)
  contentType?:  AssignmentContentType
  charCount:     number
  pasteAttempts: number    // 붙여넣기 시도 횟수 (허용/금지 모두 카운트)
  pasteAllowed:  boolean   // 과제에서 허용됐는지 여부
  status:        SubmissionStatus
  submittedAt:   Date

  // ── 작성 시간 추적 ──────────────────────────────────────────
  startedAt?:       Date    // 작성 화면을 처음 연 시각
  activeDurationMs?: number // 화면이 보이는(포커스된) 상태로 누적된 시간(ms)
  totalDurationMs?:  number // 시작~제출까지 전체 경과 시간(ms, 자리 비운 시간 포함)
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

  startedAt?:        Date
  activeDurationMs?: number
  totalDurationMs?:  number
}