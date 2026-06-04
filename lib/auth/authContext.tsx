'use client'
// lib/auth/authContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/firebase/firebaseConfig'
import { AppUser } from '@/types/user'

interface AuthContextType {
  firebaseUser: User | null
  appUser: AppUser | null
  loading: boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null, appUser: null, loading: true, refreshUser: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAppUser = async (uid: string) => {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) {
      const data = snap.data()
      setAppUser({
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
      } as AppUser)
    }
  }

  const refreshUser = async () => {
    if (firebaseUser) await fetchAppUser(firebaseUser.uid)
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        await fetchAppUser(user.uid)
      } else {
        setAppUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)