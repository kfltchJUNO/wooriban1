// 📁 app/api/analysis/errors/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

export async function POST(req: NextRequest) {
  try {
    const { classId, unitId, textbookId } = await req.json()
    if (!classId || !unitId || !textbookId) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    // 1. 해당 반 + 과 관련 제출물 수집
    const submissionsSnap = await adminDb
      .collection('submissions')
      .where('classId', '==', classId)
      .get()

    if (submissionsSnap.empty) {
      return NextResponse.json({ error: '제출물이 없어요' }, { status: 404 })
    }

    // 2. 각 제출물의 AI 피드백에서 문법/어휘 오류 수집
    const feedbackTexts: string[] = []
    for (const subDoc of submissionsSnap.docs) {
      const fbSnap = await adminDb
        .collection('feedback')
        .where('submissionId', '==', subDoc.id)
        .where('teacherApproved', '==', true)
        .get()
      if (!fbSnap.empty) {
        const fb = fbSnap.docs[0].data()
        if (fb.aiFeedback?.grammar)    feedbackTexts.push(`[문법] ${fb.aiFeedback.grammar}`)
        if (fb.aiFeedback?.vocabulary) feedbackTexts.push(`[어휘] ${fb.aiFeedback.vocabulary}`)
      }
    }

    if (feedbackTexts.length === 0) {
      return NextResponse.json({ error: '분석할 피드백 데이터가 없어요' }, { status: 404 })
    }

    // 3. 단원 정보 가져오기
    const unitSnap = await adminDb
      .collection('textbooks').doc(textbookId)
      .collection('units').doc(unitId).get()
    const unitTitle = unitSnap.data()?.title ?? '해당 단원'

    // 4. Gemini로 오류 패턴 분석
    const genAI  = new GoogleGenerativeAI(getKey())
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `
다음은 ${unitTitle} 단원 학생 작문에 대한 AI 피드백 목록이야 (총 ${feedbackTexts.length}개).
공통적으로 자주 나타나는 오류 패턴을 분석해서 JSON으로만 응답해:

피드백 목록:
${feedbackTexts.slice(0, 30).join('\n')}

형식:
{
  "patterns": [
    {
      "category": "문법",
      "description": "V-느니를 형용사에 잘못 적용 (예: 비싸느니 X)",
      "count": 5,
      "examples": ["비싸느니 차라리 안 사겠어요.", "좋으느니 그냥 쓰는 게 나아요."],
      "suggestion": "V-느니는 동사 어간에만 결합함을 다시 강조. 형용사에는 '-기보다' 사용 유도"
    },
    {
      "category": "어휘",
      "description": "스트레스 관련 동사 혼용 (받다/풀다/해소하다 구분 안 됨)",
      "count": 7,
      "examples": ["스트레스를 만들었어요.", "스트레스를 없앴어요."],
      "suggestion": "'스트레스를 받다 → 쌓이다 → 해소하다' 3단계 흐름으로 재정리"
    }
  ]
}
`.trim()

    const result   = await model.generateContent(prompt)
    const text     = result.response.text().replace(/```json|```/g, '').trim()
    const { patterns } = JSON.parse(text)

    // 5. Firestore에 저장
    await adminDb.collection('errorPatterns').add({
      classId, unitId, textbookId, patterns,
      analyzedAt: new Date(),
    })

    return NextResponse.json({ success: true, patterns })
  } catch (e) {
    console.error('Error analysis failed:', e)
    return NextResponse.json({ error: '오류 분석 실패' }, { status: 500 })
  }
}