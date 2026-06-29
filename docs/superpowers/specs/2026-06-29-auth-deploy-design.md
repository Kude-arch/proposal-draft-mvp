# Auth + Vercel 배포 설계

**날짜:** 2026-06-29  
**대상 앱:** proposal-draft-mvp (Next.js 16.2.9 App Router)

---

## 목표

- Vercel 신규 배포
- Google OAuth 로그인 (Auth.js v5)
- 이메일 화이트리스트 기반 접근 제어
- 권한 없는 사용자의 접근 요청 기능
- 관리자(hoo000kr789@gmail.com) 승인 페이지

---

## 아키텍처

```
브라우저 → middleware.ts (세션 체크)
              ↓ 미인증            ↓ 인증됨
           /login           allowed_users 조회 (Supabase)
                                ↓ 없음          ↓ 있음
                           /unauthorized      앱 전체 접근
                                ↓
                           접근 요청 제출 → access_requests 테이블
                                                  ↓
                                          /admin (관리자 승인)
                                                  ↓
                                          allowed_users에 추가
```

---

## Supabase 테이블

### `allowed_users`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid | PK |
| email | text | unique, not null |
| created_at | timestamptz | default now() |

초기값: `hoo000kr789@gmail.com` INSERT

### `access_requests`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid | PK |
| email | text | not null |
| name | text | not null |
| status | text | 'pending' \| 'approved' \| 'rejected', default 'pending' |
| created_at | timestamptz | default now() |

---

## 페이지 및 컴포넌트

### `/login`
- "Google로 로그인" 버튼 단일 페이지
- 이미 로그인된 경우 `/`로 리디렉션

### `/unauthorized`
- 로그인은 됐지만 화이트리스트에 없을 때 표시
- 자동으로 이름(Google 계정명)과 이메일 채워진 접근 요청 폼
- 제출 → `access_requests`에 INSERT (중복 제출 방지)

### `/admin`
- `hoo000kr789@gmail.com`만 접근 가능 (다른 인증 사용자는 `/`로 리디렉션)
- pending 요청 목록 표시: 이름, 이메일, 요청일시
- 승인 버튼: `allowed_users`에 INSERT + status → 'approved'
- 거절 버튼: status → 'rejected'

### `middleware.ts`
- `/login`, `/api/auth/**` 경로는 제외
- 나머지 모든 경로: 세션 없으면 `/login`으로 리디렉션
- 세션 있으나 화이트리스트 미포함이면 `/unauthorized`로 리디렉션
- 단, 미들웨어에서 DB 조회 최소화: 화이트리스트 체크는 서버 컴포넌트에서 처리하고 세션 토큰에 `isAllowed` 플래그 포함

### Auth.js 설정 (`auth.ts`)
- Provider: Google
- `signIn` 콜백: 로그인 자체는 허용 (화이트리스트 체크는 미들웨어/페이지에서)
- `jwt` 콜백: `allowed_users` 조회 후 `isAllowed` 플래그를 토큰에 저장
- `session` 콜백: `isAllowed`를 세션에 노출

---

## API Routes

| 경로 | 메서드 | 역할 |
|------|--------|------|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js 핸들러 |
| `/api/access-request` | POST | 접근 요청 제출 |
| `/api/admin/requests` | GET | 요청 목록 조회 (관리자 전용) |
| `/api/admin/requests/[id]` | PATCH | 승인/거절 (관리자 전용) |

---

## 환경변수

### `.env.local` (로컬 개발)
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32 결과>
GOOGLE_CLIENT_ID=<Google Console에서 발급>
GOOGLE_CLIENT_SECRET=<Google Console에서 발급>
```

### Vercel 환경변수 (기존 Supabase 변수 포함)
```
NEXTAUTH_URL=https://[vercel-domain]
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 사용자가 직접 해야 할 일

### Step 1 — Google Cloud Console
1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. 프로젝트 생성 (또는 기존 선택)
3. **API 및 서비스 → OAuth 동의 화면**
   - 사용자 유형: 외부
   - 앱 이름, 지원 이메일 입력
4. **사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기**
   - 유형: 웹 애플리케이션
   - 승인된 리디렉션 URI:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://[vercel-domain]/api/auth/callback/google` (배포 후 추가)
5. 클라이언트 ID / 보안 비밀 복사

### Step 2 — GitHub push
- 현재 코드를 GitHub 레포에 push

### Step 3 — Vercel 배포
1. vercel.com → Add New Project → GitHub 레포 선택
2. Environment Variables 입력 (위 목록)
3. Deploy

### Step 4 — Google Console 리디렉션 URI 업데이트
- Vercel 도메인 확인 후 리디렉션 URI 추가

---

## 보안 고려사항

- `SUPABASE_SERVICE_ROLE_KEY`는 서버사이드에서만 사용 (admin API routes)
- `/admin` 페이지는 서버 컴포넌트에서 세션 이메일 검증
- `access_requests` 중복 제출: 동일 이메일의 pending 요청이 있으면 재제출 불가
- RLS: `allowed_users`와 `access_requests`는 service_role key로만 접근
