// 📁 types/textbook.ts

export interface VocabItem {
  word: string
  meaning: string
  example: string
  type?: string   // '동사' | '형용사' | '명사' | '표현'
}

export interface GrammarItem {
  pattern: string       // 'V-느니'
  explanation: string
  examples: string[]
  notes?: string
}

export interface IdiomItem {
  expression: string
  meaning: string
  example: string
}

export interface TextbookUnit {
  id: string
  textbookId: string
  unitNumber: number
  title: string           // '일과 삶의 균형'
  vocabulary: VocabItem[]
  grammar: GrammarItem[]
  idioms: IdiomItem[]
  readingTopics: string[]
  listeningPoints: string[]
  writingTheme: string
  parsedAt: Date
  manuallyEdited: boolean
}

export type TextbookStatus = 'uploading' | 'parsing' | 'ready' | 'error'

export interface Textbook {
  id: string
  title: string           // '고려대 한국어 5A'
  level: string           // '5A' | '5B' | '4A' ...
  storageUrl: string      // Firebase Storage PDF 경로
  status: TextbookStatus
  unitCount: number
  // 배정된 반 목록
  assignedClasses: AssignedClass[]
  uploadedBy: string      // admin uid
  uploadedAt: Date
}

export interface AssignedClass {
  schoolId: string
  semester: string
  classId: string
}