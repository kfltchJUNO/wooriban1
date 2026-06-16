// 📁 app/api/textbook/parse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb, adminStorage } from '@/firebase/firebaseAdmin'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

// 우선순위: 검증된 모델 → RPD 많은 순
const MODELS = [
  'gemini-2.5-flash',       // 1순위: 현재 사용 중, 검증됨
  'gemini-3.1-flash-lite',  // 2순위: RPD 500으로 가장 넉넉
  'gemini-2.5-flash-lite',  // 3순위: 2.5 경량
  'gemini-3-flash',         // 4순위
  'gemini-3.5-flash',       // 5순위
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
        generationConfig: {
          maxOutputTokens: 8192,      // 응답 잘림 방지
          temperature:     0.1,       // 일관성 높임
        },
      })
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      ])
      const text = result.response.text()
      // JSON 잘림 감지: 마지막 문자가 } 또는 ] 가 아니면 재시도
      const trimmed = text.replace(/```json|```/g, '').trim()
      if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
        console.log(`[Gemini] 응답 잘림 감지 - 모델: ${currentModel}, 재시도`)
        modelIdx++
        if (i === maxRetries - 1) throw new Error('응답이 계속 잘려요')
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
이 PDF 교재의 ${unitNumber}과 "${unitTitle}"에서 학습 항목을 빠짐없이 모두 추출해줘.
교재에 나오는 모든 어휘, 문법, 관용표현을 누락 없이 추출하는 것이 중요해.

규칙:
- 어휘(vocabulary): 해당 과의 학습 어휘 목록 전체. 최소 10개 이상 추출.
- 문법(grammar): 해당 과에서 다루는 문법 패턴 전체. 예문은 2개 이상.
- 관용어/속담(idioms): 관용표현, 속담, 사자성어 등 모두 포함. 있으면 전부 추출.

다른 텍스트 없이 JSON만 응답해:
{
  "vocabulary": [
    {
      "word": "지치다",
      "meaning": "몸이나 마음이 너무 힘들어 기운이 없어지다",
      "example": "요즘 일이 너무 많아서 완전히 지쳤어요.",
      "type": "동사"
    }
  ],
  "grammar": [
    {
      "pattern": "V-느니",
      "explanation": "앞의 행동보다 뒤의 선택이 낫다는 의미. 불만·체념 포함.",
      "examples": [
        "기다리느니 차라리 내가 하는 게 낫겠다.",
        "이렇게 고민하느니 그냥 물어보자."
      ],
      "notes": "동사 어간 + 느니. 형용사 불가."
    }
  ],
  "idioms": [
    {
      "expression": "눈코 뜰 사이 없다",
      "meaning": "너무 바빠서 잠시도 여유가 없다",
      "example": "시험 기간이라 눈코 뜰 사이 없이 바빠요."
    }
  ],
  "readingTopics": ["워크라이프밸런스", "세대별 직장 인식"],
  "listeningPoints": ["오티움의 정의", "오티움의 특징"],
  "writingTheme": "여유가 있는 삶"
}
`.trim()
}

// Storage 경로 추출 헬퍼
// "https://firebasestorage.googleapis.com/v0/b/xxx/o/textbooks%2Ffile.pdf?..." → "textbooks/file.pdf"
function extractStoragePath(storageUrl: string): string {
  try {
    // 이미 순수 경로면 그대로 반환
    if (!storageUrl.startsWith('http')) return storageUrl

    const url = new URL(storageUrl)
    // /v0/b/{bucket}/o/{path} 형식
    const match = url.pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)/)
    if (match) return decodeURIComponent(match[1])

    // gs:// 형식
    if (storageUrl.startsWith('gs://')) {
      return storageUrl.split('/').slice(3).join('/')
    }

    return storageUrl
  } catch {
    return storageUrl
  }
}

export async function POST(req: NextRequest) {
  // body를 먼저 변수에 저장 (두 번 읽기 방지)
  let textbookId = ''
  let storageUrl = ''

  try {
    const body = await req.json()
    textbookId = body.textbookId
    storageUrl = body.storageUrl

    if (!textbookId || !storageUrl) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    // 파싱 시작 상태
    await adminDb.collection('textbooks').doc(textbookId).update({ status: 'parsing' })

    // Storage 경로 추출 후 파일 다운로드
    const storagePath = extractStoragePath(storageUrl)
    console.log('Storage path:', storagePath)

    const bucket = adminStorage.bucket()
    const file   = bucket.file(storagePath)
    const [buffer] = await file.download()
    const base64   = buffer.toString('base64')

    const genAI = new GoogleGenerativeAI(getKey())

    // 1단계: 목차 추출
    const tocRaw  = await generateWithRetry(genAI, TABLE_OF_CONTENTS_PROMPT, base64)
    const tocText = tocRaw.replace(/```json|```/g, '').trim()
    console.log('TOC raw:', tocRaw.slice(0, 200))

    let units: { unitNumber: number; title: string }[] = []
    try {
      const parsed = JSON.parse(tocText)
      units = parsed.units ?? []
    } catch (e) {
      console.error('TOC JSON 파싱 실패:', tocText.slice(0, 300))
      throw new Error('목차 파싱 실패: Gemini 응답이 JSON 형식이 아닙니다')
    }

    if (!units.length) {
      throw new Error('목차에서 과(Unit)를 찾을 수 없습니다')
    }

    // 2단계: 과별 내용 추출
    const savedUnitIds: string[] = []
    for (const unit of units) {
      try {
        const unitRaw  = await generateWithRetry(genAI, buildUnitPrompt(unit.unitNumber, unit.title), base64)
        const unitText = unitRaw.replace(/```json|```/g, '').trim()

        let unitData: Record<string, unknown> = {}
        try {
          unitData = JSON.parse(unitText)
        } catch (e) {
          console.error(`Unit ${unit.unitNumber} JSON 파싱 실패:`, unitText.slice(0, 200))
          // 단위 파싱 실패는 skip하고 계속
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
            parsedAt:        new Date(),
          })
        savedUnitIds.push(ref.id)

        await new Promise(r => setTimeout(r, 800))
      } catch (e) {
        console.error(`Unit ${unit.unitNumber} 파싱 실패:`, e)
      }
    }

    // 완료
    await adminDb.collection('textbooks').doc(textbookId).update({
      status:    'ready',
      unitCount: savedUnitIds.length,
    })

    return NextResponse.json({ success: true, unitCount: savedUnitIds.length })

  } catch (e) {
    console.error('Parse error:', e)
    // textbookId가 있으면 에러 상태 기록
    if (textbookId) {
      await adminDb.collection('textbooks').doc(textbookId)
        .update({ status: 'error', errorMessage: String(e) })
        .catch(() => {})
    }
    return NextResponse.json({ error: '파싱 실패', detail: String(e) }, { status: 500 })
  }
}