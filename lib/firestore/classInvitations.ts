// lib/firestore/classInvitations.ts
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, type Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

export interface ClassInvitation {
  code:          string        // 고유 초대 코드 (예: INV-DK-26SU-301)
  schoolId:      string
  semester:      string
  classId:       string
  schoolLabel:   string
  semesterLabel: string
  classLabel:    string
  createdBy:     string        // 교사 UID
  isActive:      boolean
  createdAt?:    Timestamp
}

/**
 * 특정 반의 초대 코드 생성 또는 기존 활성 코드 반환
 */
export async function getOrCreateClassInvitation(
  schoolId:  string,
  semester:  string,
  classId:   string,
  teacherUid: string,
): Promise<ClassInvitation> {
  // 문서 ID를 schoolId_semester_classId 로 통일하여 반당 1개 코드 유지
  const docId = `${schoolId}_${semester}_${classId}`
  const ref   = doc(db, 'classInvitations', docId)
  const snap  = await getDoc(ref)

  if (snap.exists()) {
    const data = snap.data() as ClassInvitation
    if (data.isActive !== false) {
      return data
    }
  }

  // 고유 코드 생성 (예: INV-DK-26SU-301 또는 6자리 랜덤 추가)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  const code = `INV-${schoolId.toUpperCase()}-${classId.toUpperCase()}-${randomSuffix}`

  const newInvitation: ClassInvitation = {
    code,
    schoolId,
    semester,
    classId,
    schoolLabel:   formatSchool(schoolId),
    semesterLabel: formatSemester(semester),
    classLabel:    formatClass(classId),
    createdBy:     teacherUid,
    isActive:      true,
  }

  // Firestore undefined 방지: serverTimestamp() 별도 전달
  await setDoc(ref, {
    ...newInvitation,
    createdAt: serverTimestamp(),
  })

  return newInvitation
}

/**
 * 초대 코드로 반 정보 조회 및 유효성 검사
 */
export async function validateClassInvitation(code: string): Promise<{
  valid: boolean
  invitation?: ClassInvitation
  error?: string
}> {
  if (!code || !code.trim()) {
    return { valid: false, error: '초대 코드가 제공되지 않았어요.' }
  }

  const q = query(
    collection(db, 'classInvitations'),
    where('code', '==', code.trim()),
    where('isActive', '==', true),
  )
  const snap = await getDocs(q)

  if (snap.empty) {
    return { valid: false, error: '유효하지 않거나 만료된 초대 코드예요.' }
  }

  const data = snap.docs[0].data() as ClassInvitation
  return { valid: true, invitation: data }
}
