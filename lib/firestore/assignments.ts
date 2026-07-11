// lib/firestore/assignments.ts
import {
  collection, addDoc, getDocs, query, where,
  orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Assignment } from '@/types/assignment'

export async function createAssignment(data: Omit<Assignment, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'assignments'), {
    ...data,
    dueDate:   data.dueDate,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAssignmentsByClass(classId: string): Promise<Assignment[]> {
  const q = query(
    collection(db, 'assignments'),
    where('classId', '==', classId),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      dueDate:   data.dueDate?.toDate?.() ?? new Date(data.dueDate),
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    } as Assignment
  })
}