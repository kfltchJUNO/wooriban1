// lib/firestore/feedback.ts
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { Feedback } from '@/types/feedback'

// ⚠️ feedback 문서 ID는 submissionId와 동일하게 고정됨(/api/feedback route에서 설정).
// 쿼리(where) 대신 getDoc()을 쓰는 이유: Firestore 보안 규칙이
// isOwner(resource.data.studentUid)를 요구하는데, 쿼리에 studentUid 필터가 없으면
// 규칙 엔진이 "모든 결과가 규칙을 통과할지" 사전에 증명 못 해서 쿼리 자체를 차단함.
// getDoc은 문서 하나를 직접 지정해서 읽으므로 이 문제가 없음.
export async function getFeedbackBySubmission(submissionId: string): Promise<Feedback | null> {
  try {
    const snap = await getDoc(doc(db, 'feedback', submissionId))
    if (!snap.exists()) return null
    const data = snap.data()
    return {
      id: snap.id,
      ...data,
      aiFeedback: {
        ...data.aiFeedback,
        generatedAt: data.aiFeedback?.generatedAt?.toDate?.() ?? new Date(),
      },
      sentAt:    data.sentAt?.toDate?.() ?? undefined,
      auditedAt: data.auditedAt?.toDate?.() ?? undefined,
    } as Feedback
  } catch (e) {
    // 규칙 평가 오류 등 예상치 못한 실패는 "아직 피드백 없음"으로 처리해서
    // 화면이 깨지거나 콘솔에 처리되지 않은 예외가 남지 않게 함
    console.error('[getFeedbackBySubmission] 조회 실패:', e)
    return null
  }
}

// 선생님이 검토 후 승인 + 코멘트와 함께 전송
export async function approveFeedback(feedbackId: string, teacherComment: string): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), {
    teacherComment,
    teacherApproved: true,
    sentAt: serverTimestamp(),
  })
}

// 학생이 피드백을 확인하면 호출 — submissions/freeWritings 중 어느 컬렉션인지에 따라
// 해당 문서의 status를 'read'로 갱신 (sourceCollection 기본값은 기존 과제 제출용)
export async function markFeedbackRead(
  submissionId: string,
  sourceCollection: 'submissions' | 'freeWritings' = 'submissions',
): Promise<void> {
  await updateDoc(doc(db, sourceCollection, submissionId), { status: 'read' })
}