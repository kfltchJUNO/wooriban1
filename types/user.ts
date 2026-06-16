// types/user.ts
export type Role = 'admin' | 'teacher' | 'student'
export type UserStatus = 'pending' | 'active'

export interface AppUser {
  uid:                string
  email:              string
  nameKr:             string
  nameEn?:            string   // 여권 영문명 (학생만, 선택)
  nickname:           string
  studentIdHash?:     string   // 학번 SHA-256 해시 (학생만, 선택)
  role:               Role
  status:             UserStatus
  schoolId:           string
  semester:           string
  classId:            string
  sortOrder:          number
  freeWritingEnabled: boolean
  createdAt:          Date
  loginType:          'email' | 'google'
}

export interface School {
  id:        string
  name:      string
  semesters: string[]
  classes:   Record<string, string[]>
}