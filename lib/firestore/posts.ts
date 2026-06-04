// lib/firestore/posts.ts
import {
  collection, addDoc, getDocs, query, where, orderBy,
  updateDoc, deleteDoc, doc, arrayUnion, arrayRemove, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { BoardPost, Comment } from '@/types/post'

export async function createPost(data: Omit<BoardPost, 'id' | 'createdAt' | 'reactions'>) {
  const ref = await addDoc(collection(db, 'posts'), {
    ...data,
    reactions: {},
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getPostsByClass(classId: string): Promise<BoardPost[]> {
  const q = query(
    collection(db, 'posts'),
    where('classId', '==', classId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  }) as BoardPost)
}

export async function toggleReaction(
  postId: string, emoji: string, uid: string, hasReacted: boolean
) {
  await updateDoc(doc(db, 'posts', postId), {
    [`reactions.${emoji}`]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
  })
}

export async function deletePost(postId: string) {
  await deleteDoc(doc(db, 'posts', postId))
}

export async function addComment(
  postId: string, data: Omit<Comment, 'id' | 'createdAt'>
) {
  await addDoc(collection(db, 'posts', postId, 'comments'), {
    ...data,
    createdAt: serverTimestamp(),
  })
}