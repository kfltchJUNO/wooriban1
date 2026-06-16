// 📁 firebase/firebaseAdmin.ts

import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    // ← .appspot.com → .firebasestorage.app 으로 변경
    storageBucket: `${process.env.FIREBASE_ADMIN_PROJECT_ID}.firebasestorage.app`,
  })
}

export const adminDb      = admin.firestore()
export const adminAuth    = admin.auth()
export const adminStorage = admin.storage()
export default admin