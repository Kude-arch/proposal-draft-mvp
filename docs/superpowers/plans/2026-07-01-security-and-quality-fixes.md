# Security & Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코드 분석으로 발견된 보안 취약점, 버그, 성능 문제, 타입 안전성 이슈를 모두 수정한다.

**Architecture:** 기존 아키텍처 변경 없이 파일별 외과적 수정. DB 레벨 수정은 Supabase 마이그레이션 SQL로 처리. NextAuth 세션 타입 확장은 `next-auth.d.ts` 선언 파일로 해결.

**Tech Stack:** Next.js App Router, TypeScript 5, NextAuth v5 beta, Supabase (PostgreSQL), Google Gemini API, pptxgenjs

## Global Constraints

- Next.js 버전 업그레이드 금지 (현재 16.2.9)
- NextAuth v5 beta API 사용 — `next-auth` import, `auth()` 함수 패턴 유지
- Supabase 서버 클라이언트는 service role key로 동작 (RLS 우회) — API 라우트는 자체 인증 로직으로 보호
- 기존 기능 동작 변경 없이 버그·보안 수정만
- 파일 경로는 `C:\Users\user\Desktop\Claude\proposal-draft-mvp` 기준

---

### Task 1: Gemini 에러 로그에서 민감 데이터 제거

**Files:**
- Modify: `lib/gemini.ts:38`

**Interfaces:**
- Produces: 동일한 `parseJsonResponse<T>` 함수, 로그에서 응답 내용 제거됨

- [ ] **Step 1: 수정 전 현재 코드 확인**

`lib/gemini.ts:33-41` 확인:
```typescript
function parseJsonResponse<T>(text: string): T {
  if (!text?.trim()) throw new Error('Gemini 응답이 비어 있습니다')
  try {
    return JSON.parse(text) as T
  } catch {
    console.error('Gemini JSON 파싱 실패. 원본 응답 앞 500자:', text.slice(0, 500))
    throw new Error('Gemini 응답을 JSON으로 파싱할 수 없습니다')
  }
}
```

- [ ] **Step 2: 응답 내용 로깅 제거**

`lib/gemini.ts:38` 수정:
```typescript
    console.error('Gemini JSON 파싱 실패')
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
cd C:\Users\user\Desktop\Claude\proposal-draft-mvp
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 4: Commit**

```bash
git add lib/gemini.ts
git commit -m "security: remove Gemini response content from error logs"
```

---

### Task 2: generate API TOCTOU 레이스 컨디션 수정

**Files:**
- Modify: `app/api/generate/route.ts:39-78`

**Interfaces:**
- Consumes: Supabase `proposals` 테이블의 `status` 컬럼
- Produces: 동시 요청 시 하나만 생성 진행, 나머지는 429 반환

**현재 버그:**
두 요청이 동시에 `status !== 'analyzing'`을 확인한 뒤 둘 다 generation 레코드 생성 및 status 변경 진행 → 중복 생성.

**Fix 전략:** status를 `'analyzing'`으로 변경하는 UPDATE를 `status != 'analyzing'` 조건을 붙여 atomic하게 실행. 업데이트된 행이 없으면(=이미 누군가 선점) 즉시 429 반환.

- [ ] **Step 1: 기존 코드 확인**

`app/api/generate/route.ts:39-78` 확인:
```typescript
  // 이미 생성 중인 경우 중복 요청 차단
  if (proposal.status === 'analyzing') {
    return Response.json({ error: '이미 생성 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })
  }

  // 10개 제한 체크
  ...

  // generation 레코드 생성
  const { data: newGen, error: genError } = await sb
    .from('slide_generations')
    .insert({ proposal_id, gen_number: nextGenNumber })
    .select()
    .single()
  if (genError || !newGen) {
    return Response.json({ error: 'generation 생성 실패' }, { status: 500 })
  }
  const generationId = newGen.id

  // 생성 중 상태 표시 (중복 요청 방지)
  await sb.from('proposals').update({ status: 'analyzing' }).eq('id', proposal_id)
```

- [ ] **Step 2: Atomic status lock으로 교체**

`app/api/generate/route.ts`의 해당 섹션을 다음으로 교체:

```typescript
  // Atomic lock: status가 'analyzing'이 아닐 때만 'analyzing'으로 변경
  // 조건부 UPDATE로 TOCTOU 레이스 컨디션 방지
  const { data: locked } = await sb
    .from('proposals')
    .update({ status: 'analyzing' })
    .eq('id', proposal_id)
    .neq('status', 'analyzing')
    .select('id')
    .maybeSingle()

  if (!locked) {
    return Response.json({ error: '이미 생성 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })
  }

  // 10개 제한 체크 (status 선점 후)
```

그리고 기존의 `if (proposal.status === 'analyzing')` 블록과 아래의 `await sb.from('proposals').update({ status: 'analyzing' })...` 줄을 제거한다.

구체적으로 변경 후 코드 흐름:
```typescript
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { proposal_id } = await req.json()
  if (!proposal_id || !isValidUuid(proposal_id)) {
    return Response.json({ error: 'invalid proposal_id' }, { status: 400 })
  }
  const sb = createServerClient()

  const { data: proposal } = await sb
    .from('proposals')
    .select('*')
    .eq('id', proposal_id)
    .single()
  if (!proposal) return Response.json({ error: 'proposal not found' }, { status: 404 })
  if (proposal.user_email !== null && proposal.user_email !== session.user.email) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 10개 제한 체크
  const { count } = await sb
    .from('slide_generations')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', proposal_id)
  if ((count ?? 0) >= 10) {
    return Response.json(
      { error: '최대 10개까지 생성 가능합니다. 기존 안을 삭제한 후 다시 시도하세요.' },
      { status: 400 }
    )
  }

  // 새 generation 번호 결정
  const { data: lastGen } = await sb
    .from('slide_generations')
    .select('gen_number')
    .eq('proposal_id', proposal_id)
    .order('gen_number', { ascending: false })
    .limit(1)
    .single()
  const nextGenNumber = (lastGen?.gen_number ?? 0) + 1

  // generation 레코드 생성
  const { data: newGen, error: genError } = await sb
    .from('slide_generations')
    .insert({ proposal_id, gen_number: nextGenNumber })
    .select()
    .single()
  if (genError || !newGen) {
    return Response.json({ error: 'generation 생성 실패' }, { status: 500 })
  }
  const generationId = newGen.id

  // Atomic lock: status가 'analyzing'이 아닐 때만 선점
  const { data: locked } = await sb
    .from('proposals')
    .update({ status: 'analyzing' })
    .eq('id', proposal_id)
    .neq('status', 'analyzing')
    .select('id')
    .maybeSingle()

  if (!locked) {
    await sb.from('slide_generations').delete().eq('id', generationId)
    return Response.json({ error: '이미 생성 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })
  }

  let insertionSucceeded = false
  try {
    // ... 기존 로직 유지 ...
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 4: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "fix: atomic status lock to prevent concurrent generation race condition"
```

---

### Task 3: TypeScript any 타입 캐스트 제거

**Files:**
- Create: `types/next-auth.d.ts`
- Modify: `proxy.ts:18`
- Modify: `auth.ts:40`

**Interfaces:**
- Produces: `session.user.isAllowed` 타입 안전하게 접근 가능

- [ ] **Step 1: NextAuth 타입 확장 선언 파일 생성**

`types/next-auth.d.ts` 파일 생성:
```typescript
import 'next-auth'

declare module 'next-auth' {
  interface User {
    isAllowed?: boolean
  }
  interface Session {
    user: User & {
      isAllowed?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAllowed?: boolean
  }
}
```

- [ ] **Step 2: proxy.ts의 any 캐스트 제거**

`proxy.ts:18` 수정:
```typescript
  // 변경 전:
  const isAllowed = (session.user as any)?.isAllowed
  // 변경 후:
  const isAllowed = session.user?.isAllowed
```

- [ ] **Step 3: auth.ts의 any 캐스트 제거**

`auth.ts:40` 수정:
```typescript
    async session({ session, token }) {
      if (session.user) {
        // 변경 전: (session.user as { isAllowed?: boolean }).isAllowed = token.isAllowed as boolean
        session.user.isAllowed = token.isAllowed as boolean
      }
      return session
    },
```

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 5: Commit**

```bash
git add types/next-auth.d.ts proxy.ts auth.ts
git commit -m "refactor: add NextAuth type declarations to remove any casts"
```

---

### Task 4: 레거시 null 제안서 접근 제어 수정

**Files:**
- Modify: `lib/proposal-access.ts:29`
- Modify: `app/(main)/page.tsx:16`

**배경:**
현재 `user_email IS NULL`인 레코드(마이그레이션 전 데이터)는 모든 인증된 사용자가 소유자로 접근 가능. 이를 관리자(ADMIN_EMAIL) 전용으로 제한.

- [ ] **Step 1: proposal-access.ts 수정**

`lib/proposal-access.ts:29` 수정:

```typescript
  // 변경 전:
  // 소유자 (user_email IS NULL 은 마이그레이션 전 레거시 데이터)
  if (proposal.user_email === null || proposal.user_email === userEmail) {
    return { proposal, access: 'owner', sb }
  }

  // 변경 후:
  // 소유자 확인 (null 레거시 데이터는 관리자만 접근)
  const adminEmail = process.env.ADMIN_EMAIL
  if (proposal.user_email === userEmail) {
    return { proposal, access: 'owner', sb }
  }
  if (proposal.user_email === null && adminEmail && userEmail === adminEmail) {
    return { proposal, access: 'owner', sb }
  }
```

- [ ] **Step 2: home page 쿼리 수정**

`app/(main)/page.tsx:14-17` 수정:

```typescript
  // 변경 전:
  const { data: ownedProposals } = userEmail
    ? await query.or(`user_email.eq.${userEmail},user_email.is.null`)
    : await query.is('user_email', null)

  // 변경 후:
  const adminEmail = process.env.ADMIN_EMAIL
  const isAdmin = userEmail && adminEmail && userEmail === adminEmail
  const { data: ownedProposals } = userEmail
    ? isAdmin
      ? await query.or(`user_email.eq.${userEmail},user_email.is.null`)
      : await query.eq('user_email', userEmail)
    : await query.is('user_email', null)
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 4: Commit**

```bash
git add lib/proposal-access.ts app/(main)/page.tsx
git commit -m "security: restrict legacy null proposals to admin only"
```

---

### Task 5: PPTX 이미지 동시 요청 제한

**Files:**
- Modify: `lib/pptx-generator.ts:106-110`

**Interfaces:**
- Consumes: `allImageUrls: Set<string>`
- Produces: 동일한 `imageCache: Map<string, string | null>`, 최대 5개 동시 fetch

- [ ] **Step 1: 현재 코드 확인**

`lib/pptx-generator.ts:96-110`:
```typescript
  const allImageUrls = new Set<string>()
  for (const slide of slides) {
    for (const cell of slide.cells ?? []) {
      if (cell.image_url && isSafeImageUrl(cell.image_url)) {
        allImageUrls.add(cell.image_url)
      }
    }
  }
  const imageCache = new Map<string, string | null>()
  await Promise.all(
    Array.from(allImageUrls).map(async url => {
      imageCache.set(url, await fetchImageAsDataUri(url))
    })
  )
```

- [ ] **Step 2: 배치 처리 함수 추가 및 교체**

`lib/pptx-generator.ts`에서 `isSafeImageUrl` 함수 아래(13번째 줄 이후)에 배치 헬퍼 추가:

```typescript
async function batchFetchImages(
  urls: string[],
  concurrency = 5
): Promise<Map<string, string | null>> {
  const cache = new Map<string, string | null>()
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    await Promise.all(
      batch.map(async url => {
        cache.set(url, await fetchImageAsDataUri(url))
      })
    )
  }
  return cache
}
```

그리고 기존 `Promise.all(Array.from(allImageUrls).map(...))` 블록을 교체:

```typescript
  const imageCache = await batchFetchImages(
    Array.from(allImageUrls).filter(isSafeImageUrl)
  )
```

(기존의 `allImageUrls.add(url)` 루프에서 `isSafeImageUrl` 체크를 이미 하므로, 전체 Set을 그대로 넘겨도 됨. 단순화를 위해 Set은 유지하고 `imageCache` 선언 부분만 교체)

정확한 수정:
```typescript
  // 변경 전:
  const imageCache = new Map<string, string | null>()
  await Promise.all(
    Array.from(allImageUrls).map(async url => {
      imageCache.set(url, await fetchImageAsDataUri(url))
    })
  )

  // 변경 후:
  const imageCache = await batchFetchImages(Array.from(allImageUrls))
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 4: Commit**

```bash
git add lib/pptx-generator.ts
git commit -m "perf: limit concurrent image fetches in PPTX generator to 5 at a time"
```

---

### Task 6: 홈 페이지 멤버 제안서 에러 처리 개선

**Files:**
- Modify: `app/(main)/page.tsx:40-42`

**배경:** 멤버 제안서 로드 실패 시 조용히 무시 → 사용자는 데이터 누락을 인지 불가.

- [ ] **Step 1: 현재 코드 확인**

`app/(main)/page.tsx:40-42`:
```typescript
    } catch {
      // 멤버 제안서 로드 실패 시 소유 제안서만 표시
    }
```

- [ ] **Step 2: 에러 로깅 추가**

```typescript
    } catch (err) {
      console.error('[Home] 멤버 제안서 로드 실패:', err)
      // 멤버 제안서 로드 실패 시 소유 제안서만 표시
    }
```

- [ ] **Step 3: Commit**

```bash
git add app/(main)/page.tsx
git commit -m "fix: log error when member proposals fail to load"
```

---

### Task 7: Supabase RLS 정책 추가

**Files:**
- Create: `supabase/migration_rls_policies.sql`

**배경:**
현재 API 라우트는 service role key를 사용하므로 RLS가 직접 적용되지 않지만, anon key를 통한 직접 DB 접근 시 방어막 역할을 함. 또한 향후 service key에서 JWT 기반 auth로 전환 시 기반이 됨.

- [ ] **Step 1: RLS 마이그레이션 파일 생성**

`supabase/migration_rls_policies.sql`:
```sql
-- RLS 활성화
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE slide_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;

-- proposals: 소유자 또는 멤버만 접근
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT USING (
    auth.email() = user_email
    OR EXISTS (
      SELECT 1 FROM proposal_members
      WHERE proposal_members.proposal_id = proposals.id
        AND proposal_members.user_email = auth.email()
    )
    OR user_email IS NULL  -- 레거시 데이터: 인증된 사용자 모두 접근 (API에서 추가 제한)
  );

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT WITH CHECK (auth.email() = user_email);

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE USING (auth.email() = user_email);

CREATE POLICY "proposals_delete" ON proposals
  FOR DELETE USING (auth.email() = user_email);

-- proposal_members: 해당 제안서 소유자만 관리
CREATE POLICY "proposal_members_select" ON proposal_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_members.proposal_id
        AND proposals.user_email = auth.email()
    )
    OR user_email = auth.email()
  );

CREATE POLICY "proposal_members_insert" ON proposal_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_members.proposal_id
        AND proposals.user_email = auth.email()
    )
  );

CREATE POLICY "proposal_members_delete" ON proposal_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_members.proposal_id
        AND proposals.user_email = auth.email()
    )
  );

-- proposal_slides: 제안서 접근 가능한 사용자만
CREATE POLICY "proposal_slides_select" ON proposal_slides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_slides.proposal_id
        AND (
          proposals.user_email = auth.email()
          OR proposals.user_email IS NULL
          OR EXISTS (
            SELECT 1 FROM proposal_members
            WHERE proposal_members.proposal_id = proposals.id
              AND proposal_members.user_email = auth.email()
          )
        )
    )
  );

-- slide_cells: proposal_slides를 통해 간접 접근 제어
CREATE POLICY "slide_cells_select" ON slide_cells
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposal_slides
      JOIN proposals ON proposals.id = proposal_slides.proposal_id
      WHERE proposal_slides.id = slide_cells.slide_id
        AND (
          proposals.user_email = auth.email()
          OR proposals.user_email IS NULL
          OR EXISTS (
            SELECT 1 FROM proposal_members
            WHERE proposal_members.proposal_id = proposals.id
              AND proposal_members.user_email = auth.email()
          )
        )
    )
  );

-- proposal_sections: 제안서 접근 가능한 사용자만
CREATE POLICY "proposal_sections_select" ON proposal_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
        AND (
          proposals.user_email = auth.email()
          OR proposals.user_email IS NULL
          OR EXISTS (
            SELECT 1 FROM proposal_members
            WHERE proposal_members.proposal_id = proposals.id
              AND proposal_members.user_email = auth.email()
          )
        )
    )
  );

-- allowed_users: service role만 읽기 (일반 사용자 접근 차단)
CREATE POLICY "allowed_users_no_access" ON allowed_users
  FOR ALL USING (false);

-- 참고: 위 RLS 정책은 현재 서비스 키(service_role)를 사용하는 API 라우트에는 적용되지 않음.
-- anon key를 통한 직접 DB 접근 및 향후 JWT 기반 Supabase auth 전환 시 적용됨.
```

- [ ] **Step 2: Supabase 대시보드에서 마이그레이션 실행**

Supabase 프로젝트 lekdajfvpcxezlvfgzua의 SQL Editor에서 위 SQL을 실행.

또는 MCP 도구로 실행:
```
mcp__b8e56f61-eb8a-4984-a3c1-7a7229dcd4be__apply_migration 사용
project_id: lekdajfvpcxezlvfgzua
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migration_rls_policies.sql
git commit -m "security: add Supabase RLS policies for defense-in-depth"
```

---

### Task 8: 관리자 인증 DB 기반으로 전환

**Files:**
- Create: `supabase/migration_admin_field.sql`
- Modify: `auth.ts`
- Modify: `types/next-auth.d.ts` (Task 3에서 생성)
- Modify: `proxy.ts`
- Modify: `app/api/admin/users/route.ts`
- Modify: `app/api/admin/users/[id]/route.ts`
- Modify: `app/api/admin/requests/route.ts`
- Modify: `app/api/admin/requests/[id]/route.ts`

**배경:**
현재 `ADMIN_EMAIL` 환경변수에만 의존. `allowed_users` 테이블에 `is_admin` 컬럼을 추가해 DB 기반으로 전환.

- [ ] **Step 1: DB 마이그레이션 파일 생성**

`supabase/migration_admin_field.sql`:
```sql
-- allowed_users 테이블에 관리자 플래그 추가
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ADMIN_EMAIL 환경변수의 사용자를 관리자로 설정 (실행 시 수동으로 이메일 입력)
-- UPDATE allowed_users SET is_admin = true WHERE email = 'admin@example.com';
```

- [ ] **Step 2: DB에서 마이그레이션 실행 후 관리자 이메일에 is_admin=true 설정**

Supabase SQL Editor에서 실행:
```sql
-- 현재 ADMIN_EMAIL에 해당하는 사용자를 관리자로 설정
UPDATE allowed_users SET is_admin = true WHERE email = '현재_ADMIN_EMAIL_값';
```

- [ ] **Step 3: NextAuth JWT에 isAdmin 추가**

`types/next-auth.d.ts` (Task 3에서 생성된 파일)에 `isAdmin` 추가:
```typescript
import 'next-auth'

declare module 'next-auth' {
  interface User {
    isAllowed?: boolean
    isAdmin?: boolean
  }
  interface Session {
    user: User & {
      isAllowed?: boolean
      isAdmin?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAllowed?: boolean
    isAdmin?: boolean
  }
}
```

- [ ] **Step 4: auth.ts JWT 콜백에 isAdmin 추가**

`auth.ts:29-34` 수정 — `isAllowed` 조회 쿼리에 `is_admin` 컬럼 추가:
```typescript
        const query = userId
          ? sb.from('allowed_users').select('email, is_admin').or(`email.eq.${token.email},user_id.eq.${userId}`)
          : sb.from('allowed_users').select('email, is_admin').eq('email', token.email)

        const { data } = await query.limit(1).single()
        token.isAllowed = !!data
        token.isAdmin = !!(data as { is_admin?: boolean } | null)?.is_admin
```

- [ ] **Step 5: auth.ts session 콜백에 isAdmin 추가**

```typescript
    async session({ session, token }) {
      if (session.user) {
        session.user.isAllowed = token.isAllowed as boolean
        session.user.isAdmin = token.isAdmin as boolean
      }
      return session
    },
```

- [ ] **Step 6: proxy.ts 관리자 체크 수정**

`proxy.ts:24` 수정:
```typescript
  // 변경 전:
  if (pathname.startsWith('/admin') && session.user?.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // 변경 후:
  if (pathname.startsWith('/admin') && !session.user?.isAdmin) {
    return NextResponse.redirect(new URL('/', req.url))
  }
```

- [ ] **Step 7: 관리자 API 라우트들 수정**

아래 4개 파일에서 `session?.user?.email !== process.env.ADMIN_EMAIL` 패턴을 `!session?.user?.isAdmin` 으로 교체:

`app/api/admin/users/route.ts`:
```typescript
  if (!session?.user?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })
```

`app/api/admin/requests/route.ts`:
```typescript
  if (!session?.user?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })
```

`app/api/admin/users/[id]/route.ts` (존재하는 경우):
```typescript
  if (!session?.user?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })
```

`app/api/admin/requests/[id]/route.ts` (존재하는 경우):
```typescript
  if (!session?.user?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })
```

- [ ] **Step 8: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 9: Commit**

```bash
git add supabase/migration_admin_field.sql types/next-auth.d.ts auth.ts proxy.ts app/api/admin/
git commit -m "security: switch admin auth to DB-based is_admin field"
```

---

### Task 9: lib/proposal-access.ts 타입 개선

**Files:**
- Modify: `lib/proposal-access.ts:6`

**배경:** `Record<string, unknown>`을 적절한 타입으로 교체.

- [ ] **Step 1: types/index.ts에서 Proposal 타입 확인**

`types/index.ts`를 읽어 `Proposal` 인터페이스 확인.

- [ ] **Step 2: proposal-access.ts 타입 수정**

`lib/proposal-access.ts:1-9`에서 import 추가 및 타입 교체:
```typescript
import { createServerClient } from '@/lib/supabase'
import type { Proposal } from '@/types'

export type AccessLevel = 'owner' | 'member' | null

interface AccessResult {
  proposal: Proposal | null
  access: AccessLevel
  sb: ReturnType<typeof createServerClient>
}
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```
Expected: 오류 없음 (Proposal 타입이 모든 필드를 커버하면)

- [ ] **Step 4: Commit**

```bash
git add lib/proposal-access.ts
git commit -m "refactor: use Proposal type instead of Record<string, unknown> in proposal-access"
```

---

## Self-Review

### Spec Coverage 체크

| 분석 이슈 | 대응 태스크 | 상태 |
|-----------|------------|------|
| Gemini 에러 로그 민감 정보 | Task 1 | ✓ |
| TOCTOU 레이스 컨디션 | Task 2 | ✓ |
| TypeScript any 캐스트 | Task 3 | ✓ |
| 레거시 null 제안서 접근 | Task 4 | ✓ |
| PPTX 이미지 동시 요청 과다 | Task 5 | ✓ |
| 멤버 제안서 에러 무시 | Task 6 | ✓ |
| Supabase RLS 정책 없음 | Task 7 | ✓ |
| 관리자 인증 DB 기반 전환 | Task 8 | ✓ |
| proposal-access 타입 | Task 9 | ✓ |
| generate 상태 복구 | 기존 finally 블록이 이미 처리함 | 불필요 |
| .env.local 노출 | .gitignore에 `.env*` 이미 포함됨 | 불필요 |
| N+1 쿼리 | 실제로는 3쿼리 (N+1 아님), MVP 수준 허용 | 미반영 |

### Placeholder 확인

없음.

### 타입 일관성 확인

- Task 3에서 생성하는 `types/next-auth.d.ts`에 `isAdmin`이 없는데, Task 8에서 추가함 → Task 3이 먼저 실행되고 Task 8에서 파일을 수정하는 구조로 일관됨.
- Task 9에서 `Proposal` 타입 사용 — `types/index.ts` 확인 후 적용 필요.
