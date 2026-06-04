// 📁 firebase/firebaseAdmin.ts  ← 수정: Storage 추가

import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: `${process.env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com`,
  })
}

export const adminDb      = admin.firestore()
export const adminAuth    = admin.auth()
export const adminStorage = admin.storage()
export default admin