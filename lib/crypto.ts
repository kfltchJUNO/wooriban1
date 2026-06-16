// lib/crypto.ts
const SALT = process.env.NEXT_PUBLIC_HASH_SALT ?? 'wooriban-2026'

export async function hashStudentId(studentId: string): Promise<string> {
  const data   = new TextEncoder().encode(studentId.trim().toUpperCase() + SALT)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}