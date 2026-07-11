// lib/firestore/settings.ts
// 관리자가 켜고 끌 수 있는 전역 설정들 (배포 없이 즉시 반영)
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'

export interface ResearchFormSettings {
  url:        string
  enabled:    boolean
  updatedAt?: unknown
  updatedBy?: string
}

const RESEARCH_FORM_DOC = ['settings', 'researchForm'] as const

export async function getResearchFormSettings(): Promise<ResearchFormSettings> {
  const snap = await getDoc(doc(db, ...RESEARCH_FORM_DOC))
  if (!snap.exists()) return { url: '', enabled: false }
  return snap.data() as ResearchFormSettings
}

export async function setResearchFormSettings(
  url: string, enabled: boolean, adminUid: string
): Promise<void> {
  await setDoc(doc(db, ...RESEARCH_FORM_DOC), {
    url, enabled,
    updatedAt: new Date(),
    updatedBy: adminUid,
  }, { merge: true })
}