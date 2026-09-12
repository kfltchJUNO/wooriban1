// app/api/join/validate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/firebase/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')?.trim()

    if (!code) {
      return NextResponse.json({ error: '초대 코드가 제공되지 않았어요.' }, { status: 400 })
    }

    const snap = await adminDb
      .collection('classInvitations')
      .where('code', '==', code)
      .where('isActive', '==', true)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 초대 코드예요.' }, { status: 404 })
    }

    const doc = snap.docs[0]
    const data = doc.data()

    return NextResponse.json({
      invitation: {
        code:          data.code,
        schoolId:      data.schoolId,
        semester:      data.semester,
        classId:       data.classId,
        schoolLabel:   data.schoolLabel,
        semesterLabel: data.semesterLabel,
        classLabel:    data.classLabel,
      },
    })
  } catch (e: unknown) {
    console.error('[API join/validate error]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `초대 코드 확인 실패: ${msg}` }, { status: 500 })
  }
}
