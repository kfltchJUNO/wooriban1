// 📁 app/api/research/apply/route.ts
// 구글폼 제출 시 Google Apps Script가 이 엔드포인트를 호출해서
// 응답을 Firestore 'researchApplicants' 컬렉션에 자동 기록함.
// (Apps Script 설정 방법은 하단 주석 참고)
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/firebase/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

// Apps Script와 공유하는 비밀키 — 아무나 이 API를 호출하지 못하게 막는 최소한의 보호장치
// Vercel 환경변수에 RESEARCH_WEBHOOK_SECRET 설정 필요
const WEBHOOK_SECRET = process.env.RESEARCH_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { secret, nameEn, nameKr, schoolId, classId, email, consent, nationality, motherTongue } = body

    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 })
    }
    if (!nameEn) {
      return NextResponse.json({ error: '필수 항목 누락 (nameEn)' }, { status: 400 })
    }

    await adminDb.collection('researchApplicants').add({
      nameEn:        String(nameEn).trim().toUpperCase(),
      nameKr:        nameKr ?? '',
      schoolId:      schoolId ?? '',
      classId:       classId ?? '',
      email:         email ?? '',
      consent:       consent === true || consent === 'true' || consent === '동의합니다',
      nationality:   nationality ?? '',
      motherTongue:  motherTongue ?? '',
      status:        'pending',   // 'pending' | 'matched' | 'rejected'
      matchedUid:    null,
      submittedAt:   FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Research applicant webhook error:', e)
    return NextResponse.json({ error: '처리 실패' }, { status: 500 })
  }
}

/*
── Google Apps Script 설정 방법 ───────────────────────────────────

1. 구글폼 → 우측 상단 점 3개 → 스크립트 편집기 열기
2. 아래 코드 붙여넣기:

function onFormSubmit(e) {
  var responses = e.namedValues;
  var payload = {
    secret:       '6mps0bxfzogviw2tn39ecj4r871k5auy',
    nameEn:       responses['우리반 앱 가입 시 사용한 여권 영문명'] ? responses['...'][0] : '',
    schoolId:     responses['소속 학교'] ? responses['소속 학교'][0] : '',
    classId:      responses['현재 수강 중인 반(급수)'] ? responses['...'][0] : '',
    email:        responses['이메일'] ? responses['이메일'][0] : '',
    consent:      responses['본인의 우리반 학습 데이터...'] ? responses['...'][0] : '',
    nationality:  responses['국적'] ? responses['국적'][0] : '',
    motherTongue: responses['모국어'] ? responses['모국어'][0] : '',
  };

  UrlFetchApp.fetch('https://wooriban-app.vercel.app/api/research/apply', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });
}

3. 왼쪽 시계 아이콘(트리거) → 트리거 추가
   → 실행할 함수: onFormSubmit
   → 이벤트 소스: 스프레드시트에서(또는 양식에서)
   → 이벤트 유형: 양식 제출 시
4. 저장하면 이후 모든 응답이 자동으로 Firestore에 쌓임

※ responses['질문 제목']의 '질문 제목'은 실제 구글폼 문항 제목과 정확히 일치해야 함
*/