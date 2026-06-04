// types/feedback.ts
export interface AIFeedback {
  grammar: string
  vocabulary: string
  structure: string
  positive: string
  generatedAt: Date
}

export interface Feedback {
  id: string
  submissionId: string
  studentUid: string
  assignmentId: string
  aiFeedback: AIFeedback
  teacherComment: string
  teacherApproved: boolean
  sentAt?: Date
}