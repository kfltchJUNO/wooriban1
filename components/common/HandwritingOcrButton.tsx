'use client'
// components/common/HandwritingOcrButton.tsx
import { useState, useRef } from 'react'

interface Props {
  onTextExtracted: (text: string, imageBase64?: string) => void
  disabled?: boolean
  className?: string
}

export default function HandwritingOcrButton({ onTextExtracted, disabled = false, className = '' }: Props) {
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 클라이언트 측 이미지 압축 (최대 가로/세로 1600px, JPEG 0.82)
  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (readerEvent) => {
        const img = new Image()
        img.onload = () => {
          const MAX_DIM = 1600
          let width = img.width
          let height = img.height

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width)
              width = MAX_DIM
            } else {
              width = Math.round((width * MAX_DIM) / height)
              height = MAX_DIM
            }
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve({ base64: readerEvent.target?.result as string, mimeType: file.type })
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82)
          resolve({ base64: compressedDataUrl, mimeType: 'image/jpeg' })
        }
        img.onerror = () => reject(new Error('이미지 로딩에 실패했습니다.'))
        img.src = readerEvent.target?.result as string
      }
      reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'))
      reader.readAsDataURL(file)
    })
  }

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
      // 클라이언트에서 1차 압축 후 전송하여 용량 제한(413 Payload Too Large) 방지
      const { base64: imageBase64, mimeType } = await compressImage(file)

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
        }),
      })

      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        if (res.status === 413) {
          throw new Error('사진 용량이 너무 큽니다. 사진을 조금 더 가깝게 크롭해서 올려주세요.')
        }
        throw new Error('서버 응답 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      }

      if (!res.ok) {
        throw new Error(data.error || '손글씨 인식에 실패했습니다.')
      }

      if (!data.text || !data.text.trim()) {
        alert('사진에서 글씨를 찾지 못했습니다. 사진이 흐리거나 흔들렸는지 확인해주세요.')
        return
      }

      onTextExtracted(data.text, imageBase64)
    } catch (err: unknown) {
      console.error(err)
      alert((err as Error)?.message || '사진을 판독하는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
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
