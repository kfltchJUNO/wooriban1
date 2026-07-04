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
  aiGenerated?: boolean   // 지침서 기반으로 AI가 추정 생성한 단원인지 (교재 파싱 단원과 구분)
}

export type TextbookStatus = 'uploading' | 'parsing' | 'ready' | 'error'
export type TextbookSourceType = 'textbook' | 'syllabus'

export interface Textbook {
  id: string
  title: string
  level: string
  storageUrl: string           // 대표 경로 (구버전 화면 호환용, storageUrls[0]와 동일)
  storageUrls?: string[]       // 여러 파일 업로드 시 전체 경로 목록 (분석은 이 배열 기준)
  status: TextbookStatus
  unitCount: number
  assignedClasses: AssignedClass[]
  uploadedBy: string
  uploadedAt?: Date           // optional (serverTimestamp로 자동 설정)
  createdAt?: Date
  sourceType?: TextbookSourceType   // 'textbook'(원문 추출) | 'syllabus'(AI 추정 생성)
  errorMessage?: string             // status: 'error'일 때 원인 메시지
}

export interface AssignedClass {
  schoolId: string
  semester: string
  classId: string
}