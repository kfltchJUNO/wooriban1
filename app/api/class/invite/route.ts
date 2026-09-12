// app/api/class/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/firebase/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { formatSchool, formatSemester, formatClass } from '@/lib/utils/classUtils'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
    }

    const decoded = await adminAuth.verifyIdToken(token)
    const teacherUid = decoded.uid

    const body = await req.json().catch(() => ({}))
    const { schoolId, semester, classId } = body as {
      schoolId?: string
      semester?: string
      classId?: string
    }

    if (!schoolId || !semester || !classId) {
      return NextResponse.json({
        error: '선생님의 학교, 학기, 반 정보가 설정되어 있지 않아요. 관리자에게 문의해주세요.',
      }, { status: 400 })
    }

    // 문서 ID: schoolId_semester_classId
    const docId = `${schoolId}_${semester}_${classId}`
    const ref   = adminDb.collection('classInvitations').doc(docId)
    const snap  = await ref.get()

    if (snap.exists) {
      const data = snap.data()!
      if (data.isActive !== false) {
        return NextResponse.json({ invitation: data })
      }
    }

    // 새 초대 코드 생성
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    const code = `INV-${schoolId.toUpperCase()}-${classId.toUpperCase()}-${randomSuffix}`

    const newInvitation = {
      code,
      schoolId,
      semester,
      classId,
      schoolLabel:   formatSchool(schoolId),
      semesterLabel: formatSemester(semester),
      classLabel:    formatClass(classId),
      createdBy:     teacherUid,
      isActive:      true,
      createdAt:     FieldValue.serverTimestamp(),
    }

    await ref.set(newInvitation)

    return NextResponse.json({ invitation: newInvitation })
  } catch (e: unknown) {
    console.error('[API class/invite error]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `초대 코드 생성 실패: ${msg}` }, { status: 500 })
  }
}
