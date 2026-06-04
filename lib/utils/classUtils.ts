// lib/utils/classUtils.ts
export const SEMESTER_LABELS: Record<string, string> = {
  '26-summer': '26-여름',
  '26-fall':   '26-가을',
  '27-spring': '27-봄',
  '27-summer': '27-여름',
}

export const CLASS_LABELS: Record<string, string> = {
  'advanced-6':     '고급 6반',
  'advanced-7':     '고급 7반',
  'intermediate-3': '중급 3반',
}

export const SCHOOL_LABELS: Record<string, string> = {
  'dankook': '단국대학교',
}

export function formatSemester(semester: string) {
  return SEMESTER_LABELS[semester] ?? semester
}

export function formatClass(classId: string) {
  return CLASS_LABELS[classId] ?? classId
}

export function formatSchool(schoolId: string) {
  return SCHOOL_LABELS[schoolId] ?? schoolId
}

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