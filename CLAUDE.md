# CLAUDE.md — 우리반 (wooriban)

## 언어
항상 한국어로 답변할 것. 코드 주석/커밋 메시지는 영어 그대로 둬도 됨.

## 응답 스타일 (토큰 절약)
각 단계마다 "이제 ~를 확인합니다", "~가 확인됐습니다" 같은 진행 서술 최소화.
중간 과정은 짧게, 최종 결과 위주로 보고할 것.
작업 끝나면 요약은 5줄 이내로. 상세 로그는 필요할 때만 요청함.
불필요하게 전체 코드베이스를 재탐색하지 말 것 — 아래 "주요 파일 위치" 참고.

## 프로젝트 구조
Next.js 14 + Firebase (Firestore, Auth, Storage), 배포는 Vercel
학생 관리 + 작문 제출 + AI 피드백 + 연구용 논증 파이프라인이 함께 있는 앱

- Firebase 클라이언트 초기화: `firebase/firebaseConfig.ts`
- Firebase Admin SDK(서버용): `firebase/firebaseAdmin.ts`
- 인증 컨텍스트: `lib/auth/authContext.tsx` (useAuth 훅)
- Firestore 헬퍼: `lib/firestore/{users,assignments,submissions,feedback,quizzes,textbooks,research,settings}.ts`
- 타입 정의: `types/{user,assignment,feedback,quiz,textbook,research}.ts`
- 페이지: `app/{student,teacher,admin,researcher}/page.tsx`
- 컴포넌트: `components/{student,teacher,admin,researcher,auth,layout,board}/`
- API 라우트: `app/api/{feedback,quiz,textbook,research,admin}/`
- 빌드: `npm run build` / 로컬 실행: `npm run dev` / 린트: `npm run lint`

## 핵심 아키텍처 패턴 (재탐색 없이 바로 적용)
- **feedback 문서 ID = submissionId로 고정** (getDoc 조회, where 쿼리 금지 — Firestore 보안 규칙이 쿼리에 studentUid 필터 없으면 통째로 차단함)
- **자유작문/일반과제는 다른 컬렉션**(`freeWritings` vs `submissions`) — 상태 업데이트 시 `sourceCollection`/`isFreeWriting` 파라미터로 분기 필수
- **연구 데이터는 `research` 접두사 컬렉션으로 완전 분리** (`researchAssignments`, `researchSubmissions`, `researchFeedback`, `researchThreads`) — 절대 기존 학생 데이터와 섞지 않음
- **Gemini 모델은 폴백 리스트로 호출** (`gemini-2.5-flash` 등 여러 개 순차 시도, 503/429/500 시 자동 전환). 목차 추출처럼 가벼운 작업엔 lite 모델, 상세 추출엔 pro/flash 우선
- **Firestore에 `undefined` 필드 절대 금지** — 값 없으면 필드 자체를 payload에서 제외
- **null-안전 보안 규칙**: `resource == null || isOwner(...) || isTeacher()` 패턴으로 존재하지 않는 문서 조회 시 권한 오류 방지
- 붙여넣기 로그는 `submissionLogs/{submissionId}` 별도 컬렉션 (1MB 문서 제한 회피)

## 인코딩 주의
PowerShell(`Get-Content`)로 파일 내용을 붙여넣을 때 한글이 깨져 보일 수 있음(터미널 코드페이지 문제, 실제 파일은 정상인 경우多). 코드 작성 시 항상 UTF-8 정상 한글로 작성할 것.

## Firestore 규칙 변경 시
`firebase deploy --only firestore:rules` 실행 전 반드시 규칙 전체 내용을 보여주고 확인받을 것. 부분 수정이 아니라 전체 규칙 파일 기준으로 관리.

## 커밋 규칙
의미 단위로 자주 커밋. 커밋 전 "커밋할까요?" 한 번 물어볼 것 (자동 커밋 금지)
커밋 메시지 형식: "wooriban: [한 줄 요약]"

## 확인 없이 하지 말 것
- `git push`
- Firestore 보안 규칙 배포
- Vercel 환경변수 변경 (`RESEARCH_WEBHOOK_SECRET`, `GEMINI_KEY_1/2` 등)
- 기존 Firestore 문서 대량 수정/삭제 스크립트 실행
- `.env.local`, `serviceAccountKey.json` 등 시크릿 파일은 절대 git add 금지 — 매번 `.gitignore` 확인 후 진행
