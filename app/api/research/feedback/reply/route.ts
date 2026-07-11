// 📁 app/api/research/feedback/reply/route.ts
// 논증 품질 트랙 전용 제한적 대화. 학생이 AI 피드백에 반박/질문하면
// "보편청중" 관점을 유지한 채로 응답. 연구 범위를 통제하기 위해 학생 발화는 최대 2턴.
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

const MAX_STUDENT_TURNS = 2

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIndex = 0
function getKey() { const k = API_KEYS[keyIndex % API_KEYS.length]; keyIndex++; return k }

const MODELS = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']
let modelIdx = 0
const getModel = () => MODELS[modelIdx % MODELS.length]

interface ThreadMessage { role: 'ai' | 'student'; text: string }

async function generateReply(prompt: string, maxRetries = 4): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      const genAI = new GoogleGenerativeAI(getKey())
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 512, temperature: 0.5 },
      })
      const result = await model.generateContent(prompt)
      return result.response.text().trim()
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

function buildReplyPrompt(originalPrompt: string, history: ThreadMessage[], studentMessage: string) {
  const historyText = history.map(m => `${m.role === 'ai' ? '독자' : '학생'}: ${m.text}`).join('\n')
  return `
너는 페렐만의 신수사학에서 말하는 "보편청중" 역할을 수행하는 합리적이고 이성적인 독자야.
특정 개인의 배경(국적, 나이 등)을 고려하지 않고, 일반적으로 합리적인 사람이라면
이 논증을 어떻게 받아들일지의 관점에서만 반응해.

논제: ${originalPrompt}

지금까지의 대화:
${historyText}

학생의 새 메시지:
"${studentMessage}"

위 메시지에 대해 보편청중 관점에서 짧게 응답해줘 (3문장 이내, 존댓말).
학생이 반박했다면 그 반박이 타당한지 평가하고, 여전히 부족한 점이 있다면 짚어줘.
다른 텍스트 없이 응답 내용만 그대로 출력해.`.trim()
}

export async function POST(req: NextRequest) {
  try {
    const { submissionId, studentMessage, originalPrompt } = await req.json()
    if (!submissionId || !studentMessage) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const threadRef = adminDb.collection('researchThreads').doc(submissionId)
    const snap = await threadRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: '대화를 찾을 수 없어요' }, { status: 404 })
    }
    const thread = snap.data()!
    if (thread.closed || (thread.studentTurnsUsed ?? 0) >= MAX_STUDENT_TURNS) {
      return NextResponse.json({ error: '이 대화는 최대 횟수에 도달해 종료됐어요' }, { status: 403 })
    }

    const history: ThreadMessage[] = thread.messages ?? []
    const replyPrompt = buildReplyPrompt(originalPrompt ?? '', history, studentMessage)
    const aiReply = await generateReply(replyPrompt)

    const newTurnsUsed = (thread.studentTurnsUsed ?? 0) + 1
    const willClose = newTurnsUsed >= MAX_STUDENT_TURNS

    await threadRef.update({
      messages: FieldValue.arrayUnion(
        { role: 'student', text: studentMessage, createdAt: new Date() },
        { role: 'ai', text: aiReply, createdAt: new Date() },
      ),
      studentTurnsUsed: newTurnsUsed,
      closed: willClose,
      ...(willClose ? { closedAt: new Date() } : {}),
    })

    return NextResponse.json({ reply: aiReply, closed: willClose, turnsRemaining: MAX_STUDENT_TURNS - newTurnsUsed })
  } catch (e) {
    console.error('Research thread reply error:', e)
    return NextResponse.json({ error: '응답 생성 실패' }, { status: 500 })
  }
}