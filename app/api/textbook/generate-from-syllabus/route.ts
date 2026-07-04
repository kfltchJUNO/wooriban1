// 📁 app/api/textbook/generate-from-syllabus/route.ts
// 실제 교재 PDF가 없을 때, 지침서(커리큘럼 개요) PDF만으로 단원 초안을 생성
// 교재 parse와 차이: "추출"이 아니라 "추정 생성" → 모든 unit에 aiGenerated: true 표시
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb, adminStorage } from '@/firebase/firebaseAdmin'

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

async function generateWithRetry(
  genAI: GoogleGenerativeAI,
  prompt: string,
  pdfBase64: string,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      console.log(`[Gemini] 시도 ${i + 1}/${maxRetries} - 모델: ${currentModel}`)
      const model  = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.4 },
        // temperature는 파싱(0.1)보다 높게 — 지침서만 보고 "만들어내야" 하므로
      })
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      ])
      const text = result.response.text()
      const trimmed = text.replace(/```json|```/g, '').trim()
      if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
        console.log(`[Gemini] 응답 잘림 감지 - 모델: ${currentModel}, 재시도`)
        modelIdx++
        if (i === maxRetries - 1) throw new Error('응답이 계속 잘림')
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
        continue
      }
      console.log(`[Gemini] 성공 - 모델: ${currentModel}`)
      return text
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      const isRetryable = status === 503 || status === 429 || status === 500
      console.log(`[Gemini] 실패 - 모델: ${currentModel}, 상태: ${status}`)
      modelIdx++
      if (!isRetryable || i === maxRetries - 1) throw e
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
    }
  }
  throw new Error('모든 모델 호출 실패')
}

// ── 1단계: 지침서에서 단원 목차 "추정" ────────────────────────────
const SYLLABUS_TOC_PROMPT = `
이 파일은 정식 교재가 아니라 강의 지침서(커리큘럼 개요, 수업 계획서 등)입니다.
문서에 나온 주차별/과별 주제를 바탕으로 단원(Unit) 목록을 정리해줘.
문서에 "1과", "1주차", "Week 1" 등으로 구분돼 있으면 그 구분을 그대로 따르고,
구분이 불명확하면 문서 전체를 하나의 흐름으로 보고 자연스러운 단위로 나눠줘.

다른 텍스트 없이 JSON만 응답해:
{
  "units": [
    { "unitNumber": 1, "title": "일과 취미 관련 표현" },
    { "unitNumber": 2, "title": "..." }
  ]
}
`.trim()

// ── 2단계: 단원별 학습 내용 "추정 생성" ───────────────────────────
function buildSyllabusUnitPrompt(unitNumber: number, unitTitle: string, level: string) {
  return `
이 파일은 정식 교재가 아니라 강의 지침서입니다.
${unitNumber}과 "${unitTitle}"라는 주제에 맞춰, 학습자 수준(${level})에 적합한
어휘·문법·관용어를 네가 직접 구성해줘. 지침서에 구체적 예문이나 단어가 없다면
주제에 맞게 합리적으로 만들어내되, 실제 한국어 교육 현장에서 쓰이는 자연스러운
표현으로 구성해줘.

⚠️ 중요: 이건 추정 생성이야. 지침서에 명시된 내용이 있다면 최대한 반영하고,
없는 부분은 주제에 맞게 새로 만든다는 걸 감안해서 무난하고 검증된 표현 위주로 구성해줘.

규칙:
- 어휘(vocabulary): 주제에 맞는 학습 어휘 8~12개
- 문법(grammar): 이 수준에서 배울 만한 문법 패턴 2~3개
- 관용어/속담(idioms): 있으면 1~2개, 무리해서 넣지 않아도 됨

다른 텍스트 없이 JSON만 응답해:
{
  "vocabulary": [
    { "word": "지치다", "meaning": "몸이나 마음의 힘이 빠지다", "example": "야근이 많아서 요즘 많이 지쳐요.", "type": "동사" }
  ],
  "grammar": [
    { "pattern": "V-거니와", "explanation": "앞의 내용을 인정하면서 뒤에 다른 내용을 덧붙임", "examples": ["비도 오거니와 바람도 세니 나가지 맙시다."], "notes": "격식적 표현" }
  ],
  "idioms": [
    { "expression": "눈코 뜰 새 없다", "meaning": "매우 바쁘다", "example": "시험 기간이라 눈코 뜰 새 없이 바빠요." }
  ],
  "readingTopics": ["관련 읽기 주제"],
  "listeningPoints": ["관련 듣기 포인트"],
  "writingTheme": "이 단원과 어울리는 쓰기 주제"
}
`.trim()
}

function extractStoragePath(storageUrl: string): string {
  try {
    if (!storageUrl.startsWith('http')) return storageUrl
    const url = new URL(storageUrl)
    const match = url.pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)/)
    if (match) return decodeURIComponent(match[1])
    if (storageUrl.startsWith('gs://')) return storageUrl.split('/').slice(3).join('/')
    return storageUrl
  } catch {
    return storageUrl
  }
}

export async function POST(req: NextRequest) {
  let textbookId = ''
  let storageUrl = ''

  try {
    const body = await req.json()
    textbookId = body.textbookId
    storageUrl = body.storageUrl
    const level: string = body.level ?? '중급'

    if (!textbookId || !storageUrl) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    await adminDb.collection('textbooks').doc(textbookId).update({
      status: 'parsing',
      sourceType: 'syllabus',   // ← 교재 파싱과 구분되는 표시
    })

    const storagePath = extractStoragePath(storageUrl)
    const bucket = adminStorage.bucket()
    const file   = bucket.file(storagePath)
    const [buffer] = await file.download()
    const base64   = buffer.toString('base64')

    const genAI = new GoogleGenerativeAI(getKey())

    // 1단계: 목차 추정
    const tocRaw  = await generateWithRetry(genAI, SYLLABUS_TOC_PROMPT, base64)
    const tocText = tocRaw.replace(/```json|```/g, '').trim()

    let units: { unitNumber: number; title: string }[] = []
    try {
      const parsed = JSON.parse(tocText)
      units = parsed.units ?? []
    } catch {
      console.error('지침서 목차 파싱 실패:', tocText.slice(0, 300))
      throw new Error('목차 추정 실패: Gemini 응답이 JSON 형식이 아닙니다')
    }

    if (!units.length) {
      throw new Error('지침서에서 단원 구성을 추정하지 못했습니다')
    }

    // 2단계: 단원별 내용 추정 생성
    const savedUnitIds: string[] = []
    for (const unit of units) {
      try {
        const unitRaw  = await generateWithRetry(
          genAI, buildSyllabusUnitPrompt(unit.unitNumber, unit.title, level), base64
        )
        const unitText = unitRaw.replace(/```json|```/g, '').trim()

        let unitData: Record<string, unknown> = {}
        try {
          unitData = JSON.parse(unitText)
        } catch {
          console.error(`Unit ${unit.unitNumber} JSON 파싱 실패:`, unitText.slice(0, 200))
          continue
        }

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
            aiGenerated:     true,          // ← 추정 생성 표시 (교재 파싱과 구분)
            parsedAt:        new Date(),
          })
        savedUnitIds.push(ref.id)

        await new Promise(r => setTimeout(r, 800))
      } catch (e) {
        console.error(`Unit ${unit.unitNumber} 생성 실패:`, e)
      }
    }

    await adminDb.collection('textbooks').doc(textbookId).update({
      status:    'ready',
      unitCount: savedUnitIds.length,
    })

    return NextResponse.json({
      success:   true,
      unitCount: savedUnitIds.length,
      note:      'AI가 지침서를 바탕으로 추정 생성한 내용이에요. 단원별 내용을 검토 후 사용해주세요.',
    })

  } catch (e) {
    console.error('Syllabus generate error:', e)
    if (textbookId) {
      await adminDb.collection('textbooks').doc(textbookId)
        .update({ status: 'error', errorMessage: String(e) })
        .catch(() => {})
    }
    return NextResponse.json({ error: '생성 실패', detail: String(e) }, { status: 500 })
  }
}