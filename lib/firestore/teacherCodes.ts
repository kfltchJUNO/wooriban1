// lib/firestore/teacherCodes.ts
import {
  collection, doc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

// ── 코드 체계 ─────────────────────────────────────────────────────
// 형식: {학교2}{연도2}{학기2}{급수2}{반2}{선생님번호2}
// 예:   DG   26    SU    30    01    01  → DG26SU300101
// 학교 코드는 schools 컬렉션 문서 ID(소문자)의 대문자 버전 — 하드코딩 없음

export const SEASON_MAP: Record<string, string> = {
  SP: 'spring',
  SU: 'summer',
  FA: 'fall',
  WI: 'winter',
}

export const SEASON_LABEL: Record<string, string> = {
  SP: '봄',
  SU: '여름',
  FA: '가을',
  WI: '겨울',
}

// spring → SP 역변환
export const SEASON_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(SEASON_MAP).map(([k, v]) => [v, k])
)

export interface TeacherCodeInfo {
  code:          string
  schoolId:      string
  schoolLabel:   string
  semester:      string
  semesterLabel: string
  classId:       string
  classLabel:    string
  teacherNo:     number
  used:          boolean
  usedBy:        string | null
  createdAt:     unknown
}

// ── classId → 코드 숫자 변환 ─────────────────────────────────────
// level30-6 → {level: "30", class: "06"}
// grade2-3  → {level: "02", class: "03"}
// advanced-6 → {level: "30", class: "06"}  (초10/중20/고30 매핑)
// class-5   → {level: "00", class: "05"}
export function classIdToDigits(classId: string): { level: string; cls: string } | null {
  const parts = classId.split('-')
  const num   = parseInt(parts[1] ?? '')
  if (isNaN(num) || num < 1 || num > 99) return null

  const cls = String(num).padStart(2, '0')

  if (parts[0].startsWith('level')) {
    const lv = parseInt(parts[0].replace('level', ''))
    if (isNaN(lv) || lv < 0 || lv > 99) return null
    return { level: String(lv).padStart(2, '0'), cls }
  }
  if (parts[0].startsWith('grade')) {
    const g = parseInt(parts[0].replace('grade', ''))
    if (isNaN(g) || g < 0 || g > 99) return null
    return { level: String(g).padStart(2, '0'), cls }
  }
  const NAMED: Record<string, string> = { beginner: '10', intermediate: '20', advanced: '30' }
  if (NAMED[parts[0]]) return { level: NAMED[parts[0]], cls }
  if (parts[0] === 'class') return { level: '00', cls }
  return null
}

// ── 코드 문자열 생성 (schools 데이터 기반) ───────────────────────
export function buildTeacherCode(
  schoolId:  string,   // schools 문서 ID (소문자, 예: "dk")
  semester:  string,   // "26-summer"
  classId:   string,   // "level30-6" — schools 컬렉션에 등록된 값 그대로
  teacherNo: number,
): string | null {
  // 학교 코드: 문서 ID 대문자 (2자 영문만 허용)
  const schoolCode = schoolId.toUpperCase()
  if (!/^[A-Z]{2}$/.test(schoolCode)) return null

  const [yy, seasonKey] = semester.split('-')
  if (!/^\d{2}$/.test(yy ?? '')) return null
  const seasonCode = SEASON_CODE[seasonKey ?? '']
  if (!seasonCode) return null

  const digits = classIdToDigits(classId)
  if (!digits) return null

  if (teacherNo < 1 || teacherNo > 99) return null

  return [
    schoolCode, yy, seasonCode,
    digits.level, digits.cls,
    String(teacherNo).padStart(2, '0'),
  ].join('')
}

// ── Firestore CRUD ────────────────────────────────────────────────

/**
 * 코드 저장 — 이미 존재하면 스킵 (중복 생성/덮어쓰기 방지)
 */
export async function saveTeacherCode(
  code: string,
  info: Omit<TeacherCodeInfo, 'code' | 'used' | 'usedBy' | 'createdAt'>,
): Promise<'created' | 'exists'> {
  const ref  = doc(db, 'teacherCodes', code)
  const snap = await getDoc(ref)
  if (snap.exists()) return 'exists'

  await setDoc(ref, {
    code,
    ...info,
    used:      false,
    usedBy:    null,
    createdAt: serverTimestamp(),
  })
  return 'created'
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

export async function deleteTeacherCode(code: string) {
  await deleteDoc(doc(db, 'teacherCodes', code))
}

export async function resetTeacherCode(code: string) {
  await updateDoc(doc(db, 'teacherCodes', code), { used: false, usedBy: null })
}