// types/user.ts
export type UserRole   = 'student' | 'teacher' | 'admin'
export type UserStatus = 'active' | 'inactive' | 'pending'

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
}