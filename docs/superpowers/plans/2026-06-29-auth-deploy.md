# Google OAuth + Vercel 배포 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auth.js v5(NextAuth) Google OAuth로 로그인 + Supabase 화이트리스트 접근 제어 + Vercel 배포

**Architecture:** middleware.ts에서 세션 유무 체크 → 미인증 시 /login 리디렉션. JWT 콜백에서 allowed_users 조회 후 isAllowed 플래그 포함. 서버 컴포넌트에서 isAllowed 체크 → 미허가 시 /unauthorized 리디렉션.

**Tech Stack:** next-auth@beta (Auth.js v5), @auth/core, Supabase (allowed_users/access_requests 테이블), Vercel

## Global Constraints

- Next.js 16.2.9 App Router (파일: AGENTS.md 준수)
- Admin email: `hoo000kr789@gmail.com`
- Supabase project: lekdajfvpcxezlvfgzua (KHJ)
- next-auth 버전: `next-auth@beta` (Auth.js v5 문법 사용)
- 환경변수: AUTH_SECRET (next-auth v5는 NEXTAUTH_SECRET 대신 AUTH_SECRET 권장)

---

### Task 1: 패키지 설치 + Supabase 테이블 생성

**Files:**
- Modify: `package.json` (next-auth@beta 추가)

**Interfaces:**
- Produces: `auth()`, `handlers`, `signIn`, `signOut` from `@/auth`

- [ ] **Step 1: next-auth@beta 설치**

```bash
cd proposal-draft-mvp && npm install next-auth@beta
```

Expected: package.json에 `"next-auth": "^5.x.x"` 추가됨

- [ ] **Step 2: Supabase allowed_users 테이블 생성 (execute_sql)**

```sql
CREATE TABLE IF NOT EXISTS allowed_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO allowed_users (email) VALUES ('hoo000kr789@gmail.com')
ON CONFLICT (email) DO NOTHING;
```

- [ ] **Step 3: Supabase access_requests 테이블 생성**

```sql
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);
```

- [ ] **Step 4: RLS 비활성화 (service_role key로만 접근)**

```sql
ALTER TABLE allowed_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests DISABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install next-auth@beta for Google OAuth"
```

---

### Task 2: auth.ts 설정 + API route 핸들러

**Files:**
- Create: `auth.ts` (root)
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/supabase-server.ts` (서버사이드 Supabase client)

**Interfaces:**
- Produces: `auth()`, `handlers`, `signIn`, `signOut`, `Session` 타입 (isAllowed 포함)
- Consumes: `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 1: lib/supabase-server.ts 생성**

```typescript
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 2: auth.ts 생성**

```typescript
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { createServiceClient } from '@/lib/supabase-server'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token }) {
      if (token.email) {
        const sb = createServiceClient()
        const { data } = await sb
          .from('allowed_users')
          .select('email')
          .eq('email', token.email)
          .single()
        token.isAllowed = !!data
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).isAllowed = token.isAllowed as boolean
      }
      return session
    },
  },
})
```

- [ ] **Step 3: app/api/auth/[...nextauth]/route.ts 생성**

```typescript
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 4: .env.local에 AUTH_SECRET 추가 안내**

`.env.local` 파일에 아래 추가 (로컬 개발용):
```
AUTH_SECRET=<openssl rand -base64 32 결과>
GOOGLE_CLIENT_ID=<나중에 추가>
GOOGLE_CLIENT_SECRET=<나중에 추가>
```

- [ ] **Step 5: Commit**

```bash
git add auth.ts lib/supabase-server.ts app/api/auth/
git commit -m "feat: add auth.ts Google OAuth config with allowed_users check"
```

---

### Task 3: middleware.ts 작성

**Files:**
- Create: `middleware.ts` (root)

**Interfaces:**
- Consumes: `auth()` from `@/auth`
- Produces: 미인증 → /login, 허가됨 → 통과, 미허가 → /unauthorized

- [ ] **Step 1: middleware.ts 생성**

```typescript
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // 인증 불필요 경로
  const publicPaths = ['/login', '/api/auth']
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 미인증
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  // 허가 여부 (isAllowed는 JWT에서 옴)
  const isAllowed = (session.user as any)?.isAllowed
  if (!isAllowed && pathname !== '/unauthorized') {
    const url = new URL('/unauthorized', req.url)
    return NextResponse.redirect(url)
  }

  // /admin은 관리자만
  if (pathname.startsWith('/admin') && session.user?.email !== 'hoo000kr789@gmail.com') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware for auth route protection"
```

---

### Task 4: /login 페이지

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `signIn` from `@/auth`, `auth()` for redirect check
- Produces: Google 로그인 버튼 UI

- [ ] **Step 1: app/login/page.tsx 생성**

```typescript
import { auth, signIn } from '@/auth'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-1">제안서 자동생성</h1>
        <p className="text-sm text-gray-500 mb-8">미래사업팀 전용 서비스입니다.</p>
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/' })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 로그인
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-6">승인된 계정만 접근 가능합니다.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/login/
git commit -m "feat: add /login page with Google OAuth button"
```

---

### Task 5: /unauthorized 페이지 + 접근 요청 API

**Files:**
- Create: `app/unauthorized/page.tsx`
- Create: `app/api/access-request/route.ts`

**Interfaces:**
- Consumes: `auth()`, `createServiceClient()`
- Produces: 접근 요청 폼 + POST /api/access-request

- [ ] **Step 1: app/api/access-request/route.ts 생성**

```typescript
import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await req.json()
  const email = session.user.email
  const sb = createServiceClient()

  // 중복 pending 체크
  const { data: existing } = await sb
    .from('access_requests')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .single()

  if (existing) {
    return Response.json({ error: '이미 요청이 접수되었습니다.' }, { status: 409 })
  }

  const { error } = await sb.from('access_requests').insert({ email, name })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 2: app/unauthorized/page.tsx 생성**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function UnauthorizedPage() {
  const { data: session } = useSession()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const name = session?.user?.name ?? ''
  const email = session?.user?.email ?? ''

  async function handleRequest() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error ?? '오류가 발생했습니다.')
    else setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
        <p className="text-sm text-gray-500 mb-6">
          이 서비스는 승인된 계정만 이용할 수 있습니다.
          <br />관리자에게 접근 요청을 보낼 수 있습니다.
        </p>
        {submitted ? (
          <div className="bg-green-50 text-green-700 rounded-lg px-4 py-3 text-sm">
            요청이 접수되었습니다. 관리자 승인 후 이용 가능합니다.
          </div>
        ) : (
          <>
            <div className="text-left mb-4 space-y-2">
              <div className="text-sm text-gray-500">이름: <span className="text-gray-800 font-medium">{name}</span></div>
              <div className="text-sm text-gray-500">이메일: <span className="text-gray-800 font-medium">{email}</span></div>
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={handleRequest}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '요청 중...' : '접근 요청 보내기'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: SessionProvider 추가 (unauthorized는 'use client' + useSession 사용)**

`app/layout.tsx`에 SessionProvider 래핑 추가 필요.

- [ ] **Step 4: Commit**

```bash
git add app/unauthorized/ app/api/access-request/
git commit -m "feat: add /unauthorized page and access-request API"
```

---

### Task 6: /admin 페이지 + 관리 API

**Files:**
- Create: `app/admin/page.tsx`
- Create: `app/api/admin/requests/route.ts`
- Create: `app/api/admin/requests/[id]/route.ts`

**Interfaces:**
- Consumes: `auth()`, `createServiceClient()`
- Produces: pending 요청 목록, 승인/거절 버튼

- [ ] **Step 1: app/api/admin/requests/route.ts 생성**

```typescript
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const session = await auth()
  if (session?.user?.email !== 'hoo000kr789@gmail.com') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
```

- [ ] **Step 2: app/api/admin/requests/[id]/route.ts 생성**

```typescript
import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (session?.user?.email !== 'hoo000kr789@gmail.com') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { action } = await req.json()
  const sb = createServiceClient()

  if (action === 'approve') {
    const { data: reqData } = await sb
      .from('access_requests')
      .select('email')
      .eq('id', id)
      .single()

    if (reqData?.email) {
      await sb.from('allowed_users').insert({ email: reqData.email }).onConflict('email').ignore()
    }
  }

  const status = action === 'approve' ? 'approved' : 'rejected'
  const { error } = await sb.from('access_requests').update({ status }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: app/admin/page.tsx 생성**

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import AdminPanel from './AdminPanel'

export default async function AdminPage() {
  const session = await auth()
  if (session?.user?.email !== 'hoo000kr789@gmail.com') redirect('/')

  const sb = createServiceClient()
  const { data: requests } = await sb
    .from('access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return <AdminPanel initialRequests={requests ?? []} />
}
```

- [ ] **Step 4: app/admin/AdminPanel.tsx 생성 (client component)**

```typescript
'use client'

import { useState } from 'react'

type Request = { id: string; name: string; email: string; created_at: string }

export default function AdminPanel({ initialRequests }: { initialRequests: Request[] }) {
  const [requests, setRequests] = useState<Request[]>(initialRequests)
  const [loading, setLoading] = useState<string | null>(null)

  async function handle(id: string, action: 'approve' | 'reject') {
    setLoading(id)
    await fetch(`/api/admin/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setRequests((prev) => prev.filter((r) => r.id !== id))
    setLoading(null)
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-gray-900 mb-6">접근 요청 관리</h1>
      {requests.length === 0 ? (
        <p className="text-gray-500 text-sm">대기 중인 요청이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                <p className="text-gray-500 text-xs">{r.email}</p>
                <p className="text-gray-400 text-xs mt-0.5">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handle(r.id, 'approve')}
                  disabled={loading === r.id}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  승인
                </button>
                <button
                  onClick={() => handle(r.id, 'reject')}
                  disabled={loading === r.id}
                  className="bg-white text-gray-600 border border-gray-300 text-xs px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/ app/api/admin/
git commit -m "feat: add /admin page and admin API for request management"
```

---

### Task 7: layout.tsx에 SessionProvider 추가

**Files:**
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `SessionProvider` from `next-auth/react`
- Produces: 클라이언트 컴포넌트에서 `useSession()` 사용 가능

- [ ] **Step 1: app/providers.tsx 생성**

```typescript
'use client'

import { SessionProvider } from 'next-auth/react'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

- [ ] **Step 2: app/layout.tsx 수정**

```typescript
import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: '제안서 초안 자동생성',
  description: '건설사업관리 용역 제안서 초안 자동생성 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/providers.tsx app/layout.tsx
git commit -m "feat: add SessionProvider to root layout"
```

---

### Task 8: .env.local 파일 생성 + 빌드 확인

**Files:**
- Create: `.env.local`

- [ ] **Step 1: AUTH_SECRET 생성**

PowerShell에서:
```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

- [ ] **Step 2: .env.local 작성 (GOOGLE_CLIENT_ID/SECRET은 임시값)**

```
AUTH_SECRET=<위에서 생성한 값>
GOOGLE_CLIENT_ID=placeholder
GOOGLE_CLIENT_SECRET=placeholder
```

- [ ] **Step 3: next build 실행 (타입/빌드 오류 확인)**

```bash
npm run build
```

- [ ] **Step 4: Commit + GitHub push**

```bash
git add .
git commit -m "feat: complete Google OAuth auth implementation"
git push origin master
```

---

### Task 9: Vercel 배포 (사용자 직접 수행)

이 태스크는 브라우저에서 직접 수행해야 합니다.

- [ ] **Step 1: Google Cloud Console에서 OAuth 클라이언트 생성**
  1. [console.cloud.google.com](https://console.cloud.google.com) → API 및 서비스 → OAuth 동의 화면
  2. 외부 → 앱 이름 입력 → 저장
  3. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기
  4. 유형: 웹 애플리케이션
  5. 승인된 리디렉션 URI 추가:
     - `http://localhost:3000/api/auth/callback/google`
  6. 클라이언트 ID / 보안 비밀 복사

- [ ] **Step 2: Vercel 배포**
  1. [vercel.com](https://vercel.com) → Add New Project → GitHub에서 `proposal-draft-mvp` 선택
  2. Environment Variables 입력:
     - `AUTH_SECRET` = (위에서 생성한 값)
     - `GOOGLE_CLIENT_ID` = (Google에서 발급)
     - `GOOGLE_CLIENT_SECRET` = (Google에서 발급)
     - `NEXT_PUBLIC_SUPABASE_URL` = (기존 값)
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (기존 값)
     - `SUPABASE_SERVICE_ROLE_KEY` = (기존 값)
  3. Deploy 버튼 클릭

- [ ] **Step 3: Vercel 도메인 확인 후 Google Console 리디렉션 URI 추가**
  - `https://[vercel-domain]/api/auth/callback/google` 추가

- [ ] **Step 4: Vercel 환경변수에서 AUTH_URL 추가 (도메인 설정)**
  - `AUTH_URL` = `https://[vercel-domain]`
  - Redeploy
