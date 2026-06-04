# 우리반 (Wooriban) 🇰🇷

한국어 어학당 수업 관리 & AI 작문 피드백 플랫폼

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.local.example .env.local
# → Firebase 콘솔에서 값 복사해서 채우기

# 3. 개발 서버
npm run dev
```

## 배포

```bash
# Next.js (Vercel) — git push 한 번으로 자동 배포
git add . && git commit -m "feat: ..." && git push

# Firebase Functions — 별도 배포
cd functions && npm install && npm run build
firebase deploy --only functions

# Firestore 규칙
firebase deploy --only firestore:rules
```

## 기술 스택
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Backend**: Firebase Auth / Firestore / Storage
- **AI**: Google Gemini 2.0 Flash (서버사이드 API Route)
- **배포**: Vercel (Next.js) + Firebase (Functions/Firestore)

## 역할
| 역할 | 접근 경로 | 권한 |
|------|-----------|------|
| 학생 | /student | 과제 제출, 피드백 확인, 게시판 |
| 선생님 | /teacher | 학생 관리, 과제 부여, 피드백 작성 |
| 관리자 | /admin | 전체 유저 관리, 반 설정 |

## 주요 기능
- ✅ 이메일 / Google 소셜 로그인
- ✅ 가입 → 관리자 승인 → 반 배정
- ✅ 작문 과제 제출 (붙여넣기 차단)
- ✅ Gemini AI 자동 피드백 (제출 즉시)
- ✅ 선생님 의견 추가 후 학생에게 전달
- ✅ 반별 게시판 (이모지 반응)
- ✅ 자유 작문 연습
- ✅ 관리자: 자유작문 기능 학생별 on/off
