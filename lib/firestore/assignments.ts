// lib/firestore/assignments.ts
import {
  collection, addDoc, getDocs, query, where,
  orderBy, updateDoc, doc, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Assignment } from '@/types/assignment'

export async function createAssignment(data: Omit<Assignment, 'id' | 'createdAt'>) {
  const ref = await addDoc(collection(db, 'assignments'), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAssignmentsByClass(classId: string): Promise<Assignment[]> {
  const q = query(
    collection(db, 'assignments'),
    where('classId', '==', classId),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    dueDate:   d.data().dueDate?.toDate?.()   ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  }) as Assignment)
}

export async function deactivateAssignment(id: string) {
  await updateDoc(doc(db, 'assignments', id), { isActive: false })
}