export function buildFeedbackPrompt(content: string, level: string, assignment: string, grammar?: string) {
  return `
너는 한국어 작문 전문 교사야.
학습자 수준: ${level}
과제 내용: ${assignment}
${grammar ? `타깃 문법: ${grammar}` : ''}

다음 학습자의 작문을 분석해줘:
"""
${content}
"""

아래 JSON 형식으로만 응답해. 다른 텍스트 없이:
{
  "grammar": "문법 오류와 수정 제안 (없으면 '전반적으로 문법 오류가 없어요')",
  "vocabulary": "더 자연스러운 어휘 제안 (80자 이내)",
  "structure": "단락 구성과 흐름 평가 (80자 이내)",
  "positive": "잘한 점 - 반드시 구체적으로 1개 이상 (80자 이내)"
}`.trim()
}
