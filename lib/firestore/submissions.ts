// lib/firestore/submissions.ts
import {
  collection, addDoc, getDocs, query, where,
  updateDoc, doc, serverTimestamp, orderBy
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Submission, SubmissionStatus, FreeWriting } from '@/types/assignment'

export async function submitAssignment(data: Omit<Submission, 'id' | 'submittedAt'>) {
  const ref = await addDoc(collection(db, 'submissions'), {
    ...data,
    status: 'submitted' as SubmissionStatus,
    submittedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getSubmissionsByClass(classId: string): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    where('classId', '==', classId),
    orderBy('submittedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    submittedAt: d.data().submittedAt?.toDate?.() ?? new Date(),
  }) as Submission)
}

export async function getMySubmissions(studentUid: string): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    where('studentUid', '==', studentUid),
    orderBy('submittedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    submittedAt: d.data().submittedAt?.toDate?.() ?? new Date(),
  }) as Submission)
}

export async function updateSubmissionStatus(id: string, status: SubmissionStatus) {
  await updateDoc(doc(db, 'submissions', id), { status })
}

export async function submitFreeWriting(data: Omit<FreeWriting, 'id' | 'submittedAt'>) {
  const ref = await addDoc(collection(db, 'freeWritings'), {
    ...data,
    status: 'pending_approval',
    submittedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getFreeWritingsByClass(classId: string): Promise<FreeWriting[]> {
  const q = query(
    collection(db, 'freeWritings'),
    where('classId', '==', classId),
    orderBy('submittedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    submittedAt: d.data().submittedAt?.toDate?.() ?? new Date(),
  }) as FreeWriting)
}