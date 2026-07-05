// 📁 app/api/analysis/errors/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

// 모델 폴백 (다른 라우트와 동일 원칙 — gemini-2.0-flash는 지원 종료됨)
const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3-flash',
  'gemini-3.5-flash',
]
let modelIdx = 0
const getModel = () => MODELS[modelIdx % MODELS.length]

async function generateWithRetry(prompt: string, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      console.log(`[ErrorAnalysis Gemini] 시도 ${i + 1}/${maxRetries} - 모델: ${currentModel}`)
      const genAI = new GoogleGenerativeAI(getKey())
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      })
      const result = await model.generateContent(prompt)
      const text   = result.response.text()
      const trimmed = text.replace(/```json|```/g, '').trim()
      if (!trimmed.endsWith('}')) {
        modelIdx++
        if (i === maxRetries - 1) throw new Error('응답 잘림')
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
        continue
      }
      console.log(`[ErrorAnalysis Gemini] 성공 - 모델: ${currentModel}`)
      return trimmed
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      const isRetryable = status === 503 || status === 429 || status === 500 || status === 404
      modelIdx++
      if (!isRetryable || i === maxRetries - 1) throw e
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
    }
  }
  throw new Error('모든 모델 호출 실패')
}

export async function POST(req: NextRequest) {
  try {
    const { classId, unitId, textbookId } = await req.json()
    if (!classId || !unitId || !textbookId) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    // ⚠️ 수정: 기존엔 classId만으로 그 반의 '모든' 제출물을 긁어와서
    // 선택한 단원과 무관한 피드백까지 섞여 들어가는 버그가 있었음.
    // feedback 문서에 classId/textbookId/unitId가 저장되므로 직접 정확히 필터링.
    const feedbackSnap = await adminDb
      .collection('feedback')
      .where('classId',        '==', classId)
      .where('textbookId',     '==', textbookId)
      .where('unitId',         '==', unitId)
      .where('teacherApproved','==', true)
      .get()

    if (feedbackSnap.empty) {
      return NextResponse.json(
        { error: '분석할 피드백 데이터가 없어요. 선생님이 검토·전송한 피드백만 분석 대상이에요.' },
        { status: 404 }
      )
    }

    const feedbackTexts: string[] = []
    feedbackSnap.docs.forEach(d => {
      const fb = d.data()
      if (fb.aiFeedback?.grammar)    feedbackTexts.push(`[문법] ${fb.aiFeedback.grammar}`)
      if (fb.aiFeedback?.vocabulary) feedbackTexts.push(`[어휘] ${fb.aiFeedback.vocabulary}`)
    })

    if (feedbackTexts.length === 0) {
      return NextResponse.json({ error: '분석할 피드백 데이터가 없어요' }, { status: 404 })
    }

    const unitSnap = await adminDb
      .collection('textbooks').doc(textbookId)
      .collection('units').doc(unitId).get()
    const unitTitle = unitSnap.data()?.title ?? '해당 단원'

    // 번호를 매겨서 전달 — 모델이 카운트를 더 근거 있게 세도록 유도
    const numberedList = feedbackTexts
      .slice(0, 30)
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n')

    const prompt = `
다음은 "${unitTitle}" 단원 학생 작문에 대한 AI 피드백 목록이야 (총 ${feedbackTexts.length}개, 번호 매김).
공통적으로 반복되는 오류 패턴을 분석해서 JSON으로만 응답해.

⚠️ count는 반드시 실제로 몇 번 항목(1~${Math.min(feedbackTexts.length, 30)}번)에서 해당 오류가
언급됐는지 정확히 세어서 적어줘. 추측하지 말고 목록을 다시 확인해서 세.

피드백 목록:
${numberedList}

형식:
{
  "patterns": [
    {
      "category": "문법",
      "description": "V-거니와를 격식체에 오용 (예: 비었거니와 X)",
      "count": 5,
      "examples": ["비었거니와 차라리 걸어가는 게 낫겠어요.", "좋았거니와 그냥 뒤는 것도 괜찮아요."],
      "suggestion": "V-거니와는 동사 어간에만 결합함을 다시 강조. 격식체에서는 '-기도 하고' 사용 유도"
    },
    {
      "category": "어휘",
      "description": "뉘앙스 관련 동사 오용 (받다/느끼다/인식하다 구분 안 됨)",
      "count": 7,
      "examples": ["뉘앙스를 만들었어요.", "뉘앙스를 없애줬어요."],
      "suggestion": "'뉘앙스를 받다/풍기다/인식하다' 3단계 흐름으로 재정리"
    }
  ]
}`.trim()

    const text = await generateWithRetry(prompt)
    let patterns: unknown[] = []
    try {
      patterns = JSON.parse(text).patterns ?? []
    } catch {
      console.error('오류 분석 JSON 파싱 실패:', text.slice(0, 300))
      return NextResponse.json({ error: '분석 결과를 해석하지 못했어요' }, { status: 502 })
    }

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