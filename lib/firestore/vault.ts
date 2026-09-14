// lib/firestore/vault.ts
import {
  collection, doc, setDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { VaultItem } from '@/types/vault'

export async function addVaultItem(item: Omit<VaultItem, 'id' | 'createdAt'>): Promise<string> {
  const ref = doc(collection(db, 'vaultItems'))
  await setDoc(ref, {
    ...item,
    id: ref.id,
    mastered: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getVaultItemsByStudent(studentUid: string): Promise<VaultItem[]> {
  try {
    const q = query(
      collection(db, 'vaultItems'),
      where('studentUid', '==', studentUid),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => {
      const data = d.data()
      return {
        ...data,
        id: d.id,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
      } as VaultItem
    })
  } catch (e) {
    console.error('getVaultItemsByStudent error:', e)
    return []
  }
}

export async function toggleVaultItemMastered(id: string, mastered: boolean): Promise<void> {
  await updateDoc(doc(db, 'vaultItems', id), { mastered })
}

export async function deleteVaultItem(id: string): Promise<void> {
  await deleteDoc(doc(db, 'vaultItems', id))
}
