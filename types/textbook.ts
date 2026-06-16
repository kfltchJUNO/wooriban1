// 📁 types/textbook.ts

export interface VocabItem {
  word: string
  meaning: string
  example: string
  type?: string
}

export interface GrammarItem {
  pattern: string
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
  title: string
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
  title: string
  level: string
  storageUrl: string
  status: TextbookStatus
  unitCount: number
  assignedClasses: AssignedClass[]
  uploadedBy: string
  uploadedAt?: Date   // ← optional로 변경 (serverTimestamp로 자동 설정)
  createdAt?: Date    // ← 추가
}

export interface AssignedClass {
  schoolId: string
  semester: string
  classId: string
}