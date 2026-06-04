// 📁 app/api/quiz/generate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb } from '@/firebase/firebaseAdmin'
import { QuizQuestion, QuizPurpose } from '@/types/quiz'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

function buildQuizPrompt(
  unitTitle:   string,
  vocab:       { word: string; meaning: string }[],
  grammar:     { pattern: string; explanation: string }[],
  idioms:      { expression: string; meaning: string }[],
  counts:      { vocab: number; grammar: number; idiom: number; ox: number },
  purpose:     QuizPurpose,
) {
  const isExam = purpose === 'exam'
  return `
너는 한국어 교육 전문가야.
교재 단원: ${unitTitle}
핵심 어휘: ${vocab.map(v => `${v.word}(${v.meaning})`).join(', ')}
문법: ${grammar.map(g => g.pattern).join(', ')}
관용어: ${idioms.map(i => i.expression).join(', ')}
용도: ${isExam ? '시험용 (힌트 없음, 난이도 높음)' : '복습용 (힌트 있음, 난이도 보통)'}

다음 조건으로 문제를 JSON으로만 생성해줘:
- fill_blank (어휘 빈칸): ${counts.vocab}문항
- grammar (문법 활용): ${counts.grammar}문항
- idiom (관용어): ${counts.idiom}문항
- ox (내용 이해): ${counts.ox}문항

형식:
{
  "questions": [
    {
      "id": "q1",
      "type": "fill_blank",
      "question": "요즘 일이 너무 많아서 몸과 마음이 완전히 ___.",
      "answer": "지쳤어요",
      "explanation": "'지치다'는 몸이나 마음이 너무 힘들어 기운이 없어지는 상태입니다.",
      "difficulty": "medium",
      "category": "vocabulary",
      "hint": "기운이 다 빠진 상태를 표현하는 동사"
    },
    {
      "id": "q2",
      "type": "grammar",
      "question": "괄호 안의 동사를 V-느니 형태로 바꿔 문장을 완성하세요.\\n이렇게 (기다리다) ___ 차라리 내가 직접 하는 게 낫겠다.",
      "answer": "기다리느니",
      "explanation": "동사 어간 + 느니. '기다리다' → '기다리느니'",
      "difficulty": "medium",
      "category": "grammar",
      "hint": "동사 어간 + 느니"
    },
    {
      "id": "q3",
      "type": "ox",
      "question": "'눈코 뜰 사이 없다'는 여유가 넘치는 상태를 나타내는 표현이다.",
      "answer": "X",
      "explanation": "'눈코 뜰 사이 없다'는 너무 바빠서 잠시도 여유가 없다는 뜻입니다.",
      "difficulty": "easy",
      "category": "idiom"
    }
  ]
}
${isExam ? '시험용이므로 hint 필드는 포함하지 마.' : ''}
`.trim()
}

export async function POST(req: NextRequest) {
  try {
    const {
      textbookId, unitId, purpose = 'review',
      counts = { vocab: 8, grammar: 6, idiom: 4, ox: 2 }
    } = await req.json()

    if (!textbookId || !unitId) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    // 교재 단원 데이터 가져오기
    const unitSnap = await adminDb
      .collection('textbooks').doc(textbookId)
      .collection('units').doc(unitId).get()

    if (!unitSnap.exists) {
      return NextResponse.json({ error: '단원을 찾을 수 없어요' }, { status: 404 })
    }
    const unit = unitSnap.data()!

    const genAI = new GoogleGenerativeAI(getKey())
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = buildQuizPrompt(
      unit.title,
      unit.vocabulary  ?? [],
      unit.grammar     ?? [],
      unit.idioms      ?? [],
      counts,
      purpose,
    )

    const result  = await model.generateContent(prompt)
    const text    = result.response.text().replace(/```json|```/g, '').trim()
    const { questions } = JSON.parse(text) as { questions: QuizQuestion[] }

    return NextResponse.json({ success: true, questions, unitTitle: unit.title })
  } catch (e) {
    console.error('Quiz generate error:', e)
    return NextResponse.json({ error: '퀴즈 생성 실패' }, { status: 500 })
  }
}