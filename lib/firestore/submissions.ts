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

// 특정 과제에 대한 한 학생의 모든 제출(시도) 조회 — 최대 제출 횟수 체크 + 선생님이 전부 검토하는 데 사용
export async function getSubmissionsForAssignment(
  assignmentId: string, studentUid: string
): Promise<Submission[]> {
  const q = query(
    collection(db, 'submissions'),
    where('assignmentId', '==', assignmentId),
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

// 학생 본인의 자유작문 목록 (피드백 확인 버튼 표시용)
export async function getMyFreeWritings(studentUid: string): Promise<FreeWriting[]> {
  const q = query(
    collection(db, 'freeWritings'),
    where('studentUid', '==', studentUid),
    orderBy('submittedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    submittedAt: d.data().submittedAt?.toDate?.() ?? new Date(),
  }) as FreeWriting)
}

// 자유작문 상태 변경 (submissions와 컬렉션이 달라서 별도 함수 필요)
export async function updateFreeWritingStatus(id: string, status: FreeWriting['status']) {
  await updateDoc(doc(db, 'freeWritings', id), { status })
}