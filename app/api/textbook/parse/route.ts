// 📁 app/api/textbook/parse/route.ts
// 관리자가 PDF 업로드 후 호출 → Gemini로 파싱 → Firestore 저장

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb, adminStorage } from '@/firebase/firebaseAdmin'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

// ── 프롬프트 ──────────────────────────────────

const TABLE_OF_CONTENTS_PROMPT = `
이 교재의 목차를 분석해서 모든 과(Unit)의 정보를 JSON으로 추출해줘.
다른 텍스트 없이 JSON만 응답해:
{
  "units": [
    { "unitNumber": 1, "title": "일과 삶의 균형" },
    { "unitNumber": 2, "title": "..." }
  ]
}
`.trim()

function buildUnitPrompt(unitNumber: number, unitTitle: string) {
  return `
이 교재의 ${unitNumber}과 "${unitTitle}" 내용에서 다음을 JSON으로 추출해줘.
다른 텍스트 없이 JSON만 응답해:
{
  "vocabulary": [
    { "word": "지치다", "meaning": "몸이나 마음이 너무 힘들어 기운이 없어지다", "example": "요즘 일이 너무 많아서 완전히 지쳤어요.", "type": "동사" }
  ],
  "grammar": [
    { "pattern": "V-느니", "explanation": "앞의 행동보다 뒤의 선택이 낫다는 의미. 불만·체념 포함.", "examples": ["기다리느니 차라리 내가 하는 게 낫겠다.", "이렇게 고민하느니 그냥 물어보자."], "notes": "동사 어간 + 느니. 형용사 불가." }
  ],
  "idioms": [
    { "expression": "눈코 뜰 사이 없다", "meaning": "너무 바빠서 잠시도 여유가 없다", "example": "시험 기간이라 눈코 뜰 사이 없이 바빠요." }
  ],
  "readingTopics": ["워크라이프밸런스", "세대별 직장 인식"],
  "listeningPoints": ["오티움의 정의", "오티움의 특징"],
  "writingTheme": "여유가 있는 삶"
}
`.trim()
}

// ── 핸들러 ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { textbookId, storageUrl } = await req.json()
    if (!textbookId || !storageUrl) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    // 파싱 시작 상태 업데이트
    await adminDb.collection('textbooks').doc(textbookId).update({ status: 'parsing' })

    // Firebase Storage에서 PDF 파일 다운로드
    const bucket = adminStorage.bucket()
    const file   = bucket.file(storageUrl)
    const [buffer] = await file.download()
    const base64   = buffer.toString('base64')

    const genAI = new GoogleGenerativeAI(getKey())
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // 1단계: 목차 추출
    const tocResult = await model.generateContent([
      TABLE_OF_CONTENTS_PROMPT,
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
    ])
    const tocText = tocResult.response.text().replace(/```json|```/g, '').trim()
    const { units } = JSON.parse(tocText) as { units: { unitNumber: number; title: string }[] }

    // 2단계: 과별 내용 추출 (순차 처리)
    const savedUnitIds: string[] = []
    for (const unit of units) {
      try {
        const unitResult = await model.generateContent([
          buildUnitPrompt(unit.unitNumber, unit.title),
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
        ])
        const unitText   = unitResult.response.text().replace(/```json|```/g, '').trim()
        const unitData   = JSON.parse(unitText)

        const ref = await adminDb
          .collection('textbooks').doc(textbookId)
          .collection('units').add({
            textbookId,
            unitNumber:      unit.unitNumber,
            title:           unit.title,
            vocabulary:      unitData.vocabulary      ?? [],
            grammar:         unitData.grammar         ?? [],
            idioms:          unitData.idioms          ?? [],
            readingTopics:   unitData.readingTopics   ?? [],
            listeningPoints: unitData.listeningPoints ?? [],
            writingTheme:    unitData.writingTheme    ?? '',
            manuallyEdited:  false,
            parsedAt:        new Date(),
          })
        savedUnitIds.push(ref.id)

        // API 과부하 방지
        await new Promise(r => setTimeout(r, 800))
      } catch (e) {
        console.error(`Unit ${unit.unitNumber} 파싱 실패:`, e)
      }
    }

    // 완료 상태 업데이트
    await adminDb.collection('textbooks').doc(textbookId).update({
      status:    'ready',
      unitCount: savedUnitIds.length,
    })

    return NextResponse.json({ success: true, unitCount: savedUnitIds.length })
  } catch (e) {
    console.error('Parse error:', e)
    // 에러 상태 기록
    if (req.body) {
      const { textbookId } = await req.json().catch(() => ({}))
      if (textbookId) {
        await adminDb.collection('textbooks').doc(textbookId).update({ status: 'error' }).catch(() => {})
      }
    }
    return NextResponse.json({ error: '파싱 실패' }, { status: 500 })
  }
}