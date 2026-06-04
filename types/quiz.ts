// types/quiz.ts
export type QuizQuestionType = 'fill_blank' | 'grammar' | 'idiom' | 'ox' | 'matching'
export type QuizDifficulty   = 'easy' | 'medium' | 'hard'
export type QuizPurpose      = 'review' | 'exam'

export interface QuizQuestion {
  id: string
  type: QuizQuestionType
  question: string
  answer: string
  options?: string[]
  explanation: string
  difficulty: QuizDifficulty
  category: 'vocabulary' | 'grammar' | 'idiom' | 'comprehension'
  hint?: string
}

export interface Quiz {
  id: string
  textbookId: string
  unitId: string
  unitTitle: string
  title: string
  purpose: QuizPurpose
  questions: QuizQuestion[]
  assignedClasses: { schoolId: string; semester: string; classId: string }[]
  isPublished: boolean
  createdBy: string
  createdAt: Date
  dueDate?: Date
}

export interface QuizAttempt {
  id: string
  quizId: string
  studentUid: string
  classId: string
  answers: Record<string, string>
  score: number
  totalQuestions: number
  completedAt?: Date
}

export interface ErrorPattern {
  id: string
  classId: string
  unitId: string
  textbookId: string
  patterns: {
    category: string
    description: string
    count: number
    examples: string[]
    suggestion: string
  }[]
  analyzedAt: Date
}
