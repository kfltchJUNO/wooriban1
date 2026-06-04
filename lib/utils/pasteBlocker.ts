// lib/utils/pasteBlocker.ts
export function createPasteHandler(onAttempt?: (count: number) => void) {
  let attemptCount = 0
  return function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    attemptCount++
    onAttempt?.(attemptCount)
    return attemptCount
  }
}