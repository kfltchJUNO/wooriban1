// 📁 components/admin/TextbookUpload.tsx

'use client'
import { useState } from 'react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/firebase/firebaseConfig'
import { createTextbook } from '@/lib/firestore/textbooks'
import { useAuth } from '@/lib/auth/authContext'

interface Props {
  onUploaded: () => void
}

export default function TextbookUpload({ onUploaded }: Props) {
  const { appUser } = useAuth()
  const [file, setFile]         = useState<File | null>(null)
  const [title, setTitle]       = useState('')
  const [level, setLevel]       = useState('5A')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase]       = useState<'idle' | 'uploading' | 'parsing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleUpload = async () => {
    if (!file || !title || !appUser) return
    setPhase('uploading')
    setProgress(0)

    try {
      // 1. Firebase Storage에 PDF 업로드
      const storagePath = `textbooks/${Date.now()}_${file.name}`
      const storageRef  = ref(storage, storagePath)
      const uploadTask  = uploadBytesResumable(storageRef, file)

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 50)),
          reject,
          () => resolve()
        )
      })

      setProgress(55)

      // 2. Firestore에 교재 메타데이터 저장
      const textbookId = await createTextbook({
        title,
        level,
        storageUrl:      storagePath,
        status:          'parsing',
        unitCount:       0,
        assignedClasses: [],
        uploadedBy:      appUser.uid,
      })

      setProgress(60)
      setPhase('parsing')

      // 3. 파싱 API 호출
      const res = await fetch('/api/textbook/parse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ textbookId, storageUrl: storagePath }),
      })

      if (!res.ok) throw new Error('파싱 실패')
      const { unitCount } = await res.json()

      setProgress(100)
      setPhase('done')
      setTimeout(() => { onUploaded() }, 1200)
    } catch (e) {
      console.error(e)
      setPhase('error')
      setErrorMsg('업로드 또는 파싱 중 오류가 발생했어요. 다시 시도해주세요.')
    }
  }

  const PHASE_LABEL: Record<typeof phase, string> = {
    idle:      '',
    uploading: `PDF 업로드 중... ${progress}%`,
    parsing:   'Gemini AI가 교재를 분석 중이에요... (1~3분 소요)',
    done:      '✅ 파싱 완료! 교재가 등록되었어요.',
    error:     errorMsg,
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">교재 이름</label>
        <input
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
          placeholder="예: 고려대 한국어 5A"
          value={title} onChange={e => setTitle(e.target.value)}
          disabled={phase !== 'idle'}
        />
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">레벨</label>
        <select
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 appearance-none"
          value={level} onChange={e => setLevel(e.target.value)}
          disabled={phase !== 'idle'}
        >
          {['1A','1B','2A','2B','3A','3B','4A','4B','5A','5B','6A','6B'].map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">PDF 파일</label>
        <div
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors
            ${file ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
          onClick={() => document.getElementById('pdf-input')?.click()}
        >
          <input
            id="pdf-input" type="file" accept=".pdf"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            disabled={phase !== 'idle'}
          />
          {file ? (
            <div>
              <div className="text-2xl mb-1">📄</div>
              <div className="font-bold text-sm text-indigo-700">{file.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2">📚</div>
              <div className="text-sm text-gray-500">PDF 파일을 클릭해서 선택하세요</div>
            </div>
          )}
        </div>
      </div>

      {/* 진행 상태 */}
      {phase !== 'idle' && (
        <div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${phase === 'error' ? 'bg-red-400' : 'bg-indigo-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={`text-sm text-center ${phase === 'error' ? 'text-red-500' : phase === 'done' ? 'text-green-600' : 'text-indigo-600'}`}>
            {PHASE_LABEL[phase]}
          </p>
        </div>
      )}

      {(phase === 'idle' || phase === 'error') && (
        <button
          onClick={phase === 'error' ? () => setPhase('idle') : handleUpload}
          disabled={!file || !title}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
        >
          {phase === 'error' ? '다시 시도하기' : '교재 업로드 & 파싱 시작 🚀'}
        </button>
      )}
    </div>
  )
}