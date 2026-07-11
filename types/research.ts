// types/research.ts
// 신수사학(보편청중) 논증 연구 전용 타입. 기존 우리반 과제/피드백 시스템과 완전 분리.

export interface ResearchAssignment {
  id:             string
  title:          string
  prompt:         string          // 논제 (예: "원격근무를 확대해야 하는가")
  argumentLabels: string[]        // 기본 ["주장", "근거", "이유"]
  minChars:       number
  maxChars:       number
  allowPaste:     boolean
  postSurveyUrl?: string          // 완료 후 안내할 사후 설문 링크
  isActive:       boolean
  createdBy:      string
  createdAt:      Date
}

export interface ResearchArgumentItem {
  label: string   // "주장" | "근거" | "이유" 등 (assignment.argumentLabels 기준)
  text:  string
}

export type ResearchSubmissionStatus = 'submitted' | 'ai_processing' | 'ai_done'

export interface ResearchSubmission {
  id:            string
  assignmentId:  string
  studentUid:    string
  items:         ResearchArgumentItem[]
  content:       string          // items를 합친 텍스트 (검색/표시용)
  charCount:     number
  pasteAttempts: number
  attemptNumber: number          // 1 또는 2 (최대 2회)
  status:        ResearchSubmissionStatus
  submittedAt:   Date
  startedAt?:        Date
  activeDurationMs?: number
  totalDurationMs?:  number
}

// 이원화 피드백 — 언어 정확성 트랙 / 논증 품질 트랙(보편청중 관점)을 분리
export interface ResearchFeedback {
  id:           string   // submissionId와 동일
  submissionId: string
  studentUid:   string

  languageFeedback: {
    grammar:    string
    vocabulary: string
  }

  argumentFeedback: {
    claimClarity:       string   // 주장이 명확한가
    evidenceStrength:   string   // 근거가 주장을 충분히 뒷받침하는가
    counterargument:    string   // 예상 반론에 대한 대응이 있는가
    overallImpression:  string   // 보편청중 관점에서의 종합 설득력 평가
  }

  generatedAt: Date
}

// 논증 품질 트랙에 한해 제한적 대화(student가 반박/질문 가능) 지원
export interface ResearchThreadMessage {
  role:      'ai' | 'student'
  text:      string
  createdAt: Date
}

export interface ResearchThread {
  submissionId: string
  studentUid:   string
  messages:     ResearchThreadMessage[]
  studentTurnsUsed: number   // 최대 2회로 제한
  closed:       boolean
}