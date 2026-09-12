// app/api/join/teacher/validate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/firebase/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')?.trim().toUpperCase()

    if (!code) {
      return NextResponse.json({ error: '선생님 초대 코드가 필요해요.' }, { status: 400 })
    }

    const snap = await adminDb.collection('teacherCodes').doc(code).get()
    if (!snap.exists) {
      return NextResponse.json({ error: '존재하지 않는 선생님 코드예요.' }, { status: 404 })
    }

    const data = snap.data()!
    if (data.used) {
      return NextResponse.json({ error: '이미 사용된 선생님 코드예요.' }, { status: 400 })
    }

    return NextResponse.json({
      info: {
        code:          data.code,
        schoolId:      data.schoolId,
        schoolLabel:   data.schoolLabel,
        semester:      data.semester,
        semesterLabel: data.semesterLabel,
        classId:       data.classId,
        classLabel:    data.classLabel,
        teacherNo:     data.teacherNo,
      }
    })
  } catch (e: unknown) {
    console.error('[API join/teacher/validate error]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `선생님 코드 확인 실패: ${msg}` }, { status: 500 })
  }
}
