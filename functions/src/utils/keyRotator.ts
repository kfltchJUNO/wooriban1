const API_KEYS = [
  process.env.GEMINI_KEY_1!,
  process.env.GEMINI_KEY_2,
].filter(Boolean) as string[]

let idx = 0
export function getNextKey(): string {
  const key = API_KEYS[idx % API_KEYS.length]
  idx++
  return key
}
