// 📁 app/api/quiz/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3-flash',
  'gemini-3.5-flash',
]
let modelIdx = 0
const getModel = () => MODELS[modelIdx % MODELS.length]

async function generateWithRetry(genAI: GoogleGenerativeAI, prompt: string, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      const model  = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      })
      const result = await model.generateContent(prompt)
      const text   = result.response.text()
      const trimmed = text.replace(/```json|```/g, '').trim()
      if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
        modelIdx++
        if (i === maxRetries - 1) throw new Error('응답 잘림')
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
        continue
      }
      return text
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      const isRetryable = status === 503 || status === 429 || status === 500
      modelIdx++
      if (!isRetryable || i === maxRetries - 1) throw e
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
    }
  }
  throw new Error('모든 모델 호출 실패')
}

function buildQuizPrompt(unitData: Record<string, unknown>, counts: Record<string, number>, purpose: string): string {
  return `
당신은 한국어 교육 전문가입니다. 아래 단원 데이터를 바탕으로 사지선다 퀴즈를 생성해주세요.

단원 데이터:
${JSON.stringify(unitData, null, 2)}

생성 조건:
- 모든 문제는 반드시 4개의 선택지(choices)를 가진 사지선다형으로 만드세요
- 어휘 문제: ${counts.vocab}개 (단어의 의미 또는 빈칸 채우기, 4개 선택지)
- 문법 문제: ${counts.grammar}개 (문법 패턴 적용, 4개 선택지)
- 관용어 문제: ${counts.idiom}개 (관용어 의미/사용, 4개 선택지)
- 내용 이해 문제: ${counts.ox}개 (읽기/듣기 내용 이해, 4개 선택지)
- 용도: ${purpose === 'review' ? '복습용 (힌트 포함)' : '시험용 (힌트 없음)'}
- 오답 선택지는 그럴듯하지만 명확히 틀린 내용으로 구성
- correctIndex는 0~3 사이 값 (0=①, 1=②, 2=③, 3=④), 정답이 특정 번호에 몰리지 않게 분산

다른 텍스트 없이 JSON만 응답해:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "category": "vocabulary",
      "question": "다음 중 '지치다'의 의미로 가장 알맞은 것은?",
      "choices": [
        "① 몸이나 마음이 너무 힘들어 기운이 없어지다",
        "② 어떤 일에 매우 집중하여 몰두하다",
        "③ 기쁨이나 흥분으로 활기차게 움직이다",
        "④ 오랫동안 한 자리에 머물러 있다"
      ],
      "correctIndex": 0,
      "answer": "① 몸이나 마음이 너무 힘들어 기운이 없어지다",
      "explanation": "'지치다'는 피로와 탈진을 의미합니다.",
      "hint": "신체적·정신적 피로와 관련된 단어입니다.",
      "difficulty": "easy"
    }
  ]
}
`.trim()
}

export async function POST(req: NextRequest) {
  let body: { textbookId?: string; unitId?: string; purpose?: string; counts?: Record<string, number> } = {}

  try {
    body = await req.json()
    const { textbookId, unitId, purpose = 'review', counts = { vocab: 8, grammar: 6, idiom: 4, ox: 2 } } = body

    if (!textbookId || !unitId) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    // 단원 데이터 조회
    const unitSnap = await adminDb
      .collection('textbooks').doc(textbookId)
      .collection('units').doc(unitId).get()

    if (!unitSnap.exists) {
      return NextResponse.json({ error: '단원을 찾을 수 없어요' }, { status: 404 })
    }

    const unitData = unitSnap.data()!
    const prompt   = buildQuizPrompt(unitData, counts, purpose)

    const genAI = new GoogleGenerativeAI(getKey())
    const raw   = await generateWithRetry(genAI, prompt)
    const clean = raw.replace(/```json|```/g, '').trim()

    let parsed: { questions: unknown[] }
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error('Quiz JSON 파싱 실패:', clean.slice(0, 300))
      return NextResponse.json({ error: '퀴즈 생성 실패 (JSON 오류)' }, { status: 500 })
    }

    return NextResponse.json({ questions: parsed.questions })

  } catch (e) {
    console.error('Quiz generate error:', e)
    return NextResponse.json({ error: '퀴즈 생성 실패' }, { status: 500 })
  }
}