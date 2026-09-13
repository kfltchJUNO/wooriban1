'use client'
// components/common/HandwritingOcrButton.tsx
import { useState, useRef } from 'react'

interface Props {
  onTextExtracted: (text: string) => void
  disabled?: boolean
  className?: string
}

export default function HandwritingOcrButton({ onTextExtracted, disabled = false, className = '' }: Props) {
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 이미지 용량 및 포맷 검사
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG 등)을 선택해주세요.')
      return
    }

    setLoading(true)

    try {
      // FileReader로 Base64 인코딩
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const imageBase64 = reader.result as string

          const res = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64,
              mimeType: file.type || 'image/jpeg',
            }),
          })

          const data = await res.json()

          if (!res.ok) {
            throw new Error(data.error || '손글씨 인식에 실패했습니다.')
          }

          if (!data.text || !data.text.trim()) {
            alert('사진에서 글씨를 찾지 못했습니다. 사진이 흐리거나 흔들렸는지 확인해주세요.')
            return
          }

          onTextExtracted(data.text)
        } catch (err: unknown) {
          console.error(err)
          alert((err as Error)?.message || '사진을 판독하는 중 오류가 발생했습니다.')
        } finally {
          setLoading(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }

      reader.onerror = () => {
        setLoading(false)
        alert('이미지를 불러오는데 실패했습니다.')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }

      reader.readAsDataURL(file)
    } catch (err) {
      setLoading(false)
      console.error(err)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className={`inline-block ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment" // 모바일 기기에서 후면 카메라 우선 호출 지원
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 shadow-sm"
        title="직접 쓴 공책이나 원고지 사진을 찍어 텍스트로 자동 입력합니다"
      >
        {loading ? (
          <>
            <span className="inline-block animate-spin text-sm">⏳</span>
            <span>손글씨 읽는 중...</span>
          </>
        ) : (
          <>
            <span className="text-sm">📷</span>
            <span>손글씨 사진으로 입력</span>
          </>
        )}
      </button>
    </div>
  )
}
