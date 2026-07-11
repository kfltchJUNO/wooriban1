// lib/firestore/research.ts
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, where, orderBy, serverTimestamp, arrayUnion,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import {
  ResearchAssignment, ResearchSubmission, ResearchFeedback, ResearchThread,
} from '@/types/research'

// ── 연구 과제 ─────────────────────────────────────────────────────
export async function createResearchAssignment(
  data: Omit<ResearchAssignment, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'researchAssignments'), {
    ...data, createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getActiveResearchAssignments(): Promise<ResearchAssignment[]> {
  const q = query(
    collection(db, 'researchAssignments'),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  }) as ResearchAssignment)
}

export async function getAllResearchAssignments(): Promise<ResearchAssignment[]> {
  const q = query(collection(db, 'researchAssignments'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  }) as ResearchAssignment)
}

// ── 제출 ──────────────────────────────────────────────────────────
export async function submitResearchArgument(
  data: Omit<ResearchSubmission, 'id' | 'submittedAt' | 'status'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'researchSubmissions'), {
    ...data, status: 'submitted', submittedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getMyResearchSubmissions(studentUid: string): Promise<ResearchSubmission[]> {
  const q = query(
    collection(db, 'researchSubmissions'),
    where('studentUid', '==', studentUid),
    orderBy('submittedAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    submittedAt: d.data().submittedAt?.toDate?.() ?? new Date(),
  }) as ResearchSubmission)
}

export async function getResearchSubmissionsForAssignment(assignmentId: string): Promise<ResearchSubmission[]> {
  const q = query(
    collection(db, 'researchSubmissions'),
    where('assignmentId', '==', assignmentId),
    orderBy('submittedAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    submittedAt: d.data().submittedAt?.toDate?.() ?? new Date(),
  }) as ResearchSubmission)
}

// ── 피드백 (문서 ID = submissionId, null-안전 규칙과 함께 사용) ──
export async function getResearchFeedback(submissionId: string): Promise<ResearchFeedback | null> {
  try {
    const snap = await getDoc(doc(db, 'researchFeedback', submissionId))
    if (!snap.exists()) return null
    const d = snap.data()
    return { id: snap.id, ...d, generatedAt: d.generatedAt?.toDate?.() ?? new Date() } as ResearchFeedback
  } catch (e) {
    console.error('[getResearchFeedback] 조회 실패:', e)
    return null
  }
}

// ── 대화 스레드 (논증 품질 트랙 전용, 학생 최대 2턴) ──────────────
export async function getResearchThread(submissionId: string): Promise<ResearchThread | null> {
  try {
    const snap = await getDoc(doc(db, 'researchThreads', submissionId))
    if (!snap.exists()) return null
    const d = snap.data()
    return {
      ...d,
      messages: (d.messages ?? []).map((m: { role: string; text: string; createdAt?: { toDate?: () => Date } }) => ({
        ...m,
        createdAt: m.createdAt?.toDate?.() ?? new Date(),
      })),
    } as ResearchThread
  } catch (e) {
    console.error('[getResearchThread] 조회 실패:', e)
    return null
  }
}

// 학생이 메시지를 보내는 것은 클라이언트에서 직접 쓰지 않고
// /api/research/feedback/reply 서버 라우트를 통해서만 처리 (AI 응답까지 한 번에 생성)
export async function appendStudentMessageLocal(submissionId: string, text: string) {
  await updateDoc(doc(db, 'researchThreads', submissionId), {
    messages: arrayUnion({ role: 'student', text, createdAt: new Date() }),
  })
}