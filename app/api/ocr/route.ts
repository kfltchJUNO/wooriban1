// 📁 app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
]
let modelIdx = 0
const getModel = () => MODELS[modelIdx % MODELS.length]

const OCR_PROMPT = `
당신은 한국어 손글씨 판독 및 필기 인식 전문 AI입니다.
업로드된 이미지에 작성된 한국어 손글씨(원고지, 공책, 연습장 등)를 매우 정밀하게 읽어서 텍스트로 추출해주세요.

[필수 규칙]
1. 원본 충실성:
   - 학생이 작성한 글을 그대로 옮겨 적으세요.
   - 학생이 맞춤법, 띄어쓰기, 조사를 틀리게 썼더라도 절대로 임의로 고치거나 교정하지 마세요. (학습자의 실제 글을 그대로 분석하기 위함입니다)
   - 줄바꿈과 문단 구분은 작성자의 의도를 최대한 살려 유지해주세요.
2. 필적 판독:
   - 지우개 자국이나 두 줄로 그어 지운 부분(취소선)은 제외하고, 최종 남겨진 글씨만 읽으세요.
   - 인쇄된 문제지 안내문, 테두리 격자선, 낙서, 페이지 번호 등 본문 작문 내용이 아닌 것은 제외하세요.
3. 출력 형식:
   - 인사말, 설명, 마크다운 코드블록(\`\`\` 등)을 일체 붙이지 말고, 오직 판독된 본문 텍스트 내용만을 그대로 출력하세요.
   - 만약 글씨가 전혀 없거나 도저히 읽을 수 없다면 빈 문자열을 반환하세요.
`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageBase64, mimeType = 'image/jpeg' } = body

    if (!imageBase64) {
      return NextResponse.json({ error: '이미지 데이터가 필요합니다.' }, { status: 400 })
    }

    // data:image/jpeg;base64, 접두사 제거
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '')

    let extractedText = ''
    let lastError: unknown = null

    for (let i = 0; i < 4; i++) {
      const currentModel = getModel()
      try {
        const genAI = new GoogleGenerativeAI(getKey())
        const model = genAI.getGenerativeModel({
          model: currentModel,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.1, // 정확도 우선
          },
        })

        const result = await model.generateContent([
          OCR_PROMPT,
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
        ])

        const text = result.response.text()
        extractedText = text.trim()
        break
      } catch (err: unknown) {
        lastError = err
        modelIdx++
        console.error(`[OCR Gemini] 모델 ${currentModel} 실패, 재시도 중:`, err)
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
      }
    }

    if (!extractedText && lastError) {
      throw lastError
    }

    return NextResponse.json({ text: extractedText })
  } catch (error: unknown) {
    console.error('[OCR Error]', error)
    return NextResponse.json(
      { error: '손글씨 사진을 인식하는 중 오류가 발생했습니다. 사진이 선명한지 확인해주세요.' },
      { status: 500 }
    )
  }
}
