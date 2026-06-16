// lib/firestore/textbooks.ts
import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Textbook, TextbookUnit, AssignedClass } from '@/types/textbook'

export async function getAllTextbooks(): Promise<Textbook[]> {
  const snap = await getDocs(query(collection(db, 'textbooks'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Textbook))
}

export async function getTextbook(id: string): Promise<Textbook | null> {
  const snap = await getDoc(doc(db, 'textbooks', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Textbook) : null
}

export async function createTextbook(data: Omit<Textbook, 'id'>) {
  return addDoc(collection(db, 'textbooks'), { ...data, createdAt: serverTimestamp() })
}

export async function updateAssignedClasses(id: string, classes: AssignedClass[]) {
  return updateDoc(doc(db, 'textbooks', id), { assignedClasses: classes })
}

export async function updateTextbookStatus(id: string, status: string, extra?: Record<string, unknown>) {
  return updateDoc(doc(db, 'textbooks', id), { status, ...extra })
}

// ── 교재 삭제 (Firestore 문서 + 하위 units 삭제) ─────────────────
export async function deleteTextbook(id: string) {
  // 하위 units 먼저 삭제
  const unitsSnap = await getDocs(collection(db, 'textbooks', id, 'units'))
  await Promise.all(unitsSnap.docs.map(d => deleteDoc(d.ref)))
  // 교재 문서 삭제
  await deleteDoc(doc(db, 'textbooks', id))
}

// ── units ─────────────────────────────────────────────────────────
export async function getUnits(textbookId: string): Promise<TextbookUnit[]> {
  const snap = await getDocs(
    query(collection(db, 'textbooks', textbookId, 'units'), orderBy('unitNumber', 'asc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TextbookUnit))
}

export async function updateUnit(
  textbookId: string,
  unitId: string,
  data: Partial<TextbookUnit>
) {
  return updateDoc(doc(db, 'textbooks', textbookId, 'units', unitId), {
    ...data,
    manuallyEdited: true,
  })
}