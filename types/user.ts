// types/user.ts
export type UserRole   = 'student' | 'teacher' | 'admin' | 'researcher'
export type UserStatus = 'active' | 'inactive' | 'pending'

// 기존 코드 호환용 별칭 (RoleGuard 등에서 사용)
export type Role   = UserRole
export type Status = UserStatus

export interface ChalkEvent {
  amount:    number
  expiresAt: unknown   // Firestore Timestamp
  reason?:   string
}

export interface AppUser {
  uid:                string
  email:              string
  nameKr:             string
  nameEn?:            string
  nickname:           string
  studentIdHash?:     string
  role:               UserRole
  status:             UserStatus
  schoolId:           string
  semester:           string
  classId:            string
  sortOrder:          number
  freeWritingEnabled: boolean
  loginType:          'email' | 'google'
  createdAt?:         Date

  // 유료 재화 (현재 미사용, 유료화 대비 — 쌤툴과 공유)
  chalk?:       number
  chalkEvents?: ChalkEvent[]

  // 학습 데이터 연구 활용 동의 (학생 가입 시 필수)
  researchConsent?:   boolean
  researchConsentAt?: Date

  // 관리자가 지정하는 연구 참여자 여부 (구글폼 매칭 후 설정)
  researchParticipant?: boolean

  // 관리자가 반/학생 단위로 지정하는 권한 플래그
  topikEnabled?: boolean // 토픽 쓰기 참여 권한 (기본 false)
  ocrEnabled?:   boolean // 손글씨 사진인식(OCR) 사용 권한 (기본 true)
}