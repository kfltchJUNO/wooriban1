// types/vault.ts

export type VaultItemType = 'error_correction' | 'vocabulary' | 'grammar' | 'expression'

export interface VaultItem {
  id: string
  studentUid: string
  classId?: string
  type: VaultItemType
  original: string // 틀렸던 표현 또는 학습 전 표현
  correction: string // 올바른 표현 또는 추천 표현
  explanation?: string // 문법/어휘 설명 또는 용례
  category?: string // '조사 오류', '고급 어휘' 등
  sourceTitle?: string // 과제 제목 또는 출처
  sourceSubmissionId?: string
  mastered?: boolean // 외웠는지 여부 (체크)
  createdAt: Date
}
