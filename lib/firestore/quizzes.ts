// 📁 lib/firestore/quizzes.ts

import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Quiz, QuizAttempt, ErrorPattern } from '@/types/quiz'

// ── 퀴즈 ──────────────────────────────────────

export async function createQuiz(data: Omit<Quiz, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'quizzes'), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  const snap = await getDoc(doc(db, 'quizzes', id))
  if (!snap.exists()) return null
  const d = snap.data()
  return { ...d, id: snap.id, createdAt: d.createdAt?.toDate?.() ?? new Date() } as Quiz
}

// 교사용: 내가 만든 퀴즈 목록
export async function getQuizzesByTeacher(teacherUid: string): Promise<Quiz[]> {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('createdBy', '==', teacherUid), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => ({
    ...d.data(), id: d.id,
    createdAt: d.data().createdAt?.toDate?.() ?? new Date()
  }) as Quiz)
}

// 학생용: 내 반에 배포된 퀴즈
export async function getPublishedQuizzesByClass(
  schoolId: string, semester: string, classId: string
): Promise<Quiz[]> {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('isPublished', '==', true), orderBy('createdAt', 'desc'))
  )
  const all = snap.docs.map(d => ({
    ...d.data(), id: d.id,
    createdAt: d.data().createdAt?.toDate?.() ?? new Date()
  }) as Quiz)
  return all.filter(q =>
    q.assignedClasses?.some(
      ac => ac.schoolId === schoolId && ac.semester === semester && ac.classId === classId
    )
  )
}

export async function publishQuiz(id: string) {
  await updateDoc(doc(db, 'quizzes', id), { isPublished: true })
}

export async function unpublishQuiz(id: string) {
  await updateDoc(doc(db, 'quizzes', id), { isPublished: false })
}

export async function updateQuiz(id: string, data: Partial<Quiz>) {
  await updateDoc(doc(db, 'quizzes', id), data)
}

// ── 응시 기록 ──────────────────────────────────

export async function saveAttempt(data: Omit<QuizAttempt, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'quizAttempts'), {
    ...data,
    completedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getMyAttempts(studentUid: string): Promise<QuizAttempt[]> {
  const snap = await getDocs(
    query(collection(db, 'quizAttempts'), where('studentUid', '==', studentUid), orderBy('completedAt', 'desc'))
  )
  return snap.docs.map(d => ({
    ...d.data(), id: d.id,
    completedAt: d.data().completedAt?.toDate?.() ?? new Date()
  }) as QuizAttempt)
}

export async function getAttemptsByQuiz(quizId: string): Promise<QuizAttempt[]> {
  const snap = await getDocs(
    query(collection(db, 'quizAttempts'), where('quizId', '==', quizId))
  )
  return snap.docs.map(d => ({
    ...d.data(), id: d.id,
    completedAt: d.data().completedAt?.toDate?.() ?? new Date()
  }) as QuizAttempt)
}

// ── 오류 패턴 ──────────────────────────────────

export async function saveErrorPattern(data: Omit<ErrorPattern, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'errorPatterns'), {
    ...data,
    analyzedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getErrorPattern(classId: string, unitId: string): Promise<ErrorPattern | null> {
  const snap = await getDocs(
    query(collection(db, 'errorPatterns'), where('classId', '==', classId), where('unitId', '==', unitId))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...d.data(), id: d.id, analyzedAt: d.data().analyzedAt?.toDate?.() ?? new Date() } as ErrorPattern
}