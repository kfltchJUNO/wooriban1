// 📁 components/admin/TextbookUpload.tsx

'use client'
import { useState } from 'react'
import { ref, uploadBytesResumable } from 'firebase/storage'
import { storage } from '@/firebase/firebaseConfig'
import { createTextbook } from '@/lib/firestore/textbooks'
import { useAuth } from '@/lib/auth/authContext'
import type { Textbook } from '@/types/textbook'

interface Props {
  onUploaded: () => void
}

type SourceType = 'textbook' | 'syllabus'

const STUDENT_LEVELS = [
  { value: '초급', label: '초급' },
  { value: '중급', label: '중급' },
  { value: '고급', label: '고급' },
]

export default function TextbookUpload({ onUploaded }: Props) {
  const { appUser } = useAuth()
  const [sourceType, setSourceType] = useState<SourceType>('textbook')
  const [files, setFiles]           = useState<File[]>([])   // 여러 파일 지원
  const [title, setTitle]           = useState('')
  const [level, setLevel]           = useState('5A')          // 교재 급수 표기 (기존 유지)
  const [studentLevel, setStudentLevel] = useState('중급')     // 지침서 모드 전용: 생성 난이도
  const [isSingleUnit, setIsSingleUnit] = useState(false)      // 이 파일들이 이미 1개 과 분량인지
  const [unitNumber, setUnitNumber]     = useState('')
  const [unitTitle, setUnitTitle]       = useState('')
  const [progress, setProgress]     = useState(0)
  const [phase, setPhase]           = useState<'idle' | 'uploading' | 'parsing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg]     = useState('')

  const inputDisabled = phase !== 'idle'

  const handleSourceChange = (type: SourceType) => {
    if (inputDisabled) return
    setSourceType(type)
  }

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return
    const newFiles = Array.from(fileList)
    setFiles(prev => [...prev, ...newFiles])
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const totalSizeMB = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024

  const handleUpload = async () => {
    if (files.length === 0 || !title || !appUser) return
    setPhase('uploading')
    setProgress(0)

    try {
      // 1. Firebase Storage에 파일들을 순서대로 업로드
      const storagePaths: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const storagePath = `textbooks/${Date.now()}_${i}_${file.name}`
        const storageRef  = ref(storage, storagePath)
        const uploadTask  = uploadBytesResumable(storageRef, file)

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            snap => {
              // 전체 진행률 중 이 파일이 차지하는 구간만큼만 반영 (업로드 단계는 전체의 50%까지)
              const fileProgress = snap.bytesTransferred / snap.totalBytes
              const overall = ((i + fileProgress) / files.length) * 50
              setProgress(Math.round(overall))
            },
            reject,
            () => resolve()
          )
        })
        storagePaths.push(storagePath)
      }

      setProgress(55)

      // 2. Firestore에 교재 메타데이터 생성 (파일 여러 개 → 배열로 저장)
      const textbookId = await createTextbook({
        title,
        level,
        storageUrl:      storagePaths[0],   // 구버전 화면 호환용 대표 경로
        storageUrls:     storagePaths,      // 실제 분석에 쓰이는 전체 목록
        status:          'parsing',
        unitCount:       0,
        assignedClasses: [],
        uploadedBy:      appUser.uid,
        sourceType,
      } satisfies Omit<Textbook, 'id'>)

      setProgress(60)
      setPhase('parsing')

      // 3. 방식에 따라 다른 API 호출 (여러 파일 경로를 배열로 전달)
      const endpoint = sourceType === 'textbook'
        ? '/api/textbook/parse'
        : '/api/textbook/generate-from-syllabus'

      const body = sourceType === 'textbook'
        ? {
            textbookId, storageUrls: storagePaths,
            ...(isSingleUnit && unitNumber
              ? { singleUnit: { unitNumber: Number(unitNumber), title: unitTitle } }
              : {}),
          }
        : { textbookId, storageUrls: storagePaths, level: studentLevel }

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || (sourceType === 'textbook' ? '분석 실패' : '생성 실패'))
      }

      setProgress(100)
      setPhase('done')
      setTimeout(() => { onUploaded() }, 1200)
    } catch (e) {
      console.error(e)
      setPhase('error')
      setErrorMsg(e instanceof Error ? e.message : '업로드 또는 처리 중 오류가 발생했어요. 다시 시도해주세요.')
    }
  }

  const PHASE_LABEL: Record<typeof phase, string> = {
    idle:      '',
    uploading: `파일 업로드 중... ${progress}% (${files.length}개)`,
    parsing:   sourceType === 'textbook'
      ? 'Gemini AI가 교재를 분석 중이에요... (1~3분 소요)'
      : 'Gemini AI가 지침서를 바탕으로 학습 내용을 만드는 중이에요... (1~3분 소요)',
    done:      sourceType === 'textbook'
      ? '✅ 분석 완료! 교재가 등록됐어요.'
      : '✅ 생성 완료! AI가 만든 내용이니 검토 후 사용해주세요.',
    error:     errorMsg,
  }

  return (
    <div className="space-y-4">
      {/* 업로드 방식 선택 */}
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">업로드 방식</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => handleSourceChange('textbook')} disabled={inputDisabled}
            className={`text-left p-3 rounded-xl border-2 transition-colors disabled:opacity-50 ${
              sourceType === 'textbook' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
            }`}>
            <p className="text-sm font-bold text-gray-800">📘 교재 PDF</p>
            <p className="text-[11px] text-gray-400 mt-0.5">실제 교재 내용을 그대로 추출해요</p>
          </button>
          <button type="button" onClick={() => handleSourceChange('syllabus')} disabled={inputDisabled}
            className={`text-left p-3 rounded-xl border-2 transition-colors disabled:opacity-50 ${
              sourceType === 'syllabus' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-200'
            }`}>
            <p className="text-sm font-bold text-gray-800">📋 지침서 PDF</p>
            <p className="text-[11px] text-gray-400 mt-0.5">주제만 있어도 AI가 내용을 만들어요</p>
          </button>
        </div>
        {sourceType === 'syllabus' && (
          <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            ⚠️ 지침서 모드는 AI가 주제에 맞춰 어휘·문법을 추정 생성해요. 실제 교재 내용과 다를 수 있으니
            생성 후 <b>단원 내용을 꼭 검토</b>해주세요.
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">
          {sourceType === 'textbook' ? '교재 이름' : '커리큘럼/과정 이름'}
        </label>
        <input
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
          placeholder={sourceType === 'textbook' ? '예: 고려대 한국어 5A' : '예: 2026년 여름학기 고급반 지침서'}
          value={title} onChange={e => setTitle(e.target.value)}
          disabled={inputDisabled}
        />
      </div>

      {sourceType === 'textbook' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">급수</label>
            <select
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 appearance-none"
              value={level} onChange={e => setLevel(e.target.value)}
              disabled={inputDisabled}
            >
              {['1A','1B','2A','2B','3A','3B','4A','4B','5A','5B','6A','6B'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* 과 단위 분할 업로드 옵션 */}
          <div className={`rounded-xl border-2 p-3 transition-colors ${isSingleUnit ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}`}>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={isSingleUnit}
                onChange={e => setIsSingleUnit(e.target.checked)}
                disabled={inputDisabled}
                className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-gray-800">이 파일(들)은 한 과 분량이에요</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  과 단위로 나눠서 업로드할 때 체크하세요. 목차 자동 분석을 건너뛰어서
                  소제목(어휘/문법/듣기 등)을 별도 과로 잘못 나누는 문제를 방지해요.
                  본문 파일과 듣기대본 파일처럼 <b>같은 과의 자료를 여러 개 첨부</b>할 수도 있어요.
                </p>
              </div>
            </label>

            {isSingleUnit && (
              <div className="flex gap-2 mt-3">
                <div className="w-24">
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">과 번호</label>
                  <input type="number" min={1} value={unitNumber}
                    onChange={e => setUnitNumber(e.target.value)}
                    placeholder="6"
                    disabled={inputDisabled}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-gray-400 block mb-1">과 제목</label>
                  <input value={unitTitle} onChange={e => setUnitTitle(e.target.value)}
                    placeholder="예: 일과 삶의 균형"
                    disabled={inputDisabled}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">생성할 학습자 수준</label>
            <div className="grid grid-cols-3 gap-2">
              {STUDENT_LEVELS.map(l => (
                <button key={l.value} type="button" onClick={() => !inputDisabled && setStudentLevel(l.value)}
                  disabled={inputDisabled}
                  className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-colors disabled:opacity-50 ${
                    studentLevel === l.value ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            💡 지침서가 주차별로 여러 파일로 나뉘어 있으면 아래에서 여러 개를 한 번에 선택하세요.
            모두 같은 커리큘럼으로 간주해서 통합 분석해요.
          </p>
        </div>
      )}

      {/* 파일 선택 (다중 지원) */}
      <div>
        <label className="text-xs font-bold text-gray-400 mb-1.5 block">
          PDF 파일 {files.length > 0 && <span className="text-indigo-500">({files.length}개, 총 {totalSizeMB.toFixed(1)}MB)</span>}
        </label>
        <div
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors
            ${files.length > 0 ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
          onClick={() => document.getElementById('pdf-input')?.click()}
        >
          <input
            id="pdf-input" type="file" accept=".pdf" multiple
            className="hidden"
            onChange={e => { handleFilesSelected(e.target.files); e.target.value = '' }}
            disabled={inputDisabled}
          />
          {files.length > 0 ? (
            <div>
              <div className="text-2xl mb-1">📄</div>
              <div className="text-sm text-indigo-700 font-bold">클릭해서 파일 추가</div>
              <div className="text-[11px] text-gray-400 mt-0.5">여러 파일을 함께 첨부해 분석할 수 있어요</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2">📂</div>
              <div className="text-sm text-gray-500">
                {sourceType === 'textbook' ? '교재 PDF 파일을 클릭해서 선택하세요 (여러 개 가능)' : '지침서 PDF 파일을 클릭해서 선택하세요 (여러 개 가능)'}
              </div>
            </div>
          )}
        </div>

        {/* 선택된 파일 목록 */}
        {files.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {files.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm flex-shrink-0">📄</span>
                <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">{f.name}</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                {!inputDisabled && (
                  <button onClick={() => removeFile(idx)}
                    className="text-gray-300 hover:text-red-500 flex-shrink-0 text-sm leading-none">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 진행 상태 */}
      {phase !== 'idle' && (
        <div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${phase === 'error' ? 'bg-red-400' : sourceType === 'syllabus' ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={`text-sm text-center ${phase === 'error' ? 'text-red-500' : phase === 'done' ? 'text-green-600' : sourceType === 'syllabus' ? 'text-amber-600' : 'text-indigo-600'}`}>
            {PHASE_LABEL[phase]}
          </p>
        </div>
      )}

      {(phase === 'idle' || phase === 'error') && (
        <button
          onClick={phase === 'error' ? () => setPhase('idle') : handleUpload}
          disabled={files.length === 0 || !title || (isSingleUnit && (!unitNumber || !unitTitle))}
          className={`w-full text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors ${
            sourceType === 'syllabus' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {phase === 'error'
            ? '다시 시도하기'
            : sourceType === 'textbook' ? '교재 업로드 & 분석 시작 →' : '지침서 업로드 & AI 생성 시작 →'}
        </button>
      )}
    </div>
  )
}