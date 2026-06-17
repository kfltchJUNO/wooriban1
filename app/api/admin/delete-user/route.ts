// app/api/admin/delete-user/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/firebase/firebaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json()
    if (!uid) return NextResponse.json({ error: 'uid 필요' }, { status: 400 })

    // 요청자가 admin인지 서버에서 검증
    const authHeader = req.headers.get('Authorization') ?? ''
    const token      = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token)
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get()
    const callerRole = callerSnap.data()?.role

    if (callerRole !== 'admin' && decoded.email !== 'ot.helper7@gmail.com') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    // Firebase Auth에서 삭제
    await adminAuth.deleteUser(uid)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Delete user error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}