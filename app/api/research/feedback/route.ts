// 📁 app/api/research/feedback/route.ts
// 연구 전용 이원화 피드백 생성. 기존 /api/feedback(교정 중심)과 완전히 분리된 프롬프트.
// 논증 트랙은 페렐만의 "보편청중" 개념을 명시적으로 지시해 AI가 특정 청중이 아니라
// 일반적·이성적 독자의 관점에서 반응하도록 유도함.
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIndex = 0
function getKey() { const k = API_KEYS[keyIndex % API_KEYS.length]; keyIndex++; return k }

const MODELS = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3-flash', 'gemini-3.5-flash']
let modelIdx = 0
const getModel = () => MODELS[modelIdx % MODELS.length]

async function generateWithRetry(prompt: string, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      const genAI = new GoogleGenerativeAI(getKey())
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      })
      const result = await model.generateContent(prompt)
      const trimmed = result.response.text().replace(/```json|```/g, '').trim()
      if (!trimmed.endsWith('}')) {
        modelIdx++
        if (i === maxRetries - 1) throw new Error('응답 잘림')
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
        continue
      }
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

interface ArgumentItem { label: string; text: string }

function buildPrompt(prompt: string, items: ArgumentItem[]) {
  const argumentText = items.map(it => `[${it.label}] ${it.text}`).join('\n')

  return `
너는 두 가지 역할을 동시에 수행해.

역할 1) 한국어 교사 — 아래 글의 언어적 정확성(문법, 어휘)을 평가.

역할 2) "보편청중(universal audience)" — 페렐만의 신수사학 개념에 따라,
특정 개인의 배경이나 성향을 고려하지 않고, 합리적이고 이성적인 일반 독자의
관점에서만 이 논증에 반응해. 학습자가 어느 나라 사람인지, 몇 살인지는
전혀 고려하지 말고, 오직 "이 논증이 합리적인 사람에게 얼마나 설득력 있는가"만 평가해.

논제: ${prompt}

학습자의 논증:
${argumentText}

아래 JSON 형식으로만 응답해:
{
  "languageFeedback": {
    "grammar": "문법 오류와 수정 제안 (80자 이내)",
    "vocabulary": "어휘 사용 평가 (80자 이내)"
  },
  "argumentFeedback": {
    "claimClarity": "주장이 명확하고 논제에 부합하는가 (100자 이내)",
    "evidenceStrength": "제시된 근거가 주장을 충분히 뒷받침하는가 (100자 이내)",
    "counterargument": "예상되는 반론에 대한 고려나 대응이 있는가. 없다면 어떤 반론이 예상되는지 (100자 이내)",
    "overallImpression": "합리적인 일반 독자 입장에서 이 논증이 얼마나 설득력 있는지 종합 평가 (100자 이내)"
  }
}`.trim()
}

export async function POST(req: NextRequest) {
  let submissionId: string | undefined

  try {
    const body = await req.json()
    submissionId = body.submissionId
    const { prompt, items, studentUid } = body as {
      prompt: string; items: ArgumentItem[]; studentUid: string
    }

    if (!submissionId || !prompt || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    await adminDb.collection('researchSubmissions').doc(submissionId).update({ status: 'ai_processing' })

    const geminiPrompt = buildPrompt(prompt, items)
    const raw = await generateWithRetry(geminiPrompt)
    const parsed = JSON.parse(raw) as {
      languageFeedback: { grammar: string; vocabulary: string }
      argumentFeedback: { claimClarity: string; evidenceStrength: string; counterargument: string; overallImpression: string }
    }

    await adminDb.collection('researchFeedback').doc(submissionId).set({
      submissionId,
      studentUid: studentUid ?? null,
      languageFeedback: parsed.languageFeedback,
      argumentFeedback: parsed.argumentFeedback,
      generatedAt: new Date(),
    })

    // 논증 피드백을 대화 스레드의 첫 AI 메시지로도 남겨서 바로 대화 이어갈 수 있게 함
    const firstMessage = `${parsed.argumentFeedback.overallImpression}\n\n${parsed.argumentFeedback.counterargument}`
    await adminDb.collection('researchThreads').doc(submissionId).set({
      submissionId,
      studentUid: studentUid ?? null,
      messages: [{ role: 'ai', text: firstMessage, createdAt: new Date() }],
      studentTurnsUsed: 0,
      closed: false,
    })

    await adminDb.collection('researchSubmissions').doc(submissionId).update({ status: 'ai_done' })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Research feedback error:', e)
    if (submissionId) {
      await adminDb.collection('researchSubmissions').doc(submissionId)
        .update({ status: 'submitted' }).catch(() => {})
    }
    return NextResponse.json({ error: '연구 피드백 생성 실패' }, { status: 500 })
  }
}