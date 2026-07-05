// 📁 app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIndex = 0
function getKey() {
  const key = API_KEYS[keyIndex % API_KEYS.length]
  keyIndex++
  return key
}

const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3-flash',
  'gemini-3.5-flash',
]
let modelIdx = 0
const getModel = () => MODELS[modelIdx % MODELS.length]

// ── 오류 카테고리 고정 목록 (쌤툴 퀴즈 라이브러리와 동일 체계) ──
// 여기서 통일해두면 나중에 "반이 자주 틀리는 항목으로 퀴즈 자동 생성" 연동이 쉬워짐
// ⚠️ route.ts는 GET/POST 등 정해진 이름만 export 가능 — 일반 상수는 export 금지
const ERROR_CATEGORIES = [
  '조사 오류',
  '시제 사용 오류',
  '어순 오류',
  '불규칙 활용 오류',
  '연결어미 오류',
  '높임법 오류',
  '어휘 선택 오류',
  '기타',
] as const

type ErrorCategory = typeof ERROR_CATEGORIES[number]

interface ErrorTag {
  category:    ErrorCategory
  original:    string   // 학생이 쓴 원문 표현
  correction:  string   // 올바른 표현
  explanation: string   // 왜 틀렸는지 간단 설명
}

async function generateWithRetry(prompt: string, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      console.log(`[Feedback Gemini] 시도 ${i + 1}/${maxRetries} - 모델: ${currentModel}`)
      const genAI = new GoogleGenerativeAI(getKey())
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
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
      console.log(`[Feedback Gemini] 성공 - 모델: ${currentModel}`)
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

interface UnitData {
  title?:      string
  vocabulary?: { word: string; meaning: string }[]
  grammar?:    { pattern: string }[]
  idioms?:     { expression: string }[]
}

function buildPrompt(
  content: string, level: string, assignment: string, grammar?: string, unit?: UnitData
) {
  const unitContext = unit ? `
현재 단원 학습 내용:
- 핵심 어휘: ${unit.vocabulary?.map(v => `${v.word}(${v.meaning})`).join(', ') ?? ''}
- 문법: ${unit.grammar?.map(g => g.pattern).join(', ') ?? ''}
- 관용어: ${unit.idioms?.map(i => i.expression).join(', ') ?? ''}
` : ''

  return `
너는 한국어 작문 전문 교사야.
학습자 수준: ${level}
과제 내용: ${assignment}
${grammar ? `타깃 문법: ${grammar}` : ''}
${unitContext}
다음 학습자의 작문을 분석해줘:
"""
${content}
"""

두 가지를 함께 응답해줘.

1) 일반 피드백 (선생님이 학생에게 보여줄 코멘트)
2) 구조화된 오류 태그 — 학생이 틀린 부분을 정확히 찾아서 아래 카테고리 중 하나로 분류
   (카테고리 목록: ${ERROR_CATEGORIES.join(', ')})
   오류가 없으면 빈 배열로.
   오류가 여러 개면 최대 5개까지, 가장 명확한 것부터 우선 태깅.

아래 JSON 형식으로만 응답해:
{
  "grammar": "문법 오류와 수정 제안 (없으면 '전반적으로 문법 오류가 없어요')",
  "vocabulary": "더 자연스러운 어휘 제안 (80자 이내)",
  "structure": "단락 구성과 흐름 평가 (80자 이내)",
  "positive": "잘한 점 - 반드시 구체적으로 1개 이상 (80자 이내)",
  "errorTags": [
    {
      "category": "조사 오류",
      "original": "학교에 공부해요",
      "correction": "학교에서 공부해요",
      "explanation": "장소에서 이루어지는 동작에는 '에서'를 써야 함"
    }
  ]
}`.trim()
}

// ── 오류 태그를 학생별 통계에 실시간 누적 ──────────────────────
// studentErrorStats/{studentUid} 문서에 카테고리별 카운트를 증가시킴
// ⚠️ 기존 'errorPatterns' 컬렉션(단원별 심층 분석 결과 캐시, /api/analysis/errors가 사용)과는
//    스키마가 완전히 다르므로 반드시 별도 컬렉션 이름을 써야 함 (충돌 방지)
async function accumulateErrorStats(
  studentUid: string,
  classId:    string,
  schoolId:   string,
  semester:   string,
  errorTags:  ErrorTag[],
) {
  const ref = adminDb.collection('studentErrorStats').doc(studentUid)
  const updates: Record<string, unknown> = {
    studentUid, classId, schoolId, semester,
    totalSubmissions: FieldValue.increment(1),
    lastSubmittedAt:  FieldValue.serverTimestamp(),
    updatedAt:        FieldValue.serverTimestamp(),
  }
  errorTags.forEach(tag => {
    const category = ERROR_CATEGORIES.includes(tag.category) ? tag.category : '기타'
    updates[`categoryCounts.${category}`] = FieldValue.increment(1)
  })
  updates['totalErrorsTagged'] = FieldValue.increment(errorTags.length)

  await ref.set(updates, { merge: true })
}

export async function POST(req: NextRequest) {
  let submissionIdForRecovery: string | null = null

  try {
    const {
      submissionId, content, level, assignment, grammar,
      textbookId, unitId,
      studentUid, classId, schoolId, semester,   // 오류 통계 집계를 위해 필요
    } = await req.json()

    if (!submissionId || !content) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }
    if (content.length < 150) {
      return NextResponse.json({ error: '150자 이상 필요' }, { status: 400 })
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: '2000자 초과' }, { status: 400 })
    }

    submissionIdForRecovery = submissionId
    await adminDb.collection('submissions').doc(submissionId).update({ status: 'ai_processing' })

    let unit: UnitData | undefined
    if (textbookId && unitId) {
      try {
        const unitSnap = await adminDb
          .collection('textbooks').doc(textbookId)
          .collection('units').doc(unitId).get()
        if (unitSnap.exists) unit = unitSnap.data() as UnitData
      } catch { /* 교재 데이터 없어도 기본 프롬프트로 계속 진행 */ }
    }

    const prompt = buildPrompt(content, level ?? '고급', assignment, grammar, unit)
    const raw    = await generateWithRetry(prompt)
    const parsed = JSON.parse(raw) as {
      grammar: string; vocabulary: string; structure: string; positive: string
      errorTags?: ErrorTag[]
    }
    const errorTags = Array.isArray(parsed.errorTags) ? parsed.errorTags.slice(0, 5) : []

    await adminDb.collection('feedback').add({
      submissionId,
      classId: classId ?? null,   // ← 단원별 분석(analysis/errors)이 정확히 범위를 좁힐 수 있도록 추가
      aiFeedback: {
        grammar:     parsed.grammar,
        vocabulary:  parsed.vocabulary,
        structure:   parsed.structure,
        positive:    parsed.positive,
        errorTags,
        generatedAt: new Date(),
      },
      teacherComment:  '',
      teacherApproved: false,
      textbookId:      textbookId ?? null,
      unitId:          unitId     ?? null,
    })

    await adminDb.collection('submissions').doc(submissionId).update({ status: 'ai_done' })

    // 실시간 오류 통계 누적 — 기존 'errorPatterns'(단원별 심층 분석 결과 캐시)와 이름이 겹치지 않도록
    // 별도 컬렉션 'studentErrorStats'에 저장 (학생별 실시간 누적 집계용)
    if (studentUid && classId && errorTags.length >= 0) {
      try {
        await accumulateErrorStats(studentUid, classId, schoolId ?? '', semester ?? '', errorTags)
      } catch (e) {
        console.error('오류 통계 누적 실패(피드백 자체는 정상 저장됨):', e)
      }
    }

    return NextResponse.json({ success: true, errorTagCount: errorTags.length })
  } catch (e) {
    console.error('Feedback error:', e)
    if (submissionIdForRecovery) {
      await adminDb.collection('submissions').doc(submissionIdForRecovery)
        .update({ status: 'submitted' })
        .catch(() => {})
    }
    return NextResponse.json({ error: 'AI 피드백 생성 실패' }, { status: 500 })
  }
}