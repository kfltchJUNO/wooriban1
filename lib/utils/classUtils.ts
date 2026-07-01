// lib/utils/classUtils.ts
import { getAllSchools } from '@/lib/firestore/schools'

// ── 정적 폴백 (schools 컬렉션 로드 실패 시) ───────────────────────
const SCHOOL_FALLBACK: Record<string, string> = {
  'dk':       '단국대학교',
  'dg':       '동국대학교',
  'dankook':  '단국대학교',
  'dongguk':  '동국대학교',
}

const SEMESTER_FALLBACK: Record<string, string> = {
  '26-summer': '2026년 여름학기',
  '26-fall':   '2026년 가을학기',
  '26-spring': '2026년 봄학기',
  '26-winter': '2026년 겨울학기',
  '27-spring': '2027년 봄학기',
  '27-summer': '2027년 여름학기',
}

const SEASON_LABEL: Record<string, string> = {
  spring: '봄학기',
  summer: '여름학기',
  fall:   '가을학기',
  winter: '겨울학기',
}

const LEVEL_LABEL: Record<string, string> = {
  advanced:     '고급',
  intermediate: '중급',
  beginner:     '초급',
}

// ── 캐시 ──────────────────────────────────────────────────────────
let schoolCache: Awaited<ReturnType<typeof getAllSchools>> | null = null
let cacheTime = 0

async function getSchoolsCache() {
  if (schoolCache && Date.now() - cacheTime < 60_000) return schoolCache
  schoolCache = await getAllSchools()
  cacheTime   = Date.now()
  return schoolCache
}

// ── 포맷 함수 (비동기) ────────────────────────────────────────────
export async function formatSchoolAsync(schoolId: string): Promise<string> {
  try {
    const schools = await getSchoolsCache()
    const found   = schools.find(s => s.id === schoolId)
    if (found) return found.name
  } catch {}
  return SCHOOL_FALLBACK[schoolId] ?? schoolId
}

export async function formatSemesterAsync(semester: string): Promise<string> {
  // "26-summer" → "2026년 여름학기"
  if (SEMESTER_FALLBACK[semester]) return SEMESTER_FALLBACK[semester]
  const [year, season] = semester.split('-')
  if (year && season) {
    return `20${year}년 ${SEASON_LABEL[season] ?? season}`
  }
  return semester
}

export async function formatClassAsync(classId: string): Promise<string> {
  try {
    const schools = await getSchoolsCache()
    // schools 컬렉션에서 classes 목록 확인
    for (const school of schools) {
      for (const semClasses of Object.values(school.classes)) {
        if (semClasses.includes(classId)) {
          return formatClassId(classId)
        }
      }
    }
  } catch {}
  return formatClassId(classId)
}

// ── classId 포맷 (동기, 패턴 기반) ───────────────────────────────
export function formatClassId(classId: string): string {
  // "advanced-6"      → "고급 6반"
  // "intermediate-3"  → "중급 3반"
  // "beginner-1"      → "초급 1반"
  // "grade2-3"        → "2급 3반"
  // "level30-6"       → "고급 6반" (30=고급, 20=중급, 10=초급)
  // "level2-3"        → "2급 3반"
  // "class-5"         → "5반"
  const parts = classId.split('-')
  const num   = parts[1] ?? ''

  if (parts[0] === 'class') return `${num}반`

  if (parts[0].startsWith('level')) {
    const code = parseInt(parts[0].replace('level', ''))
    if (code === 10) return `초급 ${num}반`
    if (code === 20) return `중급 ${num}반`
    if (code === 30) return `고급 ${num}반`
    return `${code}급 ${num}반`
  }

  if (parts[0].startsWith('grade')) {
    const g = parts[0].replace('grade', '')
    return `${g}급 ${num}반`
  }

  const level = LEVEL_LABEL[parts[0]]
  if (level) return `${level} ${num}반`

  return classId
}

// ── 동기 버전 (이미 캐시된 경우 또는 폴백) ───────────────────────
export function formatSchool(schoolId: string): string {
  // 캐시가 있으면 사용
  if (schoolCache) {
    const found = schoolCache.find(s => s.id === schoolId)
    if (found) return found.name
  }
  return SCHOOL_FALLBACK[schoolId] ?? schoolId
}

export function formatSemester(semester: string): string {
  if (SEMESTER_FALLBACK[semester]) return SEMESTER_FALLBACK[semester]
  const [year, season] = semester.split('-')
  if (year && season) return `20${year}년 ${SEASON_LABEL[season] ?? season}`
  return semester
}

export function formatClass(classId: string): string {
  return formatClassId(classId)
}

// ── 기타 유틸 ─────────────────────────────────────────────────────
export function generateAssignmentLabel(
  semester: string, classId: string, date: string, seq: number
) {
  return `${formatSemester(semester)}/${formatClass(classId)}/${date}/${seq}차`
}

export function formatDate(date: Date | undefined): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short'
  }).format(date)
}

export function timeAgo(date: Date | undefined): string {
  if (!date) return ''
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60)    return '방금 전'
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}