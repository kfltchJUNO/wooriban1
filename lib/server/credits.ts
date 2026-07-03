// lib/server/credits.ts (우리반)
// 분필 차감/환불 — 쌤툴 credits.ts와 동일 로직, wooriban1 users/{uid}.chalk 공유
// ※ 현재 우리반은 무료 운영 중. QUIZ_CHALK_COST=0이면 이 모듈은 호출되지 않음.
import { adminDb } from '@/firebase/firebaseAdmin'
import { FieldValue, Timestamp, Transaction } from 'firebase-admin/firestore'

export class InsufficientCreditsError extends Error {
  constructor() { super('INSUFFICIENT_CREDITS') }
}

type ChalkEvent = {
  amount:    number
  expiresAt: Timestamp
  reason?:   string
}

export async function deductCredits(uid: string, amount: number, reason: string) {
  const userRef = adminDb.collection('users').doc(uid)

  return adminDb.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) throw new Error('USER_NOT_FOUND')
    const data = snap.data()!
    const now  = Timestamp.now()

    const chalkEvents: ChalkEvent[] = data.chalkEvents || []
    const validEventBalance = chalkEvents.reduce((sum, e) => {
      const isValid = e.expiresAt && e.expiresAt.toMillis() > now.toMillis()
      return isValid ? sum + Math.max(0, e.amount || 0) : sum
    }, 0)
    const permanentBalance = data.chalk || 0
    if (validEventBalance + permanentBalance < amount) {
      throw new InsufficientCreditsError()
    }

    let remaining = amount
    const updatedEvents = chalkEvents
      .map(e => {
        if (remaining <= 0) return e
        const isValid = e.expiresAt && e.expiresAt.toMillis() > now.toMillis()
        if (!isValid) return e
        const available = Math.max(0, e.amount || 0)
        if (available <= 0) return e
        const take = Math.min(available, remaining)
        remaining -= take
        return { ...e, amount: available - take }
      })
      .filter(e => e.amount > 0 || (e.expiresAt && e.expiresAt.toMillis() <= now.toMillis()))

    const updates: Record<string, unknown> = { chalkEvents: updatedEvents }
    if (remaining > 0) updates.chalk = FieldValue.increment(-remaining)
    tx.update(userRef, updates)

    const logRef = adminDb.collection('chalkLogs').doc()
    tx.set(logRef, {
      uid, amount: -amount, reason, app: 'wooriban',
      createdAt: FieldValue.serverTimestamp(),
    })

    return { spent: amount }
  })
}

export async function refundCredits(uid: string, amount: number, reason: string) {
  const userRef = adminDb.collection('users').doc(uid)
  await userRef.update({ chalk: FieldValue.increment(amount) })
  await adminDb.collection('chalkLogs').add({
    uid, amount, reason: `환불: ${reason}`, app: 'wooriban',
    createdAt: FieldValue.serverTimestamp(),
  })
}