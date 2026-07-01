# Slide Generation History (안 시스템) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 제안서에서 슬라이드를 여러 번 생성(1안, 2안...)할 수 있고, 각 안을 독립적으로 편집·내보내기 가능하며, 최대 10안으로 제한한다.

**Architecture:** `slide_generations` 테이블이 생성 회차를 관리하고, `proposal_slides.generation_id`로 각 슬라이드가 어느 안에 속하는지 태그한다. 편집·내보내기 페이지는 URL 쿼리 파라미터 `?gen=<generation_id>`로 현재 선택된 안을 추적한다. Generate API는 10개 제한을 체크하고, 기존 슬라이드를 삭제하지 않고 새 generation 레코드를 생성한다.

**Tech Stack:** Next.js 16.2.9 App Router, Supabase (PostgreSQL), TypeScript

## Global Constraints

- Next.js 16.2.9 App Router — `app/` 디렉토리, route handlers, `proxy.ts` (not `middleware.ts`)
- Supabase anon client: `createServerClient()` from `@/lib/supabase`
- Supabase service client: `createServiceClient()` from `@/lib/supabase-server`
- 안 최대 10개 — 10개 존재 시 generate API 400 반환, auto-delete 없음
- URL 쿼리: `?gen=<uuid>` — 편집/내보내기 페이지에서 선택 안 유지
- 모든 'use client' 페이지에서 `useSearchParams()`로 gen 읽기
- 기존 `proposal_slides`(generation_id = NULL)는 마이그레이션에서 generation 1로 처리

## File Structure

```
supabase/
  migration_slide_generations.sql   [NEW] DB 마이그레이션 스크립트

types/
  index.ts                          [MODIFY] SlideGeneration 타입 추가, ProposalSlide에 generation_id

app/api/proposals/[id]/
  generations/
    route.ts                        [NEW] GET 안 목록
    [genId]/
      route.ts                      [NEW] DELETE 안 삭제

app/api/
  generate/route.ts                 [MODIFY] 10개 체크 + generation 생성 + 기존 삭제 제거
  proposals/[id]/slides/route.ts    [MODIFY] ?gen= 쿼리 파라미터 지원
  export/route.ts                   [MODIFY] generation_id 파라미터 지원

app/(main)/proposals/[id]/
  edit/page.tsx                     [MODIFY] 안 탭 UI + gen 쿼리 파라미터
  generate/page.tsx                 [MODIFY] 10개 제한 메시지 + gen-aware 리다이렉트
  export/page.tsx                   [MODIFY] gen 쿼리 파라미터 + 안 표시
```

---

### Task 1: DB 마이그레이션 + 타입 추가

**Files:**
- Create: `supabase/migration_slide_generations.sql`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `SlideGeneration` 타입, `ProposalSlide.generation_id?: string`

- [ ] **Step 1: SQL 마이그레이션 파일 작성**

`supabase/migration_slide_generations.sql` 파일을 다음 내용으로 생성:

```sql
-- 1. slide_generations 테이블 생성
CREATE TABLE slide_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  gen_number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, gen_number)
);

-- 2. proposal_slides에 generation_id 컬럼 추가 (nullable로 시작)
ALTER TABLE proposal_slides
  ADD COLUMN generation_id uuid REFERENCES slide_generations(id) ON DELETE CASCADE;

-- 3. 기존 슬라이드들을 위한 generation 1 레코드 삽입
INSERT INTO slide_generations (proposal_id, gen_number)
SELECT DISTINCT proposal_id, 1
FROM proposal_slides
WHERE proposal_id IS NOT NULL;

-- 4. 기존 슬라이드의 generation_id를 방금 만든 레코드로 업데이트
UPDATE proposal_slides ps
SET generation_id = sg.id
FROM slide_generations sg
WHERE ps.proposal_id = sg.proposal_id
  AND sg.gen_number = 1
  AND ps.generation_id IS NULL;

-- 5. generation_id NOT NULL 제약 추가 (기존 데이터 마이그레이션 후)
ALTER TABLE proposal_slides ALTER COLUMN generation_id SET NOT NULL;
```

- [ ] **Step 2: Supabase SQL 에디터에서 마이그레이션 실행**

Supabase 대시보드 → KHJ 프로젝트(`lekdajfvpcxezlvfgzua`) → SQL Editor → 위 스크립트 실행.
성공 확인: `SELECT count(*) FROM slide_generations;` 로 row가 생겼는지 확인.

- [ ] **Step 3: types/index.ts에 SlideGeneration 타입 추가 + ProposalSlide 수정**

`types/index.ts` 파일에서:

기존 `ProposalSlide` 인터페이스에 `generation_id: string` 추가:
```typescript
export interface ProposalSlide {
  id: string
  proposal_id: string
  section_id: string | null
  generation_id: string          // ← 추가
  slide_number: number
  order_index: number
  layout_type: string
  slide_title: string | null
  cols: number
  rows: number
  created_at: string
  cells?: SlideCell[]
}
```

파일 맨 아래에 `SlideGeneration` 타입 추가:
```typescript
export interface SlideGeneration {
  id: string
  proposal_id: string
  gen_number: number
  created_at: string
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd C:/Users/user/Desktop/Claude/proposal-draft-mvp
npm run build
```

Expected: 컴파일 성공 (generation_id가 optional이 아니라 required이므로 타입 에러 없어야 함)

- [ ] **Step 5: 커밋**

```bash
git add supabase/migration_slide_generations.sql types/index.ts
git commit -m "feat: add SlideGeneration type and DB migration for slide generations"
```

---

### Task 2: 안 목록 조회 + 삭제 API

**Files:**
- Create: `app/api/proposals/[id]/generations/route.ts`
- Create: `app/api/proposals/[id]/generations/[genId]/route.ts`

**Interfaces:**
- Consumes: `createServerClient()` from `@/lib/supabase`
- Produces:
  - `GET /api/proposals/[id]/generations` → `SlideGeneration[]` (gen_number ASC)
  - `DELETE /api/proposals/[id]/generations/[genId]` → `{ ok: true }` or error

- [ ] **Step 1: GET 안 목록 API 작성**

`app/api/proposals/[id]/generations/route.ts` 파일 생성:

```typescript
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = createServerClient()

  const { data, error } = await sb
    .from('slide_generations')
    .select('id, proposal_id, gen_number, created_at')
    .eq('proposal_id', id)
    .order('gen_number', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
```

- [ ] **Step 2: DELETE 안 삭제 API 작성**

`app/api/proposals/[id]/generations/[genId]/route.ts` 파일 생성:

```typescript
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; genId: string }> }
) {
  const { id, genId } = await params
  const sb = createServerClient()

  // 해당 generation이 이 proposal에 속하는지 확인
  const { data: gen } = await sb
    .from('slide_generations')
    .select('id')
    .eq('id', genId)
    .eq('proposal_id', id)
    .single()
  if (!gen) return Response.json({ error: 'not found' }, { status: 404 })

  // slide_cells 먼저 삭제 (cascade가 없을 경우 대비)
  const { data: slides } = await sb
    .from('proposal_slides')
    .select('id')
    .eq('generation_id', genId)
  if (slides?.length) {
    const slideIds = slides.map((s: { id: string }) => s.id)
    await sb.from('slide_cells').delete().in('slide_id', slideIds)
    await sb.from('proposal_slides').delete().in('id', slideIds)
  }

  // generation 삭제
  const { error } = await sb
    .from('slide_generations')
    .delete()
    .eq('id', genId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공, 라우트 목록에 `/api/proposals/[id]/generations` 표시

- [ ] **Step 4: 커밋**

```bash
git add app/api/proposals/[id]/generations/
git commit -m "feat: add GET/DELETE generations API"
```

---

### Task 3: Generate API 수정 (10개 제한 + 신규 generation 생성)

**Files:**
- Modify: `app/api/generate/route.ts`

**Interfaces:**
- Consumes: 없음 (기존 request body 동일: `{ proposal_id }`)
- Produces: 기존 `{ total_slides, slides }` + `generation_id: string`, `gen_number: number` 추가. 10개 초과 시 `{ error: '최대 10개까지 생성 가능합니다.' }` with status 400

- [ ] **Step 1: generate/route.ts 수정 — 기존 삭제 로직 제거 + 10개 체크 + generation 생성**

`app/api/generate/route.ts`에서 변경할 부분:

**삭제할 코드 (줄 54-63, 기존 슬라이드 삭제 로직):**
```typescript
// 기존 슬라이드/셀 삭제
const { data: oldSlides } = await sb
  .from('proposal_slides')
  .select('id')
  .eq('proposal_id', proposal_id)
if (oldSlides?.length) {
  const slideIds = oldSlides.map((s: { id: string }) => s.id)
  await sb.from('slide_cells').delete().in('slide_id', slideIds)
  await sb.from('proposal_slides').delete().eq('proposal_id', proposal_id)
}
```

**대체할 코드 (sections 조회 이전, proposal 조회 이후에 삽입):**
```typescript
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
```

- [ ] **Step 2: slide insert에 generation_id 추가**

파일 내 `proposal_slides` insert 구문 (줄 204-216 부근) 수정:

기존:
```typescript
const { data: slide, error: slideErr } = await sb
  .from('proposal_slides')
  .insert({
    proposal_id,
    section_id: section.id,
    slide_number: slideNumber,
    order_index: globalSlideIndex,
    layout_type: layoutType,
    slide_title: `${section.title}${slideCount > 1 ? ` (${si + 1}/${slideCount})` : ''}`,
    cols,
    rows,
  })
  .select()
  .single()
```

변경 후:
```typescript
const { data: slide, error: slideErr } = await sb
  .from('proposal_slides')
  .insert({
    proposal_id,
    section_id: section.id,
    generation_id: generationId,    // ← 추가
    slide_number: slideNumber,
    order_index: globalSlideIndex,
    layout_type: layoutType,
    slide_title: `${section.title}${slideCount > 1 ? ` (${si + 1}/${slideCount})` : ''}`,
    cols,
    rows,
  })
  .select()
  .single()
```

- [ ] **Step 3: 응답에 generation_id, gen_number 추가**

파일 맨 끝 return 구문 변경:

기존:
```typescript
await sb.from('proposals').update({ status: 'slides_ready' }).eq('id', proposal_id)
return Response.json({ total_slides: globalSlideIndex, slides: allSlides })
```

변경 후:
```typescript
await sb.from('proposals').update({ status: 'slides_ready' }).eq('id', proposal_id)
return Response.json({
  total_slides: globalSlideIndex,
  slides: allSlides,
  generation_id: generationId,
  gen_number: nextGenNumber,
})
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공

- [ ] **Step 5: 커밋**

```bash
git add app/api/generate/route.ts
git commit -m "feat: generate API creates new generation record, enforces 10-gen limit"
```

---

### Task 4: Slides API — gen 쿼리 파라미터 지원

**Files:**
- Modify: `app/api/proposals/[id]/slides/route.ts`

**Interfaces:**
- Consumes: `?gen=<uuid>` query param (optional)
- Produces: gen 지정 시 해당 generation의 슬라이드, 없으면 최신 generation 슬라이드

- [ ] **Step 1: slides/route.ts 수정**

`app/api/proposals/[id]/slides/route.ts` 전체 교체:

```typescript
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const genId = req.nextUrl.searchParams.get('gen')
  const sb = createServerClient()

  let targetGenId = genId

  // gen 파라미터 없으면 최신 generation 사용
  if (!targetGenId) {
    const { data: latestGen } = await sb
      .from('slide_generations')
      .select('id')
      .eq('proposal_id', id)
      .order('gen_number', { ascending: false })
      .limit(1)
      .single()
    targetGenId = latestGen?.id ?? null
  }

  // generation이 하나도 없으면 빈 배열 반환 (신규 proposal)
  if (!targetGenId) return Response.json([])

  const { data: slides, error } = await sb
    .from('proposal_slides')
    .select(`*, cells:slide_cells(*)`)
    .eq('proposal_id', id)
    .eq('generation_id', targetGenId)
    .order('order_index')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(slides ?? [])
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공

- [ ] **Step 3: 커밋**

```bash
git add app/api/proposals/[id]/slides/route.ts
git commit -m "feat: slides API supports ?gen= query param to filter by generation"
```

---

### Task 5: Export API — generation_id 지원

**Files:**
- Modify: `app/api/export/route.ts`

**Interfaces:**
- Consumes: request body `{ proposal_id: string, generation_id?: string }`
- Produces: 기존과 동일 (PPTX blob), 단 해당 generation 슬라이드만 사용

- [ ] **Step 1: export/route.ts 수정**

`app/api/export/route.ts` 전체 교체:

```typescript
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generatePptx } from '@/lib/pptx-generator'

export async function POST(req: NextRequest) {
  const { proposal_id, generation_id } = await req.json()
  const sb = createServerClient()

  const { data: proposal } = await sb
    .from('proposals')
    .select('*')
    .eq('id', proposal_id)
    .single()
  if (!proposal) return Response.json({ error: 'proposal not found' }, { status: 404 })

  // generation_id 지정 없으면 최신 generation 사용
  let targetGenId = generation_id
  if (!targetGenId) {
    const { data: latestGen } = await sb
      .from('slide_generations')
      .select('id')
      .eq('proposal_id', proposal_id)
      .order('gen_number', { ascending: false })
      .limit(1)
      .single()
    targetGenId = latestGen?.id ?? null
  }

  const query = sb
    .from('proposal_slides')
    .select(`*, cells:slide_cells(*)`)
    .eq('proposal_id', proposal_id)
    .order('order_index')

  const { data: slides } = targetGenId
    ? await query.eq('generation_id', targetGenId)
    : await query

  if (!slides?.length) return Response.json({ error: '슬라이드가 없습니다' }, { status: 400 })

  const pptxBuffer = await generatePptx(proposal, slides)

  const filename = `${proposal.title ?? 'proposal'}_제안서.pptx`
    .replace(/[/\\:*?"<>|]/g, '_')

  return new Response(new Uint8Array(pptxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공

- [ ] **Step 3: 커밋**

```bash
git add app/api/export/route.ts
git commit -m "feat: export API uses generation_id to export specific plan"
```

---

### Task 6: 편집 페이지 — 안 탭 UI + gen 쿼리 파라미터

**Files:**
- Modify: `app/(main)/proposals/[id]/edit/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/proposals/[id]/generations` → `SlideGeneration[]`
  - `GET /api/proposals/[id]/slides?gen=<id>` → slides
  - `DELETE /api/proposals/[id]/generations/[genId]` → `{ ok: true }`
- Produces: 안 탭 UI, gen별 슬라이드 편집, PPTX 내보내기 버튼에 gen 파라미터 전달

- [ ] **Step 1: edit/page.tsx 전체 교체**

`app/(main)/proposals/[id]/edit/page.tsx` 파일을 다음 내용으로 교체:

```typescript
'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepNav from '@/components/StepNav'
import SlideGrid from '@/components/SlideGrid'
import type { ProposalSlide, SlideCell, ProposalItem, SlideGeneration } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const genParam = searchParams.get('gen')

  const [generations, setGenerations] = useState<SlideGeneration[]>([])
  const [selectedGenId, setSelectedGenId] = useState<string | null>(genParam)
  const [slides, setSlides] = useState<(ProposalSlide & { cells: SlideCell[] })[]>([])
  const [sectionKeywords, setSectionKeywords] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [deletingGenId, setDeletingGenId] = useState<string | null>(null)

  const loadGenerations = useCallback(async () => {
    const res = await fetch(`/api/proposals/${id}/generations`)
    const data: SlideGeneration[] = await res.json()
    setGenerations(data)
    return data
  }, [id])

  const loadSlides = useCallback(async (genId: string | null) => {
    setLoading(true)
    try {
      const genQuery = genId ? `?gen=${genId}` : ''
      const [slidesRes, sectionsRes] = await Promise.all([
        fetch(`/api/proposals/${id}/slides${genQuery}`),
        fetch(`/api/proposals/${id}/sections`),
      ])
      const slidesData = await slidesRes.json()
      const sectionsData = await sectionsRes.json()
      setSlides(Array.isArray(slidesData) ? slidesData : [])
      const kwMap: Record<string, string[]> = {}
      for (const sec of (Array.isArray(sectionsData) ? sectionsData : [])) {
        kwMap[sec.id] = sec.search_keywords ?? []
      }
      setSectionKeywords(kwMap)
    } catch (e) {
      console.error('슬라이드 로드 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [id])

  // 초기 로드: generations 먼저, 그 후 선택된 gen의 슬라이드
  useEffect(() => {
    loadGenerations().then(gens => {
      if (gens.length === 0) {
        setLoading(false)
        return
      }
      // URL gen 파라미터가 유효하면 사용, 없으면 최신(마지막) gen 선택
      const validGen = genParam && gens.find(g => g.id === genParam) ? genParam : gens[gens.length - 1].id
      setSelectedGenId(validGen)
      loadSlides(validGen)
      // URL에 gen 파라미터 반영
      if (validGen !== genParam) {
        router.replace(`/proposals/${id}/edit?gen=${validGen}`)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function switchGen(genId: string) {
    setSelectedGenId(genId)
    router.replace(`/proposals/${id}/edit?gen=${genId}`)
    loadSlides(genId)
  }

  async function handleDeleteGen(genId: string, genNumber: number) {
    if (!confirm(`${genNumber}안을 삭제하시겠습니까? 해당 안의 슬라이드가 모두 삭제됩니다.`)) return
    setDeletingGenId(genId)
    const res = await fetch(`/api/proposals/${id}/generations/${genId}`, { method: 'DELETE' })
    if (res.ok) {
      const newGens = generations.filter(g => g.id !== genId)
      setGenerations(newGens)
      if (selectedGenId === genId) {
        if (newGens.length > 0) {
          const nextGen = newGens[newGens.length - 1]
          switchGen(nextGen.id)
        } else {
          setSelectedGenId(null)
          setSlides([])
          router.replace(`/proposals/${id}/edit`)
        }
      }
    }
    setDeletingGenId(null)
  }

  function handleSlideUpdate(updatedSlide: ProposalSlide & { cells: SlideCell[] }) {
    setSlides(prev => prev.map(s => s.id === updatedSlide.id ? updatedSlide : s))
  }

  async function handleCellUpdate(slideId: string, cellId: string, item: ProposalItem | null) {
    const res = await fetch(`/api/slides/${slideId}/cells/${cellId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        db_item_id: item?.id ?? null,
        image_url: item?.image_url ?? null,
        item_title: item?.title ?? null,
      }),
    })
    if (res.ok) {
      setSlides(prev =>
        prev.map(slide => {
          if (slide.id !== slideId) return slide
          return {
            ...slide,
            cells: slide.cells.map(cell =>
              cell.id === cellId
                ? {
                    ...cell,
                    db_item_id: item?.id ?? null,
                    image_url: item?.image_url ?? null,
                    item_title: item?.title ?? null,
                  }
                : cell
            ),
          }
        })
      )
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'done' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'active' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'pending' as const },
  ]

  const atLimit = generations.length >= 10

  if (loading)
    return <div className="p-8 text-gray-400">슬라이드 불러오는 중...</div>

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-gray-200 flex-shrink-0">
        <StepNav steps={steps} />

        {/* 안 탭 */}
        {generations.length > 0 && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {generations.map(gen => {
              const isSelected = gen.id === selectedGenId
              const isDeleting = deletingGenId === gen.id
              return (
                <div
                  key={gen.id}
                  className={`flex items-center rounded-md border text-xs transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <button
                    onClick={() => switchGen(gen.id)}
                    className={`px-2.5 py-1 font-medium ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}
                  >
                    {gen.gen_number}안
                  </button>
                  <button
                    onClick={() => handleDeleteGen(gen.id, gen.gen_number)}
                    disabled={isDeleting}
                    className="pr-1.5 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                    title={`${gen.gen_number}안 삭제`}
                  >
                    ×
                  </button>
                </div>
              )
            })}
            {atLimit && (
              <span className="text-xs text-amber-600 ml-2">
                최대 10개 도달 — 기존 안을 삭제해야 새로 생성할 수 있습니다
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">슬라이드 편집</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              셀을 클릭하여 아이템을 교체하세요 ({slides.length}개 슬라이드)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/proposals/${id}/generate`)}
              disabled={atLimit}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title={atLimit ? '최대 10개 도달 — 기존 안 삭제 후 생성 가능' : '새 안 생성'}
            >
              재생성
            </button>
            <button
              onClick={() => {
                const genQuery = selectedGenId ? `?gen=${selectedGenId}` : ''
                router.push(`/proposals/${id}/export${genQuery}`)
              }}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              PPTX 내보내기 →
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 py-3">
        {slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg mb-2">슬라이드가 없습니다</p>
            <button
              onClick={() => router.push(`/proposals/${id}/generate`)}
              className="text-blue-500 text-sm underline"
            >
              AI 생성으로 이동
            </button>
          </div>
        ) : (
          <SlideGrid
            slides={slides}
            onCellUpdate={handleCellUpdate}
            onSlideUpdate={handleSlideUpdate}
            sectionKeywords={sectionKeywords}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공

- [ ] **Step 3: 커밋**

```bash
git add "app/(main)/proposals/[id]/edit/page.tsx"
git commit -m "feat: edit page shows generation tabs, supports switching and deleting plans"
```

---

### Task 7: Generate 페이지 — 10개 제한 표시 + gen-aware 리다이렉트

**Files:**
- Modify: `app/(main)/proposals/[id]/generate/page.tsx`

**Interfaces:**
- Consumes: `GET /api/proposals/[id]/generations` (생성 수 확인용)
- Produces: 10개 도달 시 버튼 비활성화 + 안내 메시지, 생성 완료 시 `edit?gen=<id>` 리다이렉트

- [ ] **Step 1: generate/page.tsx 수정**

`app/(main)/proposals/[id]/generate/page.tsx` 전체 교체:

```typescript
'use client'

import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StepNav from '@/components/StepNav'
import CoveragePanel from '@/components/CoveragePanel'

interface Props {
  params: Promise<{ id: string }>
}

type PhaseStatus = 'idle' | 'running' | 'done' | 'error'

interface Phase {
  label: string
  desc: string
  status: PhaseStatus
  detail?: string
}

export default function GeneratePage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [phases, setPhases] = useState<Phase[]>([
    { label: '현장 분석', desc: 'RFP 키워드 기반 사업여건 분석', status: 'idle' },
    { label: '섹션 계획', desc: '목차별 검색 전략 및 슬라이드 배분', status: 'idle' },
    { label: '슬라이드 생성', desc: 'DB 아이템 검색 및 배치', status: 'idle' },
  ])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [newGenId, setNewGenId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [genCount, setGenCount] = useState<number | null>(null)
  const [sectionPlans, setSectionPlans] = useState<Array<{
    section_title: string
    coverage_score?: number
    coverage_hint?: string | null
  }>>([])

  useEffect(() => {
    fetch(`/api/proposals/${id}/generations`)
      .then(r => r.json())
      .then((gens: unknown[]) => setGenCount(gens.length))
      .catch(() => setGenCount(0))
  }, [id])

  function setPhaseStatus(idx: number, status: PhaseStatus, detail?: string) {
    setPhases(prev =>
      prev.map((p, i) => (i === idx ? { ...p, status, detail } : p))
    )
  }

  async function handleGenerate() {
    setRunning(true)
    setError('')

    try {
      setPhaseStatus(0, 'running')
      setPhaseStatus(1, 'running')
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: id }),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeData.error ?? '분석 실패')

      const plans = analyzeData.section_plans ?? []
      setSectionPlans(plans)
      setPhaseStatus(0, 'done', analyzeData.site_analysis?.summary ?? '')
      setPhaseStatus(1, 'done', `${plans.length}개 섹션 분석 완료`)

      setPhaseStatus(2, 'running')
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: id }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error ?? '슬라이드 생성 실패')

      setPhaseStatus(2, 'done', `${genData.total_slides}개 슬라이드 생성 완료 (${genData.gen_number}안)`)
      setNewGenId(genData.generation_id)
      setGenCount(prev => (prev ?? 0) + 1)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생')
      setPhases(prev => prev.map(p => p.status === 'running' ? { ...p, status: 'error' } : p))
    } finally {
      setRunning(false)
    }
  }

  const atLimit = genCount !== null && genCount >= 10

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'active' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'pending' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'pending' as const },
  ]

  const sourceStatus = {
    rfp_uploaded: true,
    drawing_memo: false,
    pptx_uploaded: false,
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <h1 className="text-xl font-bold text-gray-800 mb-2">AI 슬라이드 생성</h1>
      <p className="text-sm text-gray-500 mb-2">
        RFP 분석 결과를 바탕으로 DB에서 적합한 아이템을 검색하고 슬라이드를 구성합니다.
      </p>
      {genCount !== null && genCount > 0 && (
        <p className="text-xs text-gray-400 mb-6">
          현재 {genCount}안 생성됨{atLimit ? ' — 최대 10개 도달' : ` (최대 ${10 - genCount}개 더 생성 가능)`}
        </p>
      )}

      {atLimit && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          최대 10개까지 생성 가능합니다. 편집 페이지에서 기존 안을 삭제한 후 다시 시도하세요.
          <button
            onClick={() => router.push(`/proposals/${id}/edit`)}
            className="ml-2 underline font-medium"
          >
            편집 페이지로 이동 →
          </button>
        </div>
      )}

      <div className="flex gap-6">
        <div className="flex-1">
          <div className="space-y-3 mb-8">
            {phases.map((phase, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  phase.status === 'running'
                    ? 'border-blue-200 bg-blue-50'
                    : phase.status === 'done'
                    ? 'border-green-200 bg-green-50'
                    : phase.status === 'error'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                    phase.status === 'running'
                      ? 'bg-blue-500 text-white animate-pulse'
                      : phase.status === 'done'
                      ? 'bg-green-500 text-white'
                      : phase.status === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {phase.status === 'done' ? '✓' : phase.status === 'error' ? '✕' : i + 1}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${
                    phase.status === 'running' ? 'text-blue-700'
                    : phase.status === 'done' ? 'text-green-700'
                    : phase.status === 'error' ? 'text-red-700'
                    : 'text-gray-600'
                  }`}>
                    {phase.label}
                    {phase.status === 'running' && (
                      <span className="ml-2 text-xs font-normal animate-pulse">처리 중...</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{phase.desc}</p>
                  {phase.detail && (
                    <p className="text-xs text-gray-600 mt-1 italic">{phase.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {!done ? (
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/proposals/${id}/toc`)}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                ← 목차 수정
              </button>
              <button
                onClick={handleGenerate}
                disabled={running || atLimit || genCount === null}
                className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {running ? '생성 중... (30초~1분 소요)' : atLimit ? '최대 개수 도달' : 'AI 슬라이드 생성 시작'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                슬라이드 생성이 완료되었습니다. 편집 화면에서 아이템을 조정하세요.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={running || atLimit}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  재생성
                </button>
                <button
                  onClick={() => {
                    const genQuery = newGenId ? `?gen=${newGenId}` : ''
                    router.push(`/proposals/${id}/edit${genQuery}`)
                  }}
                  className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  슬라이드 편집 →
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-56 flex-shrink-0">
          <CoveragePanel
            sourceStatus={sourceStatus}
            sectionPlans={sectionPlans}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공

- [ ] **Step 3: 커밋**

```bash
git add "app/(main)/proposals/[id]/generate/page.tsx"
git commit -m "feat: generate page shows gen count, blocks at 10, redirects to new gen after creation"
```

---

### Task 8: Export 페이지 — gen 파라미터 지원 + 안 표시

**Files:**
- Modify: `app/(main)/proposals/[id]/export/page.tsx`

**Interfaces:**
- Consumes: `?gen=<uuid>` URL 쿼리 파라미터
- Produces: 해당 gen의 슬라이드 수 표시, export API에 generation_id 전달, "N안 내보내기" 표시

- [ ] **Step 1: export/page.tsx 수정**

`app/(main)/proposals/[id]/export/page.tsx` 전체 교체:

```typescript
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepNav from '@/components/StepNav'
import type { SlideGeneration } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function ExportPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const genParam = searchParams.get('gen')

  const [proposal, setProposal] = useState<Record<string, unknown>>({})
  const [slideCount, setSlideCount] = useState(0)
  const [currentGen, setCurrentGen] = useState<SlideGeneration | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    async function load() {
      const genQuery = genParam ? `?gen=${genParam}` : ''
      const [propRes, slidesRes, gensRes] = await Promise.all([
        fetch(`/api/proposals/${id}`),
        fetch(`/api/proposals/${id}/slides${genQuery}`),
        fetch(`/api/proposals/${id}/generations`),
      ])
      const prop = await propRes.json()
      const sls = await slidesRes.json()
      const gens: SlideGeneration[] = await gensRes.json()

      setProposal(prop)
      setSlideCount((sls ?? []).length)

      if (genParam) {
        setCurrentGen(gens.find(g => g.id === genParam) ?? null)
      } else if (gens.length > 0) {
        setCurrentGen(gens[gens.length - 1])
      }
      setLoading(false)
    }
    load()
  }, [id, genParam])

  async function handleExport() {
    setExporting(true)
    setExportError('')
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_id: id,
          generation_id: currentGen?.id ?? null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'PPTX 생성 실패')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''(.+)/)
      a.download = match ? decodeURIComponent(match[1]) : `${proposal.title}_제안서.pptx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setExporting(false)
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'done' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'done' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'active' as const },
  ]

  if (loading) return <div className="p-8 text-gray-400">불러오는 중...</div>

  const ai_analysis = proposal.ai_analysis as Record<string, unknown> | undefined

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-bold text-gray-800">PPTX 내보내기</h1>
        {currentGen && (
          <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {currentGen.gen_number}안
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-8">
        완성된 슬라이드를 PPTX 파일로 내보냅니다.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border border-gray-200 rounded-lg p-4 text-center bg-white">
          <p className="text-2xl font-bold text-blue-600">{slideCount}</p>
          <p className="text-xs text-gray-500 mt-1">슬라이드</p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 text-center bg-white">
          <p className="text-2xl font-bold text-blue-600">
            {(ai_analysis?.section_plans as unknown[])?.length ?? '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">섹션</p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 text-center bg-white">
          <p className="text-lg font-bold text-blue-600 truncate">
            {(proposal.construction_type as string[] | undefined)?.join('/') ?? '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">공종</p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 mb-8 bg-gray-50 space-y-2">
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 w-20">용역명</span>
          <span className="text-sm text-gray-800 font-medium">{proposal.title as string}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 w-20">발주처</span>
          <span className="text-sm text-gray-700">{(proposal.client as string) ?? '-'}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 w-20">위치</span>
          <span className="text-sm text-gray-700">{(proposal.location as string) ?? '-'}</span>
        </div>
        {(proposal.scale_amount as number) && (
          <div className="flex gap-2">
            <span className="text-xs text-gray-500 w-20">공사금액</span>
            <span className="text-sm text-gray-700">
              {((proposal.scale_amount as number) / 1e8).toFixed(0)}억원
            </span>
          </div>
        )}
      </div>

      {exportError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {exportError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => {
            const genQuery = currentGen ? `?gen=${currentGen.id}` : ''
            router.push(`/proposals/${id}/edit${genQuery}`)
          }}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
        >
          ← 편집으로 돌아가기
        </button>
        <button
          onClick={handleExport}
          disabled={exporting || slideCount === 0}
          className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {exporting ? (
            <>
              <span className="animate-spin">⏳</span>
              PPTX 생성 중...
            </>
          ) : (
            `📥 ${currentGen ? `${currentGen.gen_number}안 ` : ''}PPTX 다운로드`
          )}
        </button>
      </div>

      {slideCount === 0 && (
        <p className="text-xs text-amber-600 mt-2 text-center">
          슬라이드가 없습니다.{' '}
          <a href={`/proposals/${id}/generate`} className="underline">
            AI 생성 먼저 실행
          </a>
          하세요.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 컴파일 성공, 모든 라우트 정상

- [ ] **Step 3: 최종 커밋 + 푸시**

```bash
git add "app/(main)/proposals/[id]/export/page.tsx"
git commit -m "feat: export page shows current plan number and passes generation_id to API"
git push origin master
```

- [ ] **Step 4: Vercel 배포**

```bash
vercel --prod
```

Expected: 배포 성공 메시지

---

## Self-Review

### Spec coverage
- ✅ 안 목록 조회 (Task 2)
- ✅ 안 삭제 (Task 2)
- ✅ generate 10개 제한 체크 + 400 반환 (Task 3)
- ✅ 기존 슬라이드 삭제 제거 (Task 3)
- ✅ slides API ?gen= 필터 (Task 4)
- ✅ export API generation_id 지원 (Task 5)
- ✅ 편집 페이지 안 탭 + 삭제 UI (Task 6)
- ✅ generate 페이지 제한 표시 + gen-aware 리다이렉트 (Task 7)
- ✅ export 페이지 "N안 내보내기" 표시 (Task 8)
- ✅ DB 마이그레이션 + 기존 데이터 처리 (Task 1)

### Type consistency
- `SlideGeneration` 타입이 Task 1에서 정의되고 Task 6, 8에서 사용 ✅
- `generation_id` 응답 필드가 Task 3에서 추가되고 Task 7에서 소비 ✅
- `?gen=<uuid>` 쿼리 파라미터가 Task 4, 5, 6, 7, 8에서 일관되게 사용 ✅
