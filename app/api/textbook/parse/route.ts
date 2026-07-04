// 📁 app/api/textbook/parse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import { adminDb, adminStorage } from '@/firebase/firebaseAdmin'
// pdf-parse: package.json의 exports 필드가 서브패스 import를 막아둔 데다,
// 설치된 버전의 default export 형태가 불명확해 정적 import 시 타입 오류가 남.
// 동적 import + any 캐스팅으로 CJS/ESM 어느 형태든 안전하게 호출.
async function loadPdfParse(): Promise<(buf: Buffer) => Promise<{ numpages: number; text: string }>> {
  const mod = await import('pdf-parse') as unknown as Record<string, unknown>
  const fn = (mod.default ?? mod) as (buf: Buffer) => Promise<{ numpages: number; text: string }>
  return fn
}

const API_KEYS = [process.env.GEMINI_KEY_1!, process.env.GEMINI_KEY_2].filter(Boolean) as string[]
let keyIdx = 0
const getKey = () => { const k = API_KEYS[keyIdx % API_KEYS.length]; keyIdx++; return k }

// ── 작업 종류별 모델 우선순위 ────────────────────────────────────
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
// ⚠️ 실사용 근거로 조정된 값들 (2026-07-04 실측, 다중 파일 업로드 시 합산 기준):
//   - 46.6MB 스캔+텍스트 혼합 PDF → 성공
//   - 50.2MB, 75페이지 스캔 PDF → 실패(400)
// 여러 파일을 함께 첨부하면 Gemini가 한 요청에서 모두 처리해야 하므로
// 전체 합산 용량/페이지 수를 기준으로 검사함.
const MAX_SIZE_MB    = 48
const MAX_PAGES_HARD = 70
const MAX_PAGES_SOFT = 50

interface PdfPreflightResult {
  numPages:        number
  avgCharsPerPage: number
  looksScanned:    boolean   // 정보 표시용. 차단 근거로 쓰지 않음
}

async function preflightCheckPdf(buffer: Buffer): Promise<PdfPreflightResult> {
  const pdfParse = await loadPdfParse()
  const parsed = await pdfParse(buffer)
  const numPages = parsed.numpages || 1
  const textLength = parsed.text.replace(/\s+/g, '').length
  const avgCharsPerPage = textLength / numPages
  return {
    numPages,
    avgCharsPerPage,
    looksScanned: avgCharsPerPage < 25,
  }
}

// models: 이 호출에서 사용할 우선순위 리스트 (호출마다 독립적으로 1번부터 시작)
// pdfParts: 여러 PDF를 동시에 첨부할 때는 배열로 전달 — Gemini가 한 요청 안에서
//           모든 파일을 함께 참고해 응답을 생성함
async function generateWithRetry(
  genAI: GoogleGenerativeAI,
  prompt: string,
  pdfBase64List: string[],
  models: string[],
  maxRetries = 5
): Promise<string> {
  let modelIdx = 0
  const getModel = () => models[modelIdx % models.length]

  const fileParts: Part[] = pdfBase64List.map(data => ({
    inlineData: { mimeType: 'application/pdf', data },
  }))

  for (let i = 0; i < maxRetries; i++) {
    const currentModel = getModel()
    try {
      console.log(`[Gemini] 시도 ${i + 1}/${maxRetries} - 모델: ${currentModel} (파일 ${pdfBase64List.length}개)`)
      const model  = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
      })
      const result = await model.generateContent([prompt, ...fileParts])
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
이 교재 파일(들)의 목차를 분석해서 "과(Unit)" 단위의 정보만 JSON으로 추출해줘.
파일이 여러 개 첨부됐다면 모두 같은 교재의 일부로 간주하고 통합해서 분석해줘.

⚠️ 매우 중요 — 과를 나누는 기준:
- "N과", "Unit N", "Lesson N" 처럼 최상위 단원 번호가 바뀔 때만 새로운 과로 카운트해.
- 한 과 안에 있는 "어휘", "문법", "말하기", "듣기", "읽기", "쓰기", "발음", "6-1", "6-2" 같은
  하위 섹션이나 소제목은 절대 별도의 과로 세지 마.
- 여러 파일에 걸쳐 같은 과 번호가 반복되면(예: 본문 파일과 듣기대본 파일에 둘 다 "6과"가 있으면)
  이것도 1개의 과로 합쳐야 해.

다른 텍스트 없이 JSON만 응답해:
{
  "units": [
    { "unitNumber": 6, "title": "일과 삶의 균형" }
  ]
}
`.trim()

function buildSingleUnitToc(unitNumber: number, title: string) {
  return { units: [{ unitNumber, title }] }
}

function buildUnitPrompt(unitNumber: number, unitTitle: string) {
  return `
이 PDF 파일(들)은 교재의 ${unitNumber}과 "${unitTitle}"에 해당하는 자료야.
파일이 여러 개 첨부됐다면(예: 본문 + 듣기대본) 모두 같은 과의 자료로 보고 종합해서
학습 항목을 빠짐없이 모두 추출해줘.

규칙:
- 어휘(vocabulary): 해당 과의 학습 어휘 목록 전체. 최소 10개 이상 추출.
- 문법(grammar): 해당 과에서 다루는 문법 패턴 전체. 예문은 2개 이상.
- 관용어/속담(idioms): 관용표현, 속담, 사자성어 등 모두 포함. 있으면 전부 추출.
- 여러 파일에 같은 어휘/문법이 중복 등장하면 한 번만 기록해줘.

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

  try {
    const body = await req.json()
    textbookId = body.textbookId
    // 여러 파일 업로드 지원: storageUrls(배열) 우선, 구버전 호환으로 storageUrl(단일)도 허용
    const storageUrls: string[] = Array.isArray(body.storageUrls)
      ? body.storageUrls
      : body.storageUrl ? [body.storageUrl] : []

    const singleUnit: { unitNumber: number; title: string } | undefined = body.singleUnit

    if (!textbookId || storageUrls.length === 0) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    await adminDb.collection('textbooks').doc(textbookId).update({ status: 'parsing' })

    const bucket = adminStorage.bucket()

    // ── 여러 파일 다운로드 + 개별/합산 사전 점검 ──────────────────
    let totalSizeMB = 0
    let totalPages  = 0
    const buffers: Buffer[] = []

    for (const url of storageUrls) {
      const storagePath = extractStoragePath(url)
      console.log('Storage path:', storagePath)
      const file = bucket.file(storagePath)

      const [metadata] = await file.getMetadata()
      const sizeMB = Number(metadata.size ?? 0) / 1024 / 1024
      totalSizeMB += sizeMB

      const [buffer] = await file.download()
      buffers.push(buffer)

      try {
        const pf = await preflightCheckPdf(buffer)
        totalPages += pf.numPages
        console.log(`  - ${storagePath}: ${sizeMB.toFixed(1)}MB, ${pf.numPages}페이지, 평균 ${pf.avgCharsPerPage.toFixed(0)}자/페이지`)
      } catch (e) {
        console.warn(`  - ${storagePath}: 사전점검 실패(구조 문제일 수 있음), 페이지 수 집계 제외:`, e)
      }
    }

    console.log(`합산: ${storageUrls.length}개 파일, ${totalSizeMB.toFixed(1)}MB, ${totalPages}페이지`)

    if (totalSizeMB > MAX_SIZE_MB) {
      throw new InvalidPdfError(
        `첨부한 파일들의 총 용량이 너무 커요 (${totalSizeMB.toFixed(1)}MB, 권장 ${MAX_SIZE_MB}MB 이하). ` +
        `파일 개수를 줄이거나 나눠서 업로드해주세요.`
      )
    }
    if (totalPages > MAX_PAGES_HARD) {
      throw new InvalidPdfError(
        `첨부한 파일들의 총 페이지 수가 너무 많아요 (${totalPages}페이지, 권장 ${MAX_PAGES_HARD}페이지 이하). ` +
        `과 단위로 나눠서 업로드해주세요.`
      )
    }
    if (totalPages > MAX_PAGES_SOFT) {
      console.warn(`⚠️ 합산 페이지 수 ${totalPages}쪽 — 실패 위험 있음`)
    }

    const base64List = buffers.map(b => b.toString('base64'))
    const genAI = new GoogleGenerativeAI(getKey())

    // 1단계: 목차 추출
    let units: { unitNumber: number; title: string }[] = []

    if (singleUnit?.unitNumber) {
      console.log(`단일 과 모드: ${singleUnit.unitNumber}과 "${singleUnit.title}" — 목차 추출 생략`)
      units = [buildSingleUnitToc(singleUnit.unitNumber, singleUnit.title || `${singleUnit.unitNumber}과`).units[0]]
    } else {
      const tocRaw  = await generateWithRetry(genAI, TABLE_OF_CONTENTS_PROMPT, base64List, MODELS_TOC)
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

    // 2단계: 과별 내용 추출 (모든 첨부 파일을 매 호출마다 함께 전달)
    const savedUnitIds: string[] = []
    for (const unit of units) {
      try {
        const unitRaw  = await generateWithRetry(genAI, buildUnitPrompt(unit.unitNumber, unit.title), base64List, MODELS_UNIT)
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