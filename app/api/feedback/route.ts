// 📁 app/api/feedback/route.ts  ← 기존 파일 수정 (교재 데이터 프롬프트 주입 추가)

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIndex = 0
function getKey() {
  const key = API_KEYS[keyIndex % API_KEYS.length]
  keyIndex++
  return key
}

// ── 교재 데이터 없을 때 기본 프롬프트 ──────────────
function buildBasicPrompt(content: string, level: string, assignment: string, grammar?: string) {
  return `
너는 한국어 작문 전문 교사야.
학습자 수준: ${level}
과제 내용: ${assignment}
${grammar ? `타깃 문법: ${grammar}` : ''}

다음 학습자의 작문을 분석해줘:
"""
${content}
"""

아래 JSON 형식으로만 응답해:
{
  "grammar": "문법 오류와 수정 제안 (없으면 '전반적으로 문법 오류가 없어요')",
  "vocabulary": "더 자연스러운 어휘 제안 (80자 이내)",
  "structure": "단락 구성과 흐름 평가 (80자 이내)",
  "positive": "잘한 점 - 반드시 구체적으로 1개 이상 (80자 이내)"
}`.trim()
}

// ── 교재 데이터 있을 때 정밀 프롬프트 ──────────────
function buildTextbookPrompt(
  content:    string,
  level:      string,
  assignment: string,
  unit:       any,
  grammar?:   string
) {
  const vocabList   = unit.vocabulary?.map((v: any) => `${v.word}(${v.meaning})`).join(', ') ?? ''
  const grammarList = unit.grammar?.map((g: any) => g.pattern).join(', ') ?? ''
  const idiomList   = unit.idioms?.map((i: any) => i.expression).join(', ') ?? ''

  return `
너는 한국어 작문 전문 교사야.
학습자 수준: ${level}
교재 단원: ${unit.title}
과제 내용: ${assignment}
${grammar ? `타깃 문법: ${grammar}` : ''}

【이번 단원 학습 내용】
- 핵심 어휘: ${vocabList}
- 문법: ${grammarList}
- 관용어: ${idiomList}

다음 학습자의 작문을 분석해줘:
"""
${content}
"""

아래 기준으로 분석하고 JSON 형식으로만 응답해:
1. 이번 단원에서 배운 문법·어휘·관용어를 잘 활용했는지 확인
2. 배운 표현을 쓰지 않았다면 구체적으로 어떤 표현을 쓸 수 있었는지 제안
3. 타깃 문법(${grammar ?? '없음'})이 올바르게 사용되었는지 중점 확인

{
  "grammar": "문법 오류와 수정 제안. 타깃 문법 사용 여부 반드시 언급 (80자 이내)",
  "vocabulary": "이번 단원 어휘 활용 평가 + 추가 활용 제안 (80자 이내)",
  "structure": "단락 구성과 흐름 평가 (80자 이내)",
  "positive": "이번 단원 학습 내용과 연결해서 잘한 점 구체적으로 1개 이상 (80자 이내)"
}`.trim()
}

export async function POST(req: NextRequest) {
  try {
    const {
      submissionId, content, level, assignment, grammar,
      textbookId, unitId   // ← 신규: 교재·단원 ID (없으면 기본 프롬프트 사용)
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

    await adminDb.collection('submissions').doc(submissionId).update({ status: 'ai_processing' })

    // 교재 단원 데이터 조회 (있으면 정밀 프롬프트, 없으면 기본)
    let prompt = buildBasicPrompt(content, level ?? '고급', assignment, grammar)
    if (textbookId && unitId) {
      try {
        const unitSnap = await adminDb
          .collection('textbooks').doc(textbookId)
          .collection('units').doc(unitId).get()
        if (unitSnap.exists) {
          prompt = buildTextbookPrompt(content, level ?? '고급', assignment, unitSnap.data()!, grammar)
        }
      } catch {
        // 교재 데이터 조회 실패해도 기본 프롬프트로 계속 진행
      }
    }

    const genAI  = new GoogleGenerativeAI(getKey())
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    const text   = result.response.text().replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)

    await adminDb.collection('feedback').add({
      submissionId,
      aiFeedback:      { ...parsed, generatedAt: new Date() },
      teacherComment:  '',
      teacherApproved: false,
      textbookId:      textbookId ?? null,
      unitId:          unitId     ?? null,
    })

    await adminDb.collection('submissions').doc(submissionId).update({ status: 'ai_done' })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Feedback error:', e)
    return NextResponse.json({ error: 'AI 피드백 생성 실패' }, { status: 500 })
  }
}