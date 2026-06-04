// 📁 types/quiz.ts

export type QuizQuestionType = 'fill_blank' | 'grammar' | 'idiom' | 'ox' | 'matching'
export type QuizDifficulty   = 'easy' | 'medium' | 'hard'
export type QuizPurpose      = 'review' | 'exam'

export interface QuizQuestion {
  id: string
  type: QuizQuestionType
  question: string
  answer: string
  options?: string[]        // 객관식일 때
  explanation: string
  difficulty: QuizDifficulty
  category: 'vocabulary' | 'grammar' | 'idiom' | 'comprehension'
}

export interface Quiz {
  id: string
  textbookId: string
  unitId: string
  unitTitle: string
  title: string             // 'V-느니 복습 퀴즈'
  purpose: QuizPurpose
  questions: QuizQuestion[]
  // 배포 설정
  assignedClasses: { schoolId: string; semester: string; classId: string }[]
  isPublished: boolean
  createdBy: string         // teacher uid
  createdAt: Date
  dueDate?: Date
}

export interface QuizAttempt {
  id: string
  quizId: string
  studentUid: string
  classId: string
  answers: Record<string, string>   // { questionId: studentAnswer }
  score: number
  totalQuestions: number
  completedAt: Date
}

export interface ErrorPattern {
  id: string
  classId: string
  unitId: string
  textbookId: string
  patterns: {
    category: string        // '문법' | '어휘' | '관용어'
    description: string     // 'V-느니를 형용사에 잘못 적용'
    count: number           // 몇 명이 틀렸는지
    examples: string[]      // 실제 오류 예시 (익명)
    suggestion: string      // 교사용 수업 제안
  }[]
  analyzedAt: Date
}