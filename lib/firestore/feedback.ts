// lib/firestore/feedback.ts
import {
  collection, addDoc, getDocs, query, where,
  updateDoc, doc, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Feedback } from '@/types/feedback'

export async function saveFeedback(data: Omit<Feedback, 'id'>) {
  const ref = await addDoc(collection(db, 'feedback'), { ...data })
  return ref.id
}

export async function getFeedbackByStudent(studentUid: string): Promise<Feedback[]> {
  const q = query(
    collection(db, 'feedback'),
    where('studentUid', '==', studentUid),
    where('teacherApproved', '==', true)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Feedback)
}

export async function getFeedbackBySubmission(submissionId: string): Promise<Feedback | null> {
  const q = query(
    collection(db, 'feedback'),
    where('submissionId', '==', submissionId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Feedback
}

export async function approveFeedback(feedbackId: string, teacherComment: string) {
  await updateDoc(doc(db, 'feedback', feedbackId), {
    teacherComment,
    teacherApproved: true,
    sentAt: serverTimestamp(),
  })
}

export async function markFeedbackRead(submissionId: string) {
  await updateDoc(doc(db, 'submissions', submissionId), { status: 'read' })
}