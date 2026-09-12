'use client'
// components/teacher/StudentInviteModal.tsx
import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getOrCreateClassInvitation, type ClassInvitation } from '@/lib/firestore/classInvitations'

interface Props {
  schoolId:    string
  semester:    string
  classId:     string
  teacherUid:  string
  onClose:     () => void
}

export default function StudentInviteModal({
  schoolId,
  semester,
  classId,
  teacherUid,
  onClose,
}: Props) {
  const [invitation, setInvitation] = useState<ClassInvitation | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState('')
  const [copied,     setCopied]     = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    loadInvitation()
  }, [schoolId, semester, classId, teacherUid])

  const loadInvitation = async () => {
    setLoading(true)
    setErr('')
    try {
      const inv = await getOrCreateClassInvitation(schoolId, semester, classId, teacherUid)
      setInvitation(inv)
    } catch (e) {
      console.error('[StudentInviteModal] Error:', e)
      setErr('초대 코드를 생성하지 못했어요. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const inviteUrl = typeof window !== 'undefined' && invitation
    ? `${window.location.origin}/join?code=${invitation.code}`
    : ''

  const handleCopy = () => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── 전체화면 모드 (교실 빔프로젝터용) ──
  if (isFullscreen && invitation) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0F172A] text-white flex flex-col items-center justify-center p-8 select-none">
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute top-6 right-6 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-sm transition-all flex items-center gap-2"
        >
          ✕ 전체화면 닫기
        </button>

        <div className="text-center max-w-2xl mx-auto space-y-6">
          <div className="inline-block px-4 py-1.5 bg-indigo-500/30 border border-indigo-400/40 rounded-full text-indigo-300 text-sm font-bold tracking-wide">
            우리반 수업 참여 (Join Class)
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            {invitation.schoolLabel} · {invitation.classLabel}
          </h1>
          <p className="text-gray-400 text-base sm:text-xl font-medium">
            스마트폰 카메라로 아래 QR 코드를 스캔하세요<br />
            <span className="text-gray-500 text-sm sm:text-base">Scan this QR code with your smartphone camera</span>
          </p>

          <div className="p-6 bg-white rounded-3xl shadow-2xl inline-block mx-auto my-4 border-4 border-indigo-500/20">
            <QRCodeSVG
              value={inviteUrl}
              size={280}
              level="H"
              includeMargin={false}
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 max-w-lg mx-auto">
            <p className="text-xs text-gray-400 mb-1 font-semibold">QR 스캔이 안 될 때 접속 링크 (Direct Link)</p>
            <p className="text-sm sm:text-base font-mono text-indigo-300 break-all select-all font-bold">
              {inviteUrl}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── 일반 모달 ──
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 모달 헤더 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📱</span>
            <div>
              <h2 className="font-bold text-gray-900 text-base">학생 초대 QR & 링크</h2>
              <p className="text-xs text-gray-400">학생이 스캔하면 반으로 자동 등록돼요</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-6 text-center space-y-5">
          {loading && (
            <div className="py-16 text-center text-gray-400 text-sm animate-pulse">
              초대 코드를 불러오고 있어요...
            </div>
          )}

          {err && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-600 font-semibold">
              {err}
            </div>
          )}

          {!loading && invitation && (
            <>
              {/* 반 정보 뱃지 */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 text-indigo-900">
                <p className="text-xs font-bold text-indigo-500">배정 대상 반</p>
                <p className="text-sm font-extrabold text-indigo-950 mt-0.5">
                  🏛️ {invitation.schoolLabel} · {invitation.semesterLabel} {invitation.classLabel}
                </p>
              </div>

              {/* QR 코드 카드 */}
              <div className="p-4 bg-gray-50 border border-gray-100 rounded-3xl inline-block shadow-inner">
                <div className="bg-white p-4 rounded-2xl shadow-sm">
                  <QRCodeSVG
                    value={inviteUrl}
                    size={200}
                    level="H"
                    includeMargin={false}
                  />
                </div>
              </div>

              {/* 안내 문구 */}
              <div>
                <p className="text-xs font-bold text-gray-700">
                  카메라로 QR을 찍으면 바로 가입 화면이 열려요
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Scan QR with camera to join class directly
                </p>
              </div>

              {/* 링크 복사 및 빔프로젝터 버튼 */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    copied
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100'
                  }`}
                >
                  {copied ? '✅ 초대 링크 복사 완료!' : '🔗 초대 링크 복사하기'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  🖥️ 교실 화면 크게 보기 (빔프로젝터용)
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-2.5 text-[11px] text-gray-400 break-all font-mono">
                {inviteUrl}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
