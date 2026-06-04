// 📁 lib/firestore/textbooks.ts

import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Textbook, TextbookUnit, AssignedClass, TextbookStatus } from '@/types/textbook'

// ── 교재 ──────────────────────────────────────

export async function createTextbook(data: Omit<Textbook, 'id' | 'uploadedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'textbooks'), {
    ...data,
    uploadedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getTextbook(id: string): Promise<Textbook | null> {
  const snap = await getDoc(doc(db, 'textbooks', id))
  if (!snap.exists()) return null
  const d = snap.data()
  return { ...d, id: snap.id, uploadedAt: d.uploadedAt?.toDate?.() ?? new Date() } as Textbook
}

export async function getAllTextbooks(): Promise<Textbook[]> {
  const snap = await getDocs(query(collection(db, 'textbooks'), orderBy('uploadedAt', 'desc')))
  return snap.docs.map(d => ({
    ...d.data(), id: d.id,
    uploadedAt: d.data().uploadedAt?.toDate?.() ?? new Date()
  }) as Textbook)
}

// 특정 반에 배정된 교재 가져오기 (학생/교사용)
export async function getTextbooksByClass(schoolId: string, semester: string, classId: string): Promise<Textbook[]> {
  const all = await getAllTextbooks()
  return all.filter(tb =>
    tb.status === 'ready' &&
    tb.assignedClasses?.some(
      ac => ac.schoolId === schoolId && ac.semester === semester && ac.classId === classId
    )
  )
}

export async function updateTextbookStatus(id: string, status: TextbookStatus) {
  await updateDoc(doc(db, 'textbooks', id), { status })
}

export async function updateTextbookUnitCount(id: string, unitCount: number) {
  await updateDoc(doc(db, 'textbooks', id), { unitCount, status: 'ready' })
}

// 반 배정 업데이트
export async function updateAssignedClasses(id: string, assignedClasses: AssignedClass[]) {
  await updateDoc(doc(db, 'textbooks', id), { assignedClasses })
}

export async function deleteTextbook(id: string) {
  // units 서브컬렉션은 별도 삭제 (Cloud Functions 권장, 여기선 클라이언트에서 처리)
  await deleteDoc(doc(db, 'textbooks', id))
}

// ── 과(Unit) ──────────────────────────────────

export async function saveUnit(textbookId: string, unit: Omit<TextbookUnit, 'id' | 'parsedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'textbooks', textbookId, 'units'), {
    ...unit,
    parsedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getUnits(textbookId: string): Promise<TextbookUnit[]> {
  const snap = await getDocs(
    query(collection(db, 'textbooks', textbookId, 'units'), orderBy('unitNumber', 'asc'))
  )
  return snap.docs.map(d => ({
    ...d.data(), id: d.id,
    parsedAt: d.data().parsedAt?.toDate?.() ?? new Date()
  }) as TextbookUnit)
}

export async function getUnit(textbookId: string, unitId: string): Promise<TextbookUnit | null> {
  const snap = await getDoc(doc(db, 'textbooks', textbookId, 'units', unitId))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id, parsedAt: snap.data().parsedAt?.toDate?.() ?? new Date() } as TextbookUnit
}

// 교사/관리자가 파싱 결과 수동 수정
export async function updateUnit(textbookId: string, unitId: string, data: Partial<TextbookUnit>) {
  await updateDoc(doc(db, 'textbooks', textbookId, 'units', unitId), {
    ...data,
    manuallyEdited: true,
  })
}