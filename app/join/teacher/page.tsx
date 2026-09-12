'use client'
// app/join/teacher/page.tsx
import { Suspense } from 'react'
import TeacherJoinForm from '@/components/auth/TeacherJoinForm'

export default function TeacherJoinPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-orange-50">
      <Suspense fallback={<div className="text-gray-400 text-sm">로딩 중...</div>}>
        <TeacherJoinForm />
      </Suspense>
    </main>
  )
}
