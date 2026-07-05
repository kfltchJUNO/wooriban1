'use client'
// components/student/MyErrorSummary.tsx
// 학생 본인의 오류 유형만 아주 단순하게 보여주는 위젯.
// 원칙: 정확한 횟수·예문·다른 학생 비교는 노출하지 않음 (위축감/낙인 방지 + 데이터 최소 노출)
// "어떤 영역을 더 신경 쓰면 좋을지" 방향성만 전달하는 용도.

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase/firebaseConfig'
import { useAuth } from '@/lib/auth/authContext'

const CATEGORY_TIP: Record<string, string> = {
  '조사 오류':        '조사(이/가, 을/를, 에/에서 등) 사용을 다시 확인해보세요.',
  '시제 사용 오류':   '문장의 시제(과거/현재/미래) 일치를 확인해보세요.',
  '어순 오류':        '문장 성분의 순서를 다시 점검해보세요.',
  '불규칙 활용 오류': '불규칙 활용(ㅂ, ㄷ, 르 불규칙 등)을 연습해보세요.',
  '연결어미 오류':    '문장을 이어주는 표현(-아서/-니까 등)을 복습해보세요.',
  '높임법 오류':      '높임 표현 사용을 다시 확인해보세요.',
  '어휘 선택 오류':   '문맥에 맞는 단어 선택을 연습해보세요.',
  '기타':             '다양한 표현을 더 연습해보세요.',
}

interface Props {
  compact?: boolean   // true면 카드 하나만 (대시보드 삽입용)
}

export default function MyErrorSummary({ compact = false }: Props) {
  const { appUser } = useAuth()
  const [topCategory, setTopCategory] = useState<string | null>(null)
  const [hasData,     setHasData]     = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!appUser?.uid) return
    getDoc(doc(db, 'studentErrorStats', appUser.uid))
      .then(snap => {
        if (!snap.exists()) { setHasData(false); return }
        const counts = snap.data().categoryCounts as Record<string, number> | undefined
        if (!counts || Object.keys(counts).length === 0) { setHasData(false); return }
        // 가장 빈도 높은 카테고리 "하나만" 노출 — 순위나 정확한 숫자는 보여주지 않음
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        setTopCategory(top[0])
        setHasData(true)
      })
      .finally(() => setLoading(false))
  }, [appUser?.uid])

  if (loading) return null
  if (!hasData || !topCategory) {
    return compact ? null : (
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-400 text-center">
        아직 데이터가 충분하지 않아요. 과제를 제출하면 여기에 학습 방향이 안내돼요.
      </div>
    )
  }

  return (
    <div className={`bg-indigo-50 border border-indigo-100 rounded-xl p-4 ${compact ? '' : 'mb-4'}`}>
      <p className="text-xs font-bold text-indigo-500 mb-1">💡 요즘 신경 쓰면 좋은 부분</p>
      <p className="text-sm font-bold text-gray-800">{topCategory}</p>
      <p className="text-xs text-gray-500 mt-1">{CATEGORY_TIP[topCategory] ?? '조금 더 연습해보세요.'}</p>
    </div>
  )
}