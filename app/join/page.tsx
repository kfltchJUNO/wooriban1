'use client'
// app/join/page.tsx
import { Suspense } from 'react'
import StudentJoinForm from '@/components/auth/StudentJoinForm'

export default function StudentJoinPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-orange-50">
      <Suspense fallback={<div className="text-gray-400 text-sm">로딩 중 (Loading...)...</div>}>
        <StudentJoinForm />
      </Suspense>
    </main>
  )
}
