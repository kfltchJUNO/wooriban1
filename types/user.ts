// types/user.ts
export type Role = 'admin' | 'teacher' | 'student'
export type UserStatus = 'pending' | 'active'

export interface AppUser {
  uid: string
  email: string
  nameKr: string
  nickname: string
  role: Role
  status: UserStatus
  schoolId: string
  semester: string
  classId: string
  sortOrder: number
  freeWritingEnabled: boolean
  createdAt: Date
  loginType: 'email' | 'google'
}

export interface School {
  id: string
  name: string
  semesters: string[]
  classes: Record<string, string[]>
}