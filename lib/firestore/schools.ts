// lib/firestore/schools.ts
import {
  collection, doc, getDocs, getDoc,
  setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

export interface SchoolData {
  id:        string
  name:      string         // "단국대학교"
  code:      string         // "DK"
  semesters: string[]       // ["26-summer", "26-spring"]
  classes:   Record<string, string[]>  // { "26-summer": ["advanced-6", ...] }
  createdAt?: unknown
}

// ── 전체 학교 목록 ────────────────────────────────────────────────
export async function getAllSchools(): Promise<SchoolData[]> {
  const snap = await getDocs(collection(db, 'schools'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolData))
}

export async function getSchool(schoolId: string): Promise<SchoolData | null> {
  const snap = await getDoc(doc(db, 'schools', schoolId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as SchoolData) : null
}

// ── 학교 추가 ─────────────────────────────────────────────────────
export async function addSchool(data: Omit<SchoolData, 'id' | 'createdAt'>) {
  const id = data.code.toLowerCase()  // "dk", "dg"
  await setDoc(doc(db, 'schools', id), {
    ...data,
    semesters: [],
    classes:   {},
    createdAt: serverTimestamp(),
  })
  return id
}

// ── 학교 정보 수정 ────────────────────────────────────────────────
export async function updateSchool(id: string, data: Partial<Pick<SchoolData, 'name' | 'code'>>) {
  return updateDoc(doc(db, 'schools', id), data)
}

// ── 학기 추가 ─────────────────────────────────────────────────────
// semesterId 형식: "26-summer"
export async function addSemester(schoolId: string, semesterId: string) {
  const school = await getSchool(schoolId)
  if (!school) throw new Error('학교를 찾을 수 없어요')
  const semesters = [...new Set([...school.semesters, semesterId])]
  const classes   = { ...school.classes, [semesterId]: school.classes[semesterId] ?? [] }
  return updateDoc(doc(db, 'schools', schoolId), { semesters, classes })
}

// ── 반 추가 ───────────────────────────────────────────────────────
// classId 형식: "advanced-6", "intermediate-3"
export async function addClass(schoolId: string, semesterId: string, classId: string) {
  const school = await getSchool(schoolId)
  if (!school) throw new Error('학교를 찾을 수 없어요')
  const existing = school.classes[semesterId] ?? []
  if (existing.includes(classId)) return
  const classes = { ...school.classes, [semesterId]: [...existing, classId] }
  return updateDoc(doc(db, 'schools', schoolId), { classes })
}

// ── 반 삭제 ───────────────────────────────────────────────────────
export async function removeClass(schoolId: string, semesterId: string, classId: string) {
  const school = await getSchool(schoolId)
  if (!school) throw new Error('학교를 찾을 수 없어요')
  const classes = {
    ...school.classes,
    [semesterId]: (school.classes[semesterId] ?? []).filter(c => c !== classId),
  }
  return updateDoc(doc(db, 'schools', schoolId), { classes })
}

// ── 학기 삭제 ─────────────────────────────────────────────────────
export async function removeSemester(schoolId: string, semesterId: string) {
  const school = await getSchool(schoolId)
  if (!school) throw new Error('학교를 찾을 수 없어요')
  const semesters = school.semesters.filter(s => s !== semesterId)
  const classes   = { ...school.classes }
  delete classes[semesterId]
  return updateDoc(doc(db, 'schools', schoolId), { semesters, classes })
}

// ── 학교 삭제 ─────────────────────────────────────────────────────
export async function deleteSchool(schoolId: string) {
  return deleteDoc(doc(db, 'schools', schoolId))
}

// ── 학기/반 레이블 헬퍼 ──────────────────────────────────────────
export function formatSemesterId(id: string): string {
  // "26-summer" → "2026년 여름"
  const SEASON: Record<string, string> = {
    spring: '봄', summer: '여름', fall: '가을', winter: '겨울'
  }
  const [year, season] = id.split('-')
  return `20${year}년 ${SEASON[season] ?? season}`
}

export function formatClassId(id: string): string {
  // "advanced-6" → "고급 6반", "intermediate-3" → "중급 3반"
  const LEVEL: Record<string, string> = {
    advanced:     '고급',
    intermediate: '중급',
    beginner:     '초급',
  }
  const parts = id.split('-')
  const level = LEVEL[parts[0]] ?? parts[0]
  const num   = parts[1] ?? ''
  return `${level} ${num}반`
}

// ── classId 자동 생성 ─────────────────────────────────────────────
// level: "advanced"|"intermediate"|"beginner", num: 6 → "advanced-6"
export function buildClassId(level: string, num: number): string {
  return `${level}-${num}`
}

// ── semesterId 자동 생성 ──────────────────────────────────────────
// year: "26", season: "summer" → "26-summer"
export function buildSemesterId(year: string, season: string): string {
  return `${year.slice(-2)}-${season}`
}