// 📁 app/api/textbook/parse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { adminDb, adminStorage } from '@/firebase/firebaseAdmin'
// pdf-parse: package.json의 exports 필드가 서브패스 import를 막아둬서
// 기본 export로 import. (직접 실행될 때만 동작하는 내부 디버그 코드가 있지만
// 여기서는 모듈로 import만 하므로 영향 없음)
import pdfParse from 'pdf-parse'

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

// ── 작업 종류별 모델 우선순위 ────────────────────────────────────
// 릴레이(폴백) 방식은 그대로 유지하되, 작업 성격에 맞는 모델을 1순위로 둠
// - 목차 추출: 구조 파악만 하면 되는 가벼운 작업 → 빠른 모델 우선
// - 과별 상세 추출: 어휘/문법 누락 없이 정확해야 하는 작업 → pro 모델 우선
const MODELS_TOC = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash',
  'gemini-3.5-flash',
]
const MODELS_UNIT = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-3.5-flash',
]

// PDF 자체 문제(용량/스캔본/구조)로 판단되는 오류 — 재시도 불가, 사용자 액션 필요
class InvalidPdfError extends Error {
  constructor(detail: string) { super(detail); this.name = 'InvalidPdfError' }
}

// ── 사전 점검 기준 ────────────────────────────────────────────────
const MAX_SIZE_MB          = 18     // Gemini inline data 실질 한도(20MB) 아래로 여유
const MAX_PAGES_SOFT       = 60     // 이 이상이면 시간초과 위험 경고(차단은 안 함)
const MIN_CHARS_PER_PAGE   = 25     // 페이지당 평균 이 글자 수 미만이면 "텍스트 없음(스캔본)"으로 판단

interface PdfPreflightResult {
  numPages:      number
  avgCharsPerPage: number
  looksScanned:  boolean
}

async function preflightCheckPdf(buffer: Buffer): Promise<PdfPreflightResult> {
  const parsed = await pdfParse(buffer)
  const numPages = parsed.numpages || 1
  const textLength = parsed.text.replace(/\s+/g, '').length
  const avgCharsPerPage = textLength / numPages
  return {
    numPages,
    avgCharsPerPage,
    looksScanned: avgCharsPerPage < MIN_CHARS_PER_PAGE,
  }
}

// models: 이 호출에서 사용할 우선순위 리스트 (호출마다 독립적으로 1번부터 시작 —
// 작업 종류별로 지정한 1순위 모델을 항상 먼저 시도하게 됨)
async function generateWithRetry(
  genAI: GoogleGenerativeAI,
  prompt: string,
  pdfBase64: string,
  models: string[],
  maxRetries = 5
): Promise<string> {
  let modelIdx = 0
  const getModel = () => models[modelIdx % models.length]

  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      console.log(`[Gemini] 시도 ${i + 1}/${maxRetries} - 모델: ${currentModel}`)
      const model  = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
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
      const status  = (e as { status?: number }).status
      const message = (e as { message?: string }).message ?? ''

      if (status === 400) {
        console.log(`[Gemini] 400 오류 - PDF 자체 문제로 판단: ${message}`)
        throw new InvalidPdfError(
          'PDF를 처리하지 못했어요. 파일이 손상됐거나 Gemini가 지원하지 않는 형식일 수 있어요.'
        )
      }

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
이 교재 파일의 목차를 분석해서 "과(Unit)" 단위의 정보만 JSON으로 추출해줘.

⚠️ 매우 중요 — 과를 나누는 기준:
- "N과", "Unit N", "Lesson N" 처럼 최상위 단원 번호가 바뀔 때만 새로운 과로 카운트해.
- 한 과 안에 있는 "어휘", "문법", "말하기", "듣기", "읽기", "쓰기", "발음", "6-1", "6-2" 같은
  하위 섹션이나 소제목은 절대 별도의 과로 세지 마. 이런 것들은 모두 같은 과에 속해.
- 예를 들어 파일에 "6과"라는 표시가 1번만 나오고 그 아래 여러 소제목이 있어도,
  이건 "1개의 과"야. 소제목 개수만큼 과를 만들면 안 돼.
- 파일 전체가 하나의 과 분량이면 units 배열에 1개 항목만 넣어야 해.

다른 텍스트 없이 JSON만 응답해:
{
  "units": [
    { "unitNumber": 6, "title": "일과 삶의 균형" }
  ]
}
`.trim()

// 단일 과 파일임을 이미 알고 있을 때 사용 — 목차 추출 없이 바로 지정된 과로 처리
function buildSingleUnitToc(unitNumber: number, title: string) {
  return { units: [{ unitNumber, title }] }
}

function buildUnitPrompt(unitNumber: number, unitTitle: string) {
  return `
이 PDF 교재의 ${unitNumber}과 "${unitTitle}"에서 학습 항목을 빠짐없이 모두 추출해줘.
교재에 수록된 모든 어휘, 문법, 관용표현을 누락 없이 추출하는 것이 중요해.

규칙:
- 어휘(vocabulary): 해당 과의 학습 어휘 목록 전체. 최소 10개 이상 추출.
- 문법(grammar): 해당 과에서 다루는 문법 패턴 전체. 예문은 2개 이상.
- 관용어/속담(idioms): 관용표현, 속담, 사자성어 등 모두 포함. 있으면 전부 추출.

다른 텍스트 없이 JSON만 응답해:
{
  "vocabulary": [
    {
      "word": "지치다",
      "meaning": "몸이나 마음의 힘이 빠져 기운이 없어지다",
      "example": "야근이 너무 많아서 요즘 너무 지쳐요.",
      "type": "동사"
    }
  ],
  "grammar": [
    {
      "pattern": "V-느니",
      "explanation": "앞의 행동보다 뒤의 선택이 더 나음을 표현. 부정문·체념 포함.",
      "examples": [
        "기다리느니 차라리 걸어가는 게 낫겠어요.",
        "이렇게 고민하느니 그냥 물어보자."
      ],
      "notes": "동사 어간 + 느니. 격식체 불가."
    }
  ],
  "idioms": [
    {
      "expression": "눈코 뜰 사이 없다",
      "meaning": "너무 바빠서 잠시도 여유가 없다",
      "example": "시험 기간이라 눈코 뜰 사이 없이 바빠요."
    }
  ],
  "readingTopics": ["워크라이프밸런스", "직장 내 갈등 인식"],
  "listeningPoints": ["인터뷰 형식 정의", "인터뷰 형식 특징"],
  "writingTheme": "여유가 있는 삶"
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
    // 과 단위로 이미 나눠서 올린 경우 — 목차 추출을 건너뛰고 이 값 그대로 사용
    // { unitNumber: 6, title: "일과 삶의 균형" } 형태로 프론트에서 전달
    const singleUnit: { unitNumber: number; title: string } | undefined = body.singleUnit

    if (!textbookId || !storageUrl) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    await adminDb.collection('textbooks').doc(textbookId).update({ status: 'parsing' })

    const storagePath = extractStoragePath(storageUrl)
    console.log('Storage path:', storagePath)

    const bucket = adminStorage.bucket()
    const file   = bucket.file(storagePath)

    // ── 1차 점검: 파일 용량 ──────────────────────────────────────
    const [metadata] = await file.getMetadata()
    const sizeMB = Number(metadata.size ?? 0) / 1024 / 1024
    console.log(`PDF 크기: ${sizeMB.toFixed(1)}MB`)
    if (sizeMB > MAX_SIZE_MB) {
      throw new InvalidPdfError(
        `PDF 파일이 너무 커요 (${sizeMB.toFixed(1)}MB, 최대 ${MAX_SIZE_MB}MB). ` +
        `과 단위로 나눠서 여러 파일로 업로드해주세요.`
      )
    }

    const [buffer] = await file.download()

    // ── 2차 점검: 텍스트 레이어 유무 + 페이지 수 ──────────────────
    // (스캔 이미지 전용 PDF는 Gemini가 페이지를 이미지로 처리해야 해서
    //  대용량+다페이지 조합에서 특히 실패율이 높음 — 미리 걸러서 안내)
    let preflight: PdfPreflightResult
    try {
      preflight = await preflightCheckPdf(buffer)
      console.log(`PDF 사전점검: ${preflight.numPages}페이지, 평균 ${preflight.avgCharsPerPage.toFixed(0)}자/페이지, 스캔추정=${preflight.looksScanned}`)
    } catch (e) {
      console.warn('PDF 사전점검 실패(구조 문제일 수 있음), 그냥 진행:', e)
      preflight = { numPages: 0, avgCharsPerPage: 999, looksScanned: false }
    }

    if (preflight.looksScanned) {
      throw new InvalidPdfError(
        `이 PDF는 텍스트를 인식할 수 없는 스캔 이미지로 보여요 (${preflight.numPages}페이지, ` +
        `페이지당 평균 ${preflight.avgCharsPerPage.toFixed(0)}자). ` +
        `OCR(문자 인식)을 거친 PDF로 다시 저장하거나, Google 드라이브에 업로드 후 ` +
        `"Google Docs로 열기"로 텍스트를 추출한 뒤 다시 업로드해주세요.`
      )
    }

    if (preflight.numPages > MAX_PAGES_SOFT) {
      // 완전 차단하지는 않되, 실패 시 원인을 바로 알 수 있도록 로그에 강하게 남김
      console.warn(`⚠️ 페이지 수 ${preflight.numPages}쪽 — 시간 초과 위험. 실패 시 과 단위 분할 업로드 권장`)
    }

    const base64 = buffer.toString('base64')
    const genAI  = new GoogleGenerativeAI(getKey())

    // 1단계: 목차 추출 (singleUnit이 지정되면 이 단계 자체를 건너뜀 —
    // 목차 추출이 소제목을 별개 과로 오인하는 문제를 원천 차단)
    let units: { unitNumber: number; title: string }[] = []

    if (singleUnit?.unitNumber) {
      console.log(`단일 과 모드: ${singleUnit.unitNumber}과 "${singleUnit.title}" — 목차 추출 생략`)
      units = [buildSingleUnitToc(singleUnit.unitNumber, singleUnit.title || `${singleUnit.unitNumber}과`).units[0]]
    } else {
      const tocRaw  = await generateWithRetry(genAI, TABLE_OF_CONTENTS_PROMPT, base64, MODELS_TOC)
      const tocText = tocRaw.replace(/```json|```/g, '').trim()
      console.log('TOC raw:', tocRaw.slice(0, 200))

      try {
        const parsed = JSON.parse(tocText)
        units = parsed.units ?? []
      } catch {
        console.error('TOC JSON 파싱 실패:', tocText.slice(0, 300))
        throw new Error('목차 파싱 실패: Gemini 응답이 JSON 형식이 아닙니다')
      }
    }

    if (!units.length) {
      throw new InvalidPdfError(
        '목차에서 과(Unit)를 찾을 수 없어요. PDF에 과 구분이 명확한지 확인해주세요.'
      )
    }

    // 2단계: 과별 내용 추출
    const savedUnitIds: string[] = []
    for (const unit of units) {
      try {
        const unitRaw  = await generateWithRetry(genAI, buildUnitPrompt(unit.unitNumber, unit.title), base64, MODELS_UNIT)
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
            parsedAt:        new Date(),
          })
        savedUnitIds.push(ref.id)

        await new Promise(r => setTimeout(r, 800))
      } catch (e) {
        console.error(`Unit ${unit.unitNumber} 파싱 실패:`, e)
      }
    }

    await adminDb.collection('textbooks').doc(textbookId).update({
      status:    'ready',
      unitCount: savedUnitIds.length,
    })

    return NextResponse.json({ success: true, unitCount: savedUnitIds.length })

  } catch (e) {
    console.error('Parse error:', e)
    const isPdfIssue = e instanceof InvalidPdfError
    const message = isPdfIssue ? e.message : '분석 실패'

    if (textbookId) {
      await adminDb.collection('textbooks').doc(textbookId)
        .update({ status: 'error', errorMessage: String(message) })
        .catch(() => {})
    }
    return NextResponse.json(
      { error: message, detail: String(e), isPdfIssue },
      { status: isPdfIssue ? 422 : 500 }
    )
  }
}