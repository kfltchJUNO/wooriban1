// types/assignment.ts
export type SubmissionStatus =
  | 'submitted'
  | 'ai_processing'
  | 'ai_done'
  | 'teacher_reviewing'
  | 'feedback_sent'
  | 'read'

export interface Assignment {
  id: string
  schoolId: string
  semester: string
  classId: string
  createdBy: string
  title: string
  description: string
  grammar?: string
  minChars: number
  maxChars: number
  dueDate: Date
  isActive: boolean
  label: string
  createdAt: Date
}

export interface Submission {
  id: string
  assignmentId: string
  studentUid: string
  classId: string
  content: string
  charCount: number
  pasteAttempts: number
  status: SubmissionStatus
  submittedAt: Date
}

export interface FreeWriting {
  id: string
  studentUid: string
  classId: string
  topic: string
  content: string
  charCount: number
  pasteAttempts: number
  status: 'pending_approval' | 'ai_processing' | 'ai_done' | 'feedback_sent' | 'read'
  submittedAt: Date
}
