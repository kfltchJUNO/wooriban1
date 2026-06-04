'use client'
import { Suspense } from 'react'
import RegisterForm from '@/components/auth/RegisterForm'
export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-orange-50">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  )
}
