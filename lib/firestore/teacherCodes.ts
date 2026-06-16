// lib/firestore/teacherCodes.ts
import {
  collection, doc, getDoc, getDocs, setDoc,
  updateDoc, query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

// ── 코드 체계 ─────────────────────────────────────────────────────
// 형식: {학교}{연도2}{학기2}{급수2}{반2}{선생님번호2}
// 예:   DG   26    SU    02    10    01  → DG26SU021001

const SCHOOL_MAP: Record<string, string> = {
  DG: 'dongguk',
  DK: 'dankook',
}

const SCHOOL_LABEL: Record<string, string> = {
  DG: '동국대',
  DK: '단국대',
}

const SEASON_MAP: Record<string, string> = {
  SP: 'spring',
  SU: 'summer',
  FA: 'fall',
  WI: 'winter',
}

const SEASON_LABEL: Record<string, string> = {
  SP: '봄',
  SU: '여름',
  FA: '가을',
  WI: '겨울',
}

export interface TeacherCodeInfo {
  code:      string
  schoolId:  string
  schoolLabel: string
  semester:  string
  semesterLabel: string
  classId:   string
  classLabel: string
  teacherNo: number
  used:      boolean
  usedBy:    string | null
  createdAt: unknown
}

// ── 코드 생성 ─────────────────────────────────────────────────────
export function generateTeacherCode(
  schoolCode: string,   // DG, DK
  year: string,         // 26
  seasonCode: string,   // SP, SU, FA, WI
  level: number,        // 2
  classNum: number,     // 10
  teacherNo: number,    // 1, 2, 3
): string {
  return [
    schoolCode,
    year.slice(-2),
    seasonCode,
    String(level).padStart(2, '0'),
    String(classNum).padStart(2, '0'),
    String(teacherNo).padStart(2, '0'),
  ].join('')
}

// ── 코드 파싱 ─────────────────────────────────────────────────────
export function parseTeacherCode(code: string): {
  schoolId: string
  schoolLabel: string
  semester: string
  semesterLabel: string
  classId: string
  classLabel: string
  teacherNo: number
} | null {
  if (code.length !== 12) return null

  const schoolCode = code.slice(0, 2)
  const year       = '20' + code.slice(2, 4)
  const seasonCode = code.slice(4, 6)
  const levelNum   = parseInt(code.slice(6, 8))
  const classNum   = parseInt(code.slice(8, 10))
  const teacherNo  = parseInt(code.slice(10, 12))

  if (!SCHOOL_MAP[schoolCode] || !SEASON_MAP[seasonCode]) return null
  if (isNaN(levelNum) || isNaN(classNum) || isNaN(teacherNo)) return null

  const schoolId    = SCHOOL_MAP[schoolCode]
  const schoolLabel = SCHOOL_LABEL[schoolCode]
  const seasonKey   = SEASON_MAP[seasonCode]
  const semester    = `${year.slice(2)}-${seasonKey}`
  const semesterLabel = `20${code.slice(2,4)}년 ${SEASON_LABEL[seasonCode]}`

  // 10=초급, 20=중급, 30=고급, 1~6=N급
  const LEVEL_LABEL: Record<number, string> = {
    10: '초급', 20: '중급', 30: '고급',
  }
  const levelLabel = LEVEL_LABEL[levelNum] ?? `${levelNum}급`
  const classId    = `level${levelNum}-${classNum}`
  const classLabel = `${levelLabel} ${classNum}반`

  return { schoolId, schoolLabel, semester, semesterLabel, classId, classLabel, teacherNo }
}

// ── Firestore CRUD ────────────────────────────────────────────────
export async function saveTeacherCode(code: string, info: ReturnType<typeof parseTeacherCode>) {
  if (!info) throw new Error('유효하지 않은 코드')
  await setDoc(doc(db, 'teacherCodes', code), {
    code,
    ...info,
    used:      false,
    usedBy:    null,
    createdAt: serverTimestamp(),
  })
}

export async function validateTeacherCode(code: string): Promise<{
  valid: boolean
  info?: TeacherCodeInfo
  error?: string
}> {
  const snap = await getDoc(doc(db, 'teacherCodes', code))
  if (!snap.exists()) return { valid: false, error: '존재하지 않는 코드예요.' }
  const data = snap.data() as TeacherCodeInfo
  if (data.used) return { valid: false, error: '이미 사용된 코드예요.' }
  return { valid: true, info: data }
}

export async function useTeacherCode(code: string, uid: string) {
  await updateDoc(doc(db, 'teacherCodes', code), { used: true, usedBy: uid })
}

export async function getAllTeacherCodes(): Promise<TeacherCodeInfo[]> {
  const snap = await getDocs(collection(db, 'teacherCodes'))
  return snap.docs.map(d => d.data() as TeacherCodeInfo)
}