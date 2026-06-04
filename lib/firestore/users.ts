// lib/firestore/users.ts
import {
  doc, setDoc, updateDoc, getDoc, getDocs,
  collection, query, where, orderBy, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { AppUser, UserStatus } from '@/types/user'

export async function createUser(uid: string, data: Omit<AppUser, 'uid' | 'createdAt'>) {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    uid,
    createdAt: serverTimestamp(),
  })
}

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const d = snap.data()
  return { ...d, uid, createdAt: d.createdAt?.toDate?.() ?? new Date() } as AppUser
}

export async function getUsersByClass(classId: string): Promise<AppUser[]> {
  const q = query(
    collection(db, 'users'),
    where('classId', '==', classId),
    where('status', '==', 'active'),
    orderBy('sortOrder', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date()
  }) as AppUser)
}

export async function getPendingUsers(): Promise<AppUser[]> {
  const q = query(collection(db, 'users'), where('status', '==', 'pending'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date()
  }) as AppUser)
}

export async function approveUser(uid: string, classId: string, sortOrder: number) {
  await updateDoc(doc(db, 'users', uid), {
    status: 'active' as UserStatus,
    classId,
    sortOrder
  })
}

export async function updateNickname(uid: string, nickname: string) {
  await updateDoc(doc(db, 'users', uid), { nickname })
}

export async function updateFreeWritingEnabled(uid: string, enabled: boolean) {
  await updateDoc(doc(db, 'users', uid), { freeWritingEnabled: enabled })
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => ({
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date()
  }) as AppUser)
}