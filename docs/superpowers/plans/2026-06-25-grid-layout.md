# Grid Layout System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 슬라이드 규격 선택(A4P/A4L/A3P/A3L/custom) + CSS Grid 기반 격자 레이아웃(AI 자동 배정 + 병합/분할 편집)을 추가한다.

**Architecture:** DB에 col_start/row_start/col_span/row_span 격자 좌표를 저장. AI가 Pass 2에서 슬라이드별 cols/rows와 셀 배치를 함께 결정. 편집 화면에서 CSS Grid로 시각화하고 병합·분할 버튼으로 조작. PPTX는 격자 좌표를 인치로 변환해 출력.

**Tech Stack:** Next.js 16.2.9 App Router, Supabase (KHJ 프로젝트 lekdajfvpcxezlvfgzua), Gemini 2.5-flash, PptxGenJS, CSS Grid, TypeScript

## Global Constraints

- Supabase 프로젝트 ID: lekdajfvpcxezlvfgzua (KHJ) — 다른 프로젝트 사용 금지
- 격자 최대: 4열 × 3행 (12칸)
- mm → inch 변환: `mm / 25.4`
- 프리셋 크기(mm): A4P 210×297, A4L 297×210, A3P 297×420, A3L 420×297
- 모든 DB 접근: `createServerClient()` from `@/lib/supabase`
- 테스트 인프라 없음 — dev server (localhost:3000)에서 수동 검증
- position_x, position_y, width, height 컬럼은 generate route에서만 쓰이고 PPTX 생성에선 사용 안 함 → 마이그레이션에서 삭제
- AGENTS.md: 파일 작성 전 `node_modules/next/dist/docs/` 참조할 것

---

### Task 1: DB Migration

**Files:**
- 수행 위치: Supabase SQL Editor (KHJ 프로젝트)

**Interfaces:**
- Produces: `proposal_slides.cols`, `proposal_slides.rows`, `slide_cells.col_start/row_start/col_span/row_span` 컬럼

- [ ] **Step 1: Supabase SQL Editor에서 마이그레이션 실행**

아래 SQL을 KHJ 프로젝트 SQL Editor에 붙여넣고 실행한다.

```sql
-- 1. proposal_slides에 격자 크기 컬럼 추가
ALTER TABLE proposal_slides
  ADD COLUMN IF NOT EXISTS cols integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS rows integer NOT NULL DEFAULT 1;

-- 2. slide_cells에 격자 좌표 컬럼 추가
ALTER TABLE slide_cells
  ADD COLUMN IF NOT EXISTS col_start integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS row_start integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS col_span  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS row_span  integer NOT NULL DEFAULT 1;

-- 3. 기존 절댓값 컬럼 제거 (generate route에서만 쓰이고 PPTX에선 미사용)
ALTER TABLE slide_cells
  DROP COLUMN IF EXISTS position_x,
  DROP COLUMN IF EXISTS position_y,
  DROP COLUMN IF EXISTS width,
  DROP COLUMN IF EXISTS height;

-- 4. proposals.slide_size DEFAULT 확인 (이미 존재하므로 변경 불필요)
-- 기존 DEFAULT: {"preset":"A4P","width_mm":210,"height_mm":297}
-- TypeScript 타입만 업데이트하면 됨
```

- [ ] **Step 2: 결과 확인**

SQL Editor에서 실행:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('proposal_slides', 'slide_cells')
  AND column_name IN ('cols', 'rows', 'col_start', 'row_start', 'col_span', 'row_span')
ORDER BY table_name, column_name;
```

Expected: 6개 행, 각각 integer 타입, DEFAULT 1 또는 2

---

### Task 2: TypeScript Types Update

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `SlidePreset`, `SlideSize`, `SlideCell` (격자 필드), `ProposalSlide` (cols/rows), `Pass2Slide` (격자 포함)

- [ ] **Step 1: types/index.ts 업데이트**

```typescript
// types/index.ts 전체 교체
export type ProposalStatus = 'draft' | 'analyzing' | 'slides_ready' | 'editing' | 'exported'

export type SlidePreset = 'A4P' | 'A4L' | 'A3P' | 'A3L' | 'custom'

export interface SlideSize {
  preset: SlidePreset
  width_mm: number
  height_mm: number
}

export interface SlideMargins {
  top_mm: number
  bottom_mm: number
  left_mm: number
  right_mm: number
  gutter_col_mm: number
  gutter_row_mm: number
}

export interface Proposal {
  id: string
  title: string
  client: string | null
  location: string | null
  construction_type: string[]
  scale_amount: number | null
  scale_area: number | null
  duration_months: number | null
  special_conditions: string | null
  drawing_review_raw: string | null
  rfp_file_url: string | null
  slide_size: SlideSize
  slide_margins: SlideMargins
  ai_analysis: AiAnalysis
  status: ProposalStatus
  created_at: string
  updated_at: string
}

export interface AiAnalysis {
  rfp_keywords?: { tier_a: string[]; tier_b: string[] }
  drawing_notes?: { summary: string; tier_b_extracted: string[] }
  site_analysis?: SiteAnalysis
  section_plans?: SectionPlan[]
}

export interface SiteAnalysis {
  construction_category: string
  scale_tier: string
  key_emphasis: string[]
  summary: string
}

export interface SectionPlan {
  section_title: string
  search_description: string
  tier_b_for_section: string[]
  slide_count_suggestion: number
  coverage_score: number
  coverage_sources: string[]
  coverage_hint: string | null
}

export interface ProposalSection {
  id: string
  proposal_id: string
  title: string
  order_index: number
  slide_count: number
  search_keywords: string[]
  created_at: string
}

export interface ProposalSlide {
  id: string
  proposal_id: string
  section_id: string | null
  slide_number: number
  order_index: number
  layout_type: string
  slide_title: string | null
  cols: number
  rows: number
  created_at: string
  cells?: SlideCell[]
}

export interface SlideCell {
  id: string
  slide_id: string
  cell_index: number
  db_item_id: string | null
  image_url: string | null
  item_title: string | null
  col_start: number
  row_start: number
  col_span: number
  row_span: number
  created_at: string
}

export interface ProposalItem {
  id: string
  title: string
  section_big: string
  section_small: string
  keywords: Array<{ type: 'taxonomy' | 'custom'; value: string }>
  keyword_status: 'ai_generated' | 'human_verified'
  content_text: string | null
  image_url: string | null
  created_at: string
  score?: number
}

export interface SiteDocument {
  id: string
  proposal_id: string
  file_url: string
  file_name: string | null
  file_type: string
  extracted_text: string | null
  created_at: string
}

export interface Pass0Result {
  form_fields: {
    title?: string
    client?: string
    location?: string
    construction_type?: string[]
    scale_amount?: number
    duration_months?: number
    special_conditions?: string
  }
  sections: string[]
  rfp_keywords: { tier_a: string[]; tier_b: string[] }
  drawing_notes?: { summary: string; tier_b_extracted: string[] }
}

export interface Pass1Result {
  site_analysis: SiteAnalysis
  section_plans: SectionPlan[]
}

export interface GeminiCell {
  col_start: number
  row_start: number
  col_span: number
  row_span: number
  item_id: string | null
}

export interface GeminiSlide {
  cols: number
  rows: number
  cells: GeminiCell[]
}

export interface GeminiSectionSelection {
  section_title: string
  slides: GeminiSlide[]
}

export interface Pass2Result {
  selections: GeminiSectionSelection[]
}

export interface Pass2Slide {
  slide_number: number
  section_title: string
  layout_type: string
  cols: number
  rows: number
  cells: Array<{
    cell_index: number
    db_item_id: string | null
    image_url: string | null
    item_title: string | null
    col_start: number
    row_start: number
    col_span: number
    row_span: number
  }>
}
```

- [ ] **Step 2: 타입 오류 확인**

```bash
cd C:\Users\user\Desktop\Claude\proposal-draft-mvp
npx tsc --noEmit 2>&1 | head -50
```

Expected: 오류 있을 수 있음 — Task 3~7에서 순차 수정

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: update types for grid layout system"
```

---

### Task 3: Pass 2 Generate Route — Gemini Grid Layout

**Files:**
- Modify: `app/api/generate/route.ts`

**Interfaces:**
- Consumes: `Pass2Result`, `GeminiSectionSelection`, `GeminiSlide`, `GeminiCell` from `@/types`
- Produces: `proposal_slides` rows with cols/rows, `slide_cells` rows with col_start/row_start/col_span/row_span

- [ ] **Step 1: generate/route.ts 전체 교체**

```typescript
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generateJson } from '@/lib/gemini'
import { isValidUuid } from '@/lib/utils'
import type { Pass2Result, SectionPlan, Pass2Slide } from '@/types'

interface CandidateItem {
  id: string
  title: string
  image_url: string | null
}

export async function POST(req: NextRequest) {
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

  const { data: sections } = await sb
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', proposal_id)
    .order('order_index')
  if (!sections?.length) return Response.json({ error: 'sections not found' }, { status: 400 })

  const sectionPlans: SectionPlan[] = proposal.ai_analysis?.section_plans ?? []

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

  // ── Step 1: 섹션별 후보 아이템 수집 ──────────────────────────────
  const sectionCandidates: Map<string, CandidateItem[]> = new Map()

  for (const section of sections) {
    const plan = sectionPlans.find(p => p.section_title === section.title)
    const tierBKeywords: string[] = plan?.tier_b_for_section ?? section.search_keywords ?? []
    const slideCount = (section as { slide_count?: number }).slide_count ?? plan?.slide_count_suggestion ?? 2
    // 슬라이드당 최대 4칸(4×3=12이지만 평균 3~4칸 가정) × 슬라이드 수 + 버퍼
    const fetchLimit = slideCount * 6

    let candidates: CandidateItem[] = []
    if (tierBKeywords.length > 0) {
      const conditions = tierBKeywords
        .slice(0, 8)
        .map(kw => {
          const safe = kw.replace(/[,()]/g, '')
          return `title.ilike.%${safe}%,content_text.ilike.%${safe}%`
        })
        .join(',')
      const { data: items } = await sb
        .from('proposal_items')
        .select('id, title, image_url, content_text')
        .or(conditions)
        .limit(fetchLimit)
      candidates = (items ?? []).map((it: { id: string; title: string; image_url: string | null }) => ({
        id: it.id,
        title: it.title,
        image_url: it.image_url,
      }))
    }
    sectionCandidates.set(section.id, candidates)
  }

  // ── Step 2: Gemini로 섹션별 격자 레이아웃 + 아이템 선택 ──────────
  let geminiResult: Pass2Result | null = null

  const sectionsWithCandidates = sections.filter(s => (sectionCandidates.get(s.id) ?? []).length > 0)

  if (sectionsWithCandidates.length > 0) {
    const sectionBlocks = sectionsWithCandidates.map(section => {
      const plan = sectionPlans.find(p => p.section_title === section.title)
      const candidates = sectionCandidates.get(section.id) ?? []
      const slideCount = (section as { slide_count?: number }).slide_count ?? plan?.slide_count_suggestion ?? 2

      const candidateList = candidates
        .map((c, i) => `  [${i}] id="${c.id}" title="${c.title}"`)
        .join('\n')

      return `## 섹션: "${section.title}"
슬라이드 수: ${slideCount}장
설명: ${plan?.search_description ?? ''}
후보 목록:
${candidateList}`
    }).join('\n\n')

    const prompt = `당신은 건설사업관리 제안서 전문가입니다.
각 목차 섹션의 슬라이드에 대해 적절한 격자 레이아웃과 아이템을 배치하세요.

[사업 정보]
- 용역명: ${proposal.title}
- 발주처: ${proposal.client ?? '-'}
- 위치: ${proposal.location ?? '-'}
- 공종: ${(proposal.construction_type ?? []).join(', ') || '-'}
- 사업 특성: ${proposal.ai_analysis?.site_analysis?.summary ?? '-'}

[목차별 슬라이드 구성]
${sectionBlocks}

[격자 레이아웃 가이드]
- cols: 1~4 (열 수), rows: 1~3 (행 수), 최대 cols×rows=12칸
- 개요·위치도·표지 성격 슬라이드: 2×1 (셀 2개)
- 공정·단계 설명: 3×1 또는 3×2
- 비교 항목: 2×2
- 대형 이미지 1개 강조: 1×1
- 셀 병합으로 중요 아이템 강조 가능 (col_span, row_span > 1)
- col_start + col_span - 1 ≤ cols, row_start + row_span - 1 ≤ rows 조건 준수
- 모든 셀이 겹치지 않아야 함

응답 형식 (JSON만, 설명 없이):
{
  "selections": [
    {
      "section_title": "섹션명 (위 ## 섹션: 뒤의 텍스트 그대로)",
      "slides": [
        {
          "cols": 2,
          "rows": 1,
          "cells": [
            { "col_start": 1, "row_start": 1, "col_span": 1, "row_span": 1, "item_id": "후보id 또는 null" },
            { "col_start": 2, "row_start": 1, "col_span": 1, "row_span": 1, "item_id": "후보id 또는 null" }
          ]
        }
      ]
    }
  ]
}

주의:
- item_id에는 후보 목록의 실제 id값 사용 (없으면 null)
- 한 섹션의 slides 수는 "슬라이드 수" 필드와 정확히 일치해야 함
- 같은 item_id를 여러 셀에 중복 사용하지 말 것
- cells 배열 순서: row_start → col_start 오름차순`

    try {
      geminiResult = await generateJson<Pass2Result>(prompt)
    } catch (e) {
      console.error('Gemini 격자 레이아웃 선택 실패, fallback 진행:', e)
    }
  }

  // ── Step 3: 슬라이드 및 셀 생성 ────────────────────────────────
  let globalSlideIndex = 0
  const allSlides: Pass2Slide[] = []

  for (const section of sections) {
    const plan = sectionPlans.find(p => p.section_title === section.title)
    const slideCount = (section as { slide_count?: number }).slide_count ?? plan?.slide_count_suggestion ?? 2
    const candidates = sectionCandidates.get(section.id) ?? []
    const candidateMap = new Map(candidates.map(c => [c.id, c]))

    const geminiSection = geminiResult?.selections?.find(s => s.section_title === section.title)

    for (let si = 0; si < slideCount; si++) {
      const slideNumber = globalSlideIndex + 1
      const geminiSlide = geminiSection?.slides?.[si]

      // Gemini 격자 없으면 2×1 기본값
      const cols = geminiSlide?.cols ?? 2
      const rows = geminiSlide?.rows ?? 1
      const layoutType = `${cols}x${rows}`

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
      if (slideErr || !slide) { globalSlideIndex++; continue }

      const cellsToInsert: Array<{
        slide_id: string
        cell_index: number
        db_item_id: string | null
        image_url: string | null
        item_title: string | null
        col_start: number
        row_start: number
        col_span: number
        row_span: number
      }> = []

      if (geminiSlide?.cells?.length) {
        // Gemini가 정한 격자 사용
        geminiSlide.cells.forEach((cell, idx) => {
          const item = cell.item_id ? candidateMap.get(cell.item_id) ?? null : null
          cellsToInsert.push({
            slide_id: slide.id,
            cell_index: idx,
            db_item_id: item?.id ?? null,
            image_url: item?.image_url ?? null,
            item_title: item?.title ?? null,
            col_start: Math.max(1, Math.min(cell.col_start, cols)),
            row_start: Math.max(1, Math.min(cell.row_start, rows)),
            col_span: Math.max(1, Math.min(cell.col_span, cols - cell.col_start + 1)),
            row_span: Math.max(1, Math.min(cell.row_span, rows - cell.row_start + 1)),
          })
        })
      } else {
        // fallback: 2×1 균등 배치
        const baseIdx = si * 2
        for (let ci = 0; ci < 2; ci++) {
          const candidate = candidates[baseIdx + ci] ?? null
          cellsToInsert.push({
            slide_id: slide.id,
            cell_index: ci,
            db_item_id: candidate?.id ?? null,
            image_url: candidate?.image_url ?? null,
            item_title: candidate?.title ?? null,
            col_start: ci + 1,
            row_start: 1,
            col_span: 1,
            row_span: 1,
          })
        }
      }

      if (cellsToInsert.length > 0) {
        await sb.from('slide_cells').insert(cellsToInsert)
      }

      allSlides.push({
        slide_number: slideNumber,
        section_title: section.title,
        layout_type: layoutType,
        cols,
        rows,
        cells: cellsToInsert.map(c => ({
          cell_index: c.cell_index,
          db_item_id: c.db_item_id,
          image_url: c.image_url,
          item_title: c.item_title,
          col_start: c.col_start,
          row_start: c.row_start,
          col_span: c.col_span,
          row_span: c.row_span,
        })),
      })
      globalSlideIndex++
    }
  }

  await sb.from('proposals').update({ status: 'slides_ready' }).eq('id', proposal_id)
  return Response.json({ total_slides: globalSlideIndex, slides: allSlides })
}
```

- [ ] **Step 2: TypeScript 오류 확인**

```bash
npx tsc --noEmit 2>&1 | grep "generate/route"
```

Expected: 오류 없음 (generate/route.ts 관련)

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: Pass 2 Gemini grid layout selection"
```

---

### Task 4: PPTX Generator — Grid Coordinate Calculation

**Files:**
- Modify: `lib/pptx-generator.ts`

**Interfaces:**
- Consumes: `proposal.slide_size` (SlideSize), `slide.cols`, `slide.rows`, `cell.col_start/row_start/col_span/row_span`
- Produces: Buffer (PPTX with correct slide size and grid cell positions)

- [ ] **Step 1: lib/pptx-generator.ts 전체 교체**

```typescript
import PptxGenJS from 'pptxgenjs'

function isSafeImageUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function mmToIn(mm: number): number {
  return mm / 25.4
}

interface SlideSize {
  preset: string
  width_mm: number
  height_mm: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePptx(proposal: any, slides: any[]): Promise<Buffer> {
  const pptx = new PptxGenJS()

  const slideSize: SlideSize = proposal.slide_size ?? { preset: 'A4L', width_mm: 297, height_mm: 210 }
  const SLIDE_W = mmToIn(slideSize.width_mm)
  const SLIDE_H = mmToIn(slideSize.height_mm)

  // PptxGenJS 레이아웃 등록
  pptx.defineLayout({ name: 'CUSTOM', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'CUSTOM'

  // 여백 (인치)
  const HEADER_H = mmToIn(22)
  const ACCENT_H = mmToIn(1)
  const MARGIN_L = mmToIn(8)
  const MARGIN_R = mmToIn(8)
  const MARGIN_T = mmToIn(6)
  const MARGIN_B = mmToIn(8)
  const GUTTER_COL = mmToIn(4)
  const GUTTER_ROW = mmToIn(4)

  const CONTENT_W = SLIDE_W - MARGIN_L - MARGIN_R
  const CONTENT_H = SLIDE_H - HEADER_H - ACCENT_H - MARGIN_T - MARGIN_B

  // 표지
  const cover = pptx.addSlide()
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: '1E3A5F' },
    line: { color: '1E3A5F' },
  })
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: SLIDE_H * 0.77, w: SLIDE_W, h: mmToIn(2),
    fill: { color: '4A90D9' },
    line: { color: '4A90D9' },
  })
  cover.addText(proposal.title ?? '제안서', {
    x: mmToIn(38), y: SLIDE_H * 0.24, w: SLIDE_W - mmToIn(76), h: mmToIn(35),
    fontSize: 34, bold: true, color: 'FFFFFF', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  cover.addText('건설사업관리 용역 제안서', {
    x: mmToIn(38), y: SLIDE_H * 0.44, w: SLIDE_W - mmToIn(76), h: mmToIn(15),
    fontSize: 16, color: '88AACC', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  if (proposal.client) {
    cover.addText(proposal.client, {
      x: mmToIn(38), y: SLIDE_H * 0.56, w: SLIDE_W - mmToIn(76), h: mmToIn(15),
      fontSize: 18, color: 'AACCEE', align: 'center',
      fontFace: 'Malgun Gothic',
    })
  }
  const metaParts: string[] = []
  if (proposal.location) metaParts.push(proposal.location)
  if (proposal.duration_months) metaParts.push(`과업기간 ${proposal.duration_months}개월`)
  if (metaParts.length > 0) {
    cover.addText(metaParts.join('  |  '), {
      x: mmToIn(38), y: SLIDE_H * 0.67, w: SLIDE_W - mmToIn(76), h: mmToIn(10),
      fontSize: 11, color: '6688AA', align: 'center',
      fontFace: 'Malgun Gothic',
    })
  }

  const totalPages = slides.length

  for (const slide of slides) {
    const sl = pptx.addSlide()
    const cols: number = slide.cols ?? 2
    const rows: number = slide.rows ?? 1

    // 헤더
    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
      fill: { color: '1E3A5F' }, line: { color: '1E3A5F' },
    })
    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: HEADER_H, w: SLIDE_W, h: ACCENT_H,
      fill: { color: '4A90D9' }, line: { color: '4A90D9' },
    })
    sl.addText(slide.slide_title ?? '', {
      x: MARGIN_L, y: mmToIn(3), w: SLIDE_W - MARGIN_L - MARGIN_R - mmToIn(30), h: HEADER_H - mmToIn(6),
      fontSize: 18, bold: true, color: 'FFFFFF',
      fontFace: 'Malgun Gothic',
    })
    sl.addText(`${slide.slide_number} / ${totalPages}`, {
      x: SLIDE_W - mmToIn(32), y: mmToIn(3), w: mmToIn(28), h: HEADER_H - mmToIn(6),
      fontSize: 10, color: 'AACCEE', align: 'right',
      fontFace: 'Malgun Gothic',
    })

    // 격자 셀 단위 크기 계산
    const cellUnitW = (CONTENT_W - GUTTER_COL * (cols - 1)) / cols
    const cellUnitH = (CONTENT_H - GUTTER_ROW * (rows - 1)) / rows
    const contentStartY = HEADER_H + ACCENT_H + MARGIN_T

    const cells = (slide.cells ?? []).sort(
      (a: { cell_index: number }, b: { cell_index: number }) => a.cell_index - b.cell_index
    )

    for (const cell of cells) {
      const colStart: number = cell.col_start ?? 1
      const rowStart: number = cell.row_start ?? 1
      const colSpan: number = cell.col_span ?? 1
      const rowSpan: number = cell.row_span ?? 1

      const cellX = MARGIN_L + (colStart - 1) * (cellUnitW + GUTTER_COL)
      const cellY = contentStartY + (rowStart - 1) * (cellUnitH + GUTTER_ROW)
      const cellW = cellUnitW * colSpan + GUTTER_COL * (colSpan - 1)
      const cellH = cellUnitH * rowSpan + GUTTER_ROW * (rowSpan - 1)

      sl.addShape(pptx.ShapeType.rect, {
        x: cellX, y: cellY, w: cellW, h: cellH,
        fill: { color: 'F5F7FA' }, line: { color: 'D0D9E8', pt: 1 },
      })

      if (cell.image_url && isSafeImageUrl(cell.image_url)) {
        const imgH = cellH * 0.75
        try {
          sl.addImage({
            path: cell.image_url,
            x: cellX + mmToIn(1.5), y: cellY + mmToIn(1.5),
            w: cellW - mmToIn(3), h: imgH - mmToIn(3),
            sizing: { type: 'contain', w: cellW - mmToIn(3), h: imgH - mmToIn(3) },
          })
        } catch {
          sl.addShape(pptx.ShapeType.rect, {
            x: cellX + mmToIn(1.5), y: cellY + mmToIn(1.5),
            w: cellW - mmToIn(3), h: imgH - mmToIn(3),
            fill: { color: 'E0E7EF' }, line: { color: 'B0BCCC' },
          })
          sl.addText('이미지 로드 실패', {
            x: cellX + mmToIn(1.5), y: cellY + imgH * 0.4,
            w: cellW - mmToIn(3), h: mmToIn(10),
            align: 'center', fontSize: 9, color: 'AAAAAA',
            fontFace: 'Malgun Gothic',
          })
        }

        const titleY = cellY + imgH + mmToIn(2)
        const titleH = cellH - imgH - mmToIn(2)
        sl.addText(cell.item_title ?? '', {
          x: cellX + mmToIn(2.5), y: titleY,
          w: cellW - mmToIn(5), h: Math.max(titleH, mmToIn(5)),
          fontSize: 8, color: '2C3E50', wrap: true,
          fontFace: 'Malgun Gothic', valign: 'top',
        })
      } else {
        sl.addShape(pptx.ShapeType.rect, {
          x: cellX + mmToIn(1.5), y: cellY + mmToIn(1.5),
          w: cellW - mmToIn(3), h: cellH - mmToIn(3),
          fill: { color: 'EEF1F5' },
          line: { color: 'C5CDD9', pt: 1, dashType: 'dash' },
        })
        sl.addText('아이템 미배정', {
          x: cellX, y: cellY + cellH / 2 - mmToIn(5),
          w: cellW, h: mmToIn(10),
          align: 'center', fontSize: 11, color: 'AABBCC',
          fontFace: 'Malgun Gothic',
        })
      }
    }
  }

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return buf
}
```

- [ ] **Step 2: TypeScript 오류 확인**

```bash
npx tsc --noEmit 2>&1 | grep "pptx-generator"
```

Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add lib/pptx-generator.ts
git commit -m "feat: PPTX generator uses grid coordinates and slide size"
```

---

### Task 5: TOC Page — Slide Size Selector

**Files:**
- Modify: `app/proposals/[id]/toc/page.tsx`

**Interfaces:**
- Consumes: `GET /api/proposals/:id` → proposal.slide_size
- Produces: `PATCH /api/proposals/:id` with `{ slide_size: SlideSize }` on save

- [ ] **Step 1: toc/page.tsx 수정 — slide_size 상태 및 로드**

파일 상단 `useState` 선언부에 추가 (기존 `const [saveError, setSaveError] = useState('')` 아래):

```typescript
import type { SlideSize, SlidePreset } from '@/types'

// ...컴포넌트 내부 useState 추가:
const [slideSize, setSlideSize] = useState<SlideSize>({ preset: 'A4L', width_mm: 297, height_mm: 210 })
```

`load()` 함수 내 `const prop = await propRes.json()` 아래에 추가:

```typescript
if (prop.slide_size) setSlideSize(prop.slide_size)
```

- [ ] **Step 2: handleSave에 slide_size PATCH 추가**

`handleSave` 함수 내 `const res = await fetch(...)` 호출 전에 추가:

```typescript
// slide_size 먼저 저장
await fetch(`/api/proposals/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slide_size: slideSize }),
})
```

- [ ] **Step 3: JSX에 슬라이드 규격 선택 UI 추가**

`{saveError && ...}` 블록 바로 위에 삽입:

```tsx
{/* 슬라이드 규격 선택 */}
<div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
  <h2 className="text-sm font-semibold text-gray-700 mb-3">슬라이드 규격</h2>
  <div className="flex flex-wrap gap-2 mb-3">
    {([
      { preset: 'A4P', label: 'A4 세로', width_mm: 210, height_mm: 297 },
      { preset: 'A4L', label: 'A4 가로', width_mm: 297, height_mm: 210 },
      { preset: 'A3P', label: 'A3 세로', width_mm: 297, height_mm: 420 },
      { preset: 'A3L', label: 'A3 가로', width_mm: 420, height_mm: 297 },
    ] as Array<{ preset: SlidePreset; label: string; width_mm: number; height_mm: number }>).map(opt => (
      <button
        key={opt.preset}
        onClick={() => setSlideSize({ preset: opt.preset, width_mm: opt.width_mm, height_mm: opt.height_mm })}
        className={[
          'px-3 py-1.5 rounded-lg text-sm border transition-colors',
          slideSize.preset === opt.preset
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400',
        ].join(' ')}
      >
        {opt.label}
        <span className="ml-1 text-xs opacity-70">{opt.width_mm}×{opt.height_mm}</span>
      </button>
    ))}
    <button
      onClick={() => setSlideSize(prev => ({ ...prev, preset: 'custom' }))}
      className={[
        'px-3 py-1.5 rounded-lg text-sm border transition-colors',
        slideSize.preset === 'custom'
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400',
      ].join(' ')}
    >
      Custom
    </button>
  </div>
  {slideSize.preset === 'custom' && (
    <div className="flex items-center gap-3">
      <label className="text-xs text-gray-500">W (mm)</label>
      <input
        type="number"
        min={100}
        max={841}
        value={slideSize.width_mm}
        onChange={e => setSlideSize(prev => ({ ...prev, width_mm: Number(e.target.value) }))}
        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
      />
      <span className="text-gray-400">×</span>
      <label className="text-xs text-gray-500">H (mm)</label>
      <input
        type="number"
        min={100}
        max={1189}
        value={slideSize.height_mm}
        onChange={e => setSlideSize(prev => ({ ...prev, height_mm: Number(e.target.value) }))}
        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
      />
    </div>
  )}
  <p className="mt-2 text-xs text-gray-400">
    현재: {slideSize.width_mm}×{slideSize.height_mm}mm
  </p>
</div>
```

- [ ] **Step 4: 브라우저 확인**

localhost:3000 에서 목차 구성 페이지 열기 → 규격 버튼 확인 → A4 가로/A3 가로 클릭 → 변경 확인 → custom 선택 시 입력 필드 표시 확인

- [ ] **Step 5: Commit**

```bash
git add app/proposals/[id]/toc/page.tsx
git commit -m "feat: slide size selector in TOC page"
```

---

### Task 6: Slide API Routes — Layout Change, Merge, Split

**Files:**
- Create: `app/api/slides/[slideId]/route.ts`
- Create: `app/api/slides/[slideId]/merge/route.ts`
- Create: `app/api/slides/[slideId]/split/route.ts`

**Interfaces:**
- `PATCH /api/slides/:slideId` body: `{ cols: number, rows: number }` → 기존 셀 삭제 후 균등 격자로 재생성
- `POST /api/slides/:slideId/merge` body: `{ cell_ids: string[] }` → 직사각형 구성 셀들을 하나로 병합
- `POST /api/slides/:slideId/split` body: `{ cell_id: string }` → 병합 셀을 1×1로 분할

- [ ] **Step 1: PATCH /api/slides/[slideId]/route.ts 생성**

```typescript
// app/api/slides/[slideId]/route.ts
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  const { slideId } = await params
  const { cols, rows } = await req.json()

  if (!Number.isInteger(cols) || cols < 1 || cols > 4) {
    return Response.json({ error: 'cols must be 1–4' }, { status: 400 })
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > 3) {
    return Response.json({ error: 'rows must be 1–3' }, { status: 400 })
  }

  const sb = createServerClient()

  // 기존 셀 삭제
  await sb.from('slide_cells').delete().eq('slide_id', slideId)

  // 슬라이드 cols/rows 업데이트
  await sb.from('proposal_slides')
    .update({ cols, rows, layout_type: `${cols}x${rows}` })
    .eq('id', slideId)

  // 균등 격자 셀 생성
  const cells = []
  let cellIndex = 0
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      cells.push({
        id: randomUUID(),
        slide_id: slideId,
        cell_index: cellIndex++,
        db_item_id: null,
        image_url: null,
        item_title: null,
        col_start: c,
        row_start: r,
        col_span: 1,
        row_span: 1,
      })
    }
  }
  const { error } = await sb.from('slide_cells').insert(cells)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // 업데이트된 슬라이드 반환
  const { data: slide } = await sb
    .from('proposal_slides')
    .select('*, cells:slide_cells(*)')
    .eq('id', slideId)
    .single()

  return Response.json(slide)
}
```

- [ ] **Step 2: POST /api/slides/[slideId]/merge/route.ts 생성**

```typescript
// app/api/slides/[slideId]/merge/route.ts
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  const { slideId } = await params
  const { cell_ids }: { cell_ids: string[] } = await req.json()

  if (!Array.isArray(cell_ids) || cell_ids.length < 2) {
    return Response.json({ error: '병합하려면 2개 이상 셀 선택 필요' }, { status: 400 })
  }

  const sb = createServerClient()

  const { data: cells, error: fetchErr } = await sb
    .from('slide_cells')
    .select('*')
    .in('id', cell_ids)
    .eq('slide_id', slideId)
  if (fetchErr || !cells?.length) {
    return Response.json({ error: '셀을 찾을 수 없습니다' }, { status: 404 })
  }

  // 직사각형 구성 검증
  const minCol = Math.min(...cells.map(c => c.col_start))
  const maxCol = Math.max(...cells.map(c => c.col_start + c.col_span - 1))
  const minRow = Math.min(...cells.map(c => c.row_start))
  const maxRow = Math.max(...cells.map(c => c.row_start + c.row_span - 1))

  const newColSpan = maxCol - minCol + 1
  const newRowSpan = maxRow - minRow + 1

  // 선택된 셀들이 정확히 직사각형 영역을 채우는지 검증
  const totalArea = cells.reduce((sum, c) => sum + c.col_span * c.row_span, 0)
  if (totalArea !== newColSpan * newRowSpan) {
    return Response.json({ error: '선택된 셀이 직사각형을 구성하지 않습니다' }, { status: 400 })
  }

  // 첫 번째 셀(cell_index 가장 작은)에 병합 적용
  const keepCell = cells.reduce((a, b) => a.cell_index < b.cell_index ? a : b)
  const deleteCellIds = cells.filter(c => c.id !== keepCell.id).map(c => c.id)

  await sb.from('slide_cells').delete().in('id', deleteCellIds)
  const { error: updateErr } = await sb.from('slide_cells')
    .update({
      col_start: minCol,
      row_start: minRow,
      col_span: newColSpan,
      row_span: newRowSpan,
    })
    .eq('id', keepCell.id)
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })

  const { data: slide } = await sb
    .from('proposal_slides')
    .select('*, cells:slide_cells(*)')
    .eq('id', slideId)
    .single()

  return Response.json(slide)
}
```

- [ ] **Step 3: POST /api/slides/[slideId]/split/route.ts 생성**

```typescript
// app/api/slides/[slideId]/split/route.ts
import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  const { slideId } = await params
  const { cell_id }: { cell_id: string } = await req.json()

  const sb = createServerClient()

  const { data: cell, error: fetchErr } = await sb
    .from('slide_cells')
    .select('*')
    .eq('id', cell_id)
    .eq('slide_id', slideId)
    .single()
  if (fetchErr || !cell) return Response.json({ error: '셀을 찾을 수 없습니다' }, { status: 404 })

  if (cell.col_span === 1 && cell.row_span === 1) {
    return Response.json({ error: '이미 1×1 셀입니다' }, { status: 400 })
  }

  // 병합 영역을 개별 1×1 셀로 분할
  const newCells = []
  let cellIndex = cell.cell_index
  for (let r = cell.row_start; r < cell.row_start + cell.row_span; r++) {
    for (let c = cell.col_start; c < cell.col_start + cell.col_span; c++) {
      if (c === cell.col_start && r === cell.row_start) {
        // 원래 셀 재사용 (1×1로 축소)
        continue
      }
      newCells.push({
        id: randomUUID(),
        slide_id: slideId,
        cell_index: ++cellIndex,
        db_item_id: null,
        image_url: null,
        item_title: null,
        col_start: c,
        row_start: r,
        col_span: 1,
        row_span: 1,
      })
    }
  }

  // 원래 셀을 1×1로 축소
  await sb.from('slide_cells')
    .update({ col_span: 1, row_span: 1 })
    .eq('id', cell_id)

  if (newCells.length > 0) {
    await sb.from('slide_cells').insert(newCells)
  }

  const { data: slide } = await sb
    .from('proposal_slides')
    .select('*, cells:slide_cells(*)')
    .eq('id', slideId)
    .single()

  return Response.json(slide)
}
```

- [ ] **Step 4: TypeScript 오류 확인**

```bash
npx tsc --noEmit 2>&1 | grep "api/slides"
```

Expected: 오류 없음

- [ ] **Step 5: Commit**

```bash
git add app/api/slides/
git commit -m "feat: slide layout change, merge, split API routes"
```

---

### Task 7: SlideGrid Component — Grid Editor UI

**Files:**
- Modify: `components/SlideGrid.tsx`

**Interfaces:**
- Consumes: `ProposalSlide` with cols/rows, `SlideCell` with col_start/row_start/col_span/row_span
- Produces: CSS Grid 기반 슬라이드 썸네일, 다중 선택, 병합/분할/레이아웃 변경 UI

레이아웃 옵션 목록:
```
1×1, 2×1, 1×2, 2×2, 3×1, 3×2, 3×3, 4×1, 4×2, 4×3
```

- [ ] **Step 1: SlideGrid.tsx 전체 교체**

```tsx
'use client'

import { useState } from 'react'
import type { ProposalSlide, SlideCell } from '@/types'
import Image from 'next/image'
import ItemPanel from './ItemPanel'
import type { ProposalItem } from '@/types'

const LAYOUT_OPTIONS = [
  { label: '1×1', value: '1x1', cols: 1, rows: 1 },
  { label: '2×1', value: '2x1', cols: 2, rows: 1 },
  { label: '1×2', value: '1x2', cols: 1, rows: 2 },
  { label: '2×2', value: '2x2', cols: 2, rows: 2 },
  { label: '3×1', value: '3x1', cols: 3, rows: 1 },
  { label: '3×2', value: '3x2', cols: 3, rows: 2 },
  { label: '3×3', value: '3x3', cols: 3, rows: 3 },
  { label: '4×1', value: '4x1', cols: 4, rows: 1 },
  { label: '4×2', value: '4x2', cols: 4, rows: 2 },
  { label: '4×3', value: '4x3', cols: 4, rows: 3 },
]

interface SlideGridProps {
  slides: (ProposalSlide & { cells: SlideCell[] })[]
  onCellUpdate: (slideId: string, cellId: string, item: ProposalItem | null) => void
  onSlideUpdate: (updatedSlide: ProposalSlide & { cells: SlideCell[] }) => void
  sectionKeywords: Record<string, string[]>
}

export default function SlideGrid({
  slides,
  onCellUpdate,
  onSlideUpdate,
  sectionKeywords,
}: SlideGridProps) {
  const [activeCell, setActiveCell] = useState<{
    slideId: string
    cellId: string
    sectionId: string
    sectionTitle: string
  } | null>(null)
  // 슬라이드별 선택된 셀 ID 집합
  const [selectedCells, setSelectedCells] = useState<Record<string, Set<string>>>({})
  const [mergingSlide, setMergingSlide] = useState<string | null>(null)

  function getSelected(slideId: string): Set<string> {
    return selectedCells[slideId] ?? new Set()
  }

  function toggleCellSelect(slideId: string, cellId: string) {
    setSelectedCells(prev => {
      const set = new Set(prev[slideId] ?? [])
      if (set.has(cellId)) {
        set.delete(cellId)
      } else {
        set.add(cellId)
      }
      return { ...prev, [slideId]: set }
    })
  }

  function clearSelected(slideId: string) {
    setSelectedCells(prev => ({ ...prev, [slideId]: new Set() }))
  }

  function handleCellClick(
    slideId: string,
    cellId: string,
    sectionId: string,
    sectionTitle: string,
    isMergeMode: boolean
  ) {
    if (isMergeMode) {
      toggleCellSelect(slideId, cellId)
    } else {
      setActiveCell({ slideId, cellId, sectionId, sectionTitle })
    }
  }

  function handleItemSelect(item: ProposalItem) {
    if (!activeCell) return
    onCellUpdate(activeCell.slideId, activeCell.cellId, item)
    setActiveCell(null)
  }

  async function handleLayoutChange(slideId: string, cols: number, rows: number) {
    const res = await fetch(`/api/slides/${slideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
      clearSelected(slideId)
    }
  }

  async function handleMerge(slideId: string) {
    const ids = Array.from(getSelected(slideId))
    if (ids.length < 2) return
    const res = await fetch(`/api/slides/${slideId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell_ids: ids }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
      clearSelected(slideId)
      setMergingSlide(null)
    } else {
      const err = await res.json()
      alert(err.error ?? '병합 실패')
    }
  }

  async function handleSplit(slideId: string) {
    const ids = Array.from(getSelected(slideId))
    if (ids.length !== 1) return
    const res = await fetch(`/api/slides/${slideId}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell_id: ids[0] }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
      clearSelected(slideId)
      setMergingSlide(null)
    } else {
      const err = await res.json()
      alert(err.error ?? '분할 실패')
    }
  }

  // 섹션별로 그룹화
  const grouped: Record<string, (ProposalSlide & { cells: SlideCell[] })[]> = {}
  for (const slide of slides) {
    const key = slide.section_id ?? 'no-section'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(slide)
  }

  return (
    <div className="flex gap-4 h-full">
      {/* 슬라이드 그리드 (좌측) */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([sectionId, sectionSlides]) => (
          <div key={sectionId} className="mb-8">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 sticky top-0 bg-white py-1 border-b border-gray-100 z-10">
              {sectionSlides[0]?.slide_title?.replace(/ \(\d+\/\d+\)$/, '') ?? '섹션'}
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {sectionSlides.map(slide => {
                const cols = slide.cols ?? 2
                const rows = slide.rows ?? 1
                const isMerge = mergingSlide === slide.id
                const selected = getSelected(slide.id)

                return (
                  <div
                    key={slide.id}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
                  >
                    {/* 슬라이드 미니 헤더 */}
                    <div className="bg-slate-700 text-white text-xs px-2 py-1 flex justify-between items-center">
                      <span className="truncate">{slide.slide_title}</span>
                      <span className="text-slate-300 ml-1">#{slide.slide_number}</span>
                    </div>

                    {/* 툴바 */}
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-50 border-b border-gray-100 flex-wrap">
                      {/* 레이아웃 드롭다운 */}
                      <select
                        value={`${cols}x${rows}`}
                        onChange={e => {
                          const opt = LAYOUT_OPTIONS.find(o => o.value === e.target.value)
                          if (opt) handleLayoutChange(slide.id, opt.cols, opt.rows)
                        }}
                        className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600"
                      >
                        {LAYOUT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>

                      {/* 병합 모드 토글 */}
                      <button
                        onClick={() => {
                          if (isMerge) {
                            setMergingSlide(null)
                            clearSelected(slide.id)
                          } else {
                            setMergingSlide(slide.id)
                            setActiveCell(null)
                          }
                        }}
                        className={[
                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          isMerge
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-orange-400',
                        ].join(' ')}
                      >
                        {isMerge ? '취소' : '선택'}
                      </button>

                      {/* 병합 버튼 */}
                      {isMerge && selected.size >= 2 && (
                        <button
                          onClick={() => handleMerge(slide.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-500 text-white border-blue-500"
                        >
                          병합
                        </button>
                      )}

                      {/* 분할 버튼 */}
                      {isMerge && selected.size === 1 && (() => {
                        const cellId = Array.from(selected)[0]
                        const cell = slide.cells?.find(c => c.id === cellId)
                        return cell && (cell.col_span > 1 || cell.row_span > 1)
                      })() && (
                        <button
                          onClick={() => handleSplit(slide.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500 text-white border-purple-500"
                        >
                          분할
                        </button>
                      )}
                    </div>

                    {/* CSS Grid 셀 영역 */}
                    <div
                      className="p-1.5"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                        gap: '3px',
                        aspectRatio: `${cols} / ${rows}`,
                      }}
                    >
                      {(slide.cells ?? [])
                        .sort((a, b) => a.cell_index - b.cell_index)
                        .map(cell => {
                          const isActiveItem = activeCell?.cellId === cell.id
                          const isSelected = selected.has(cell.id)

                          return (
                            <div
                              key={cell.id}
                              onClick={() =>
                                handleCellClick(
                                  slide.id,
                                  cell.id,
                                  sectionId,
                                  slide.slide_title ?? '',
                                  isMerge
                                )
                              }
                              style={{
                                gridColumn: `${cell.col_start} / span ${cell.col_span}`,
                                gridRow: `${cell.row_start} / span ${cell.row_span}`,
                              }}
                              className={[
                                'rounded border cursor-pointer transition-all relative overflow-hidden min-h-[40px]',
                                isSelected
                                  ? 'border-orange-500 ring-2 ring-orange-300'
                                  : isActiveItem
                                  ? 'border-blue-500 ring-2 ring-blue-300'
                                  : 'border-gray-200 hover:border-blue-300',
                              ].join(' ')}
                            >
                              {cell.image_url ? (
                                <>
                                  <Image
                                    src={cell.image_url}
                                    alt={cell.item_title ?? ''}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] p-0.5 line-clamp-2">
                                    {cell.item_title}
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300">
                                  <span className="text-base">+</span>
                                  <span className="text-[8px]">배정</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 아이템 패널 (우측) */}
      {activeCell && (
        <div className="w-72 flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-md">
          <div className="bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">아이템 선택</span>
            <button
              onClick={() => setActiveCell(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="h-[calc(100%-3rem)]">
            <ItemPanel
              sectionTitle={activeCell.sectionTitle}
              tierBKeywords={sectionKeywords[activeCell.sectionId] ?? []}
              onSelect={handleItemSelect}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 오류 확인**

```bash
npx tsc --noEmit 2>&1 | grep "SlideGrid"
```

Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add components/SlideGrid.tsx
git commit -m "feat: CSS grid editor with merge/split in SlideGrid"
```

---

### Task 8: Edit Page — Wire onSlideUpdate

**Files:**
- Modify: `app/proposals/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `SlideGrid` with new `onSlideUpdate` prop
- Produces: 로컬 상태에 업데이트된 슬라이드 반영

- [ ] **Step 1: edit/page.tsx의 SlideGrid 호출부 수정**

`handleCellUpdate` 함수 아래에 추가:

```typescript
function handleSlideUpdate(updatedSlide: ProposalSlide & { cells: SlideCell[] }) {
  setSlides(prev => prev.map(s => s.id === updatedSlide.id ? updatedSlide : s))
}
```

JSX의 `<SlideGrid` 호출에 `onSlideUpdate` prop 추가:

```tsx
<SlideGrid
  slides={slides}
  onCellUpdate={handleCellUpdate}
  onSlideUpdate={handleSlideUpdate}
  sectionKeywords={sectionKeywords}
/>
```

- [ ] **Step 2: TypeScript 오류 전체 확인**

```bash
npx tsc --noEmit 2>&1
```

Expected: 오류 없음

- [ ] **Step 3: 브라우저 E2E 확인**

1. localhost:3000에서 제안서 생성 플로우 진행
2. 목차 구성에서 규격 버튼 변경 → 저장 확인
3. AI 생성 후 슬라이드 편집 페이지 진입
4. 슬라이드 썸네일에 CSS Grid 레이아웃 표시 확인
5. 레이아웃 드롭다운에서 3×2 선택 → 셀 재배치 확인
6. "선택" 버튼 클릭 → 셀 2개 선택 → "병합" 버튼 클릭 → 병합 확인
7. 병합된 셀 선택 → "분할" 버튼 → 원래대로 복원 확인
8. 셀 클릭(비-선택 모드) → 아이템 패널 표시 → 아이템 선택 → 이미지 반영 확인

- [ ] **Step 4: Commit**

```bash
git add app/proposals/[id]/edit/page.tsx
git commit -m "feat: wire onSlideUpdate in edit page"
```

---

### Task 9: Git Push

- [ ] **Step 1: 최종 확인 후 푸쉬**

```bash
git log --oneline -8
git push
```
