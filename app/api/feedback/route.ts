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
type ErrorSeverity = 'minor' | 'moderate' | 'major'
// minor: 사소함(의미 전달엔 지장 없음) / moderate: 어색함 / major: 의사소통에 지장을 줄 수 있음

interface ErrorTag {
  category:    ErrorCategory
  severity:    ErrorSeverity
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
  content: string, level: string, assignment: string, grammar?: string, unit?: UnitData,
  contentType?: string,
) {
  const unitContext = unit ? `
현재 단원 학습 내용:
- 핵심 어휘: ${unit.vocabulary?.map(v => `${v.word}(${v.meaning})`).join(', ') ?? ''}
- 문법: ${unit.grammar?.map(g => g.pattern).join(', ') ?? ''}
- 관용어: ${unit.idioms?.map(i => i.expression).join(', ') ?? ''}
` : ''

  // 대화문일 때는 개별 문장 문법뿐 아니라 대화의 흐름/문맥 자연스러움도 함께 평가
  const dialogueNote = contentType === 'dialogue' ? `

⚠️ 이 글은 화자가 번갈아 말하는 대화문이야 ("화자명: 대사" 형식으로 줄이 구분돼 있음).
개별 문장의 문법 오류뿐 아니라, 앞뒤 turn 간의 문맥이 자연스럽게 이어지는지,
질문에 대한 대답이 상황에 맞는지, 대화 흐름상 어색한 부분은 없는지도 반드시 평가해줘.
'structure' 항목에는 대화 흐름에 대한 평가를 포함해줘.
` : contentType === 'sentence' ? `

⚠️ 이 글은 여러 개의 독립된 문장을 모은 것이야 (번호로 구분돼 있음).
문장들이 서로 이어지는 글이 아니니 'structure' 항목은 "전체 흐름"이 아니라
"각 문장이 독립적으로 자연스러운지"를 평가해줘.
` : ''

  return `
너는 한국어 작문 전문 교사야.
학습자 수준: ${level}
과제 내용: ${assignment}
${grammar ? `타깃 문법: ${grammar}` : ''}
${unitContext}${dialogueNote}
다음 학습자의 글을 분석해줘:
"""
${content}
"""

두 가지를 함께 응답해줘.

1) 일반 피드백 (선생님이 학생에게 보여줄 코멘트)
2) 구조화된 오류 태그 — 학생이 틀린 부분을 정확히 찾아서 아래 카테고리 중 하나로 분류하고,
   심각도도 함께 판단해줘.
   (카테고리 목록: ${ERROR_CATEGORIES.join(', ')})
   (심각도: minor=의미 전달엔 지장 없는 사소한 실수 / moderate=다소 어색함 /
            major=의미가 헷갈리거나 의사소통에 지장을 줄 수 있음)
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
      "severity": "moderate",
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
    const severity: ErrorSeverity = ['minor', 'moderate', 'major'].includes(tag.severity)
      ? tag.severity : 'moderate'
    updates[`categoryCounts.${category}`] = FieldValue.increment(1)
    updates[`severityCounts.${severity}`] = FieldValue.increment(1)
  })
  updates['totalErrorsTagged'] = FieldValue.increment(errorTags.length)

  await ref.set(updates, { merge: true })

  // 시계열 스냅샷 — 매번 남기지 않고 "월별 최초 1회"만 그 시점 누적치를 복사해둠
  // (studentErrorSnapshots/{studentUid}_{YYYY-MM})
  // 나중에 "학기 초 대비 학기 말 오류 변화" 같은 추이 분석에 사용
  try {
    const monthKey    = new Date().toISOString().slice(0, 7)   // "2026-07"
    const snapshotId  = `${studentUid}_${monthKey}`
    const snapshotRef = adminDb.collection('studentErrorSnapshots').doc(snapshotId)
    const existing    = await snapshotRef.get()
    if (!existing.exists) {
      const current = await ref.get()
      await snapshotRef.set({
        studentUid, classId, schoolId, semester,
        monthKey,
        categoryCounts:    current.data()?.categoryCounts    ?? {},
        severityCounts:    current.data()?.severityCounts    ?? {},
        totalSubmissions:  current.data()?.totalSubmissions  ?? 0,
        totalErrorsTagged: current.data()?.totalErrorsTagged ?? 0,
        snapshotAt: FieldValue.serverTimestamp(),
      })
    }
  } catch (e) {
    console.error('월별 스냅샷 저장 실패(통계 자체는 정상 누적됨):', e)
  }
}

export async function POST(req: NextRequest) {
  let submissionIdForRecovery: string | null = null
  let targetCollectionForRecovery: 'submissions' | 'freeWritings' = 'submissions'

  try {
    const {
      submissionId, content, level, assignment, grammar,
      textbookId, unitId, contentType,
      studentUid, classId, schoolId, semester,   // 오류 통계 집계를 위해 필요
      sourceCollection,   // 'submissions'(기본) | 'freeWritings' — 어느 컬렉션의 문서인지
    } = await req.json()

    const targetCollection = sourceCollection === 'freeWritings' ? 'freeWritings' : 'submissions'
    targetCollectionForRecovery = targetCollection

    if (!submissionId || !content) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }
    // ⚠️ 과제별 최소/최대 글자 수는 선생님이 자유롭게 설정 가능(AssignmentModal)해서
    // 여기에 고정값(150/2000)을 걸면 과제 기준과 어긋나 정상 제출도 막힐 수 있었음
    // (실제로 이 버그로 AI 피드백이 시작조차 안 되는 문제가 있었음)
    // → 분석 자체가 무의미한 극단적인 경우만 최소한으로 방지
    if (content.trim().length < 10) {
      return NextResponse.json({ error: '분석하기에 내용이 너무 짧아요.' }, { status: 400 })
    }
    if (content.length > 8000) {
      return NextResponse.json({ error: '내용이 너무 길어요 (8000자 초과).' }, { status: 400 })
    }

    submissionIdForRecovery = submissionId
    await adminDb.collection(targetCollection).doc(submissionId).update({ status: 'ai_processing' })

    let unit: UnitData | undefined
    if (textbookId && unitId) {
      try {
        const unitSnap = await adminDb
          .collection('textbooks').doc(textbookId)
          .collection('units').doc(unitId).get()
        if (unitSnap.exists) unit = unitSnap.data() as UnitData
      } catch { /* 교재 데이터 없어도 기본 프롬프트로 계속 진행 */ }
    }

    const prompt = buildPrompt(content, level ?? '고급', assignment, grammar, unit, contentType)
    const raw    = await generateWithRetry(prompt)
    const parsed = JSON.parse(raw) as {
      grammar: string; vocabulary: string; structure: string; positive: string
      errorTags?: ErrorTag[]
    }
    const errorTags = Array.isArray(parsed.errorTags) ? parsed.errorTags.slice(0, 5) : []

    // 정오표 대조군 — AI 태깅 정확도를 확인하기 위해 제출물의 약 10%를
    // 무작위로 "검수 요청" 표시. 선생님이 FeedbackEditor에서 AI 태그가
    // 맞는지 확인하고 승인/수정하면 그 결과가 AI 정확도 연구 데이터가 됨.
    const needsAudit = errorTags.length > 0 && Math.random() < 0.1

    await adminDb.collection('feedback').add({
      submissionId,
      studentUid: studentUid ?? null,   // ← 누락돼있던 필드. 이게 없으면 학생이 본인 피드백을 못 읽음
      classId: classId ?? null,   // ← 단원별 분석(analysis/errors)이 정확히 범위를 좁힐 수 있도록 추가
      aiFeedback: {
        grammar:     parsed.grammar,
        vocabulary:  parsed.vocabulary,
        structure:   parsed.structure,
        positive:    parsed.positive,
        errorTags,
        generatedAt: new Date(),
      },
      teacherComment:   '',
      teacherApproved:  false,
      needsAudit,               // true면 선생님 화면에 "AI 태깅 검수 요청" 표시
      auditResult:      null,   // 선생님 검수 후: 'confirmed' | 'corrected'
      auditedTags:      null,   // 선생님이 수정한 태그(있다면)
      textbookId:       textbookId ?? null,
      unitId:           unitId     ?? null,
    })

    await adminDb.collection(targetCollection).doc(submissionId).update({ status: 'ai_done' })

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
      // 컬렉션별로 유효한 상태가 다름 (submissions: 'submitted', freeWritings: 'pending_approval')
      const recoveryStatus = targetCollectionForRecovery === 'freeWritings' ? 'pending_approval' : 'submitted'
      await adminDb.collection(targetCollectionForRecovery).doc(submissionIdForRecovery)
        .update({ status: recoveryStatus })
        .catch(() => {})
    }
    return NextResponse.json({ error: 'AI 피드백 생성 실패' }, { status: 500 })
  }
}