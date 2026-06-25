# 격자 레이아웃 시스템 설계

**날짜:** 2026-06-25  
**대상:** proposal-draft-mvp  
**범위:** 슬라이드 크기 설정 + 격자 레이아웃(병합/분할) + AI 자동 추천

---

## 1. 목표

- 사용자가 제안서별 슬라이드 규격(A4P/A4L/A3P/A3L/custom)을 선택할 수 있다
- AI가 섹션 특성에 맞는 격자 구성(최대 4×3)과 셀별 아이템을 한 번에 결정한다
- 편집 화면에서 슬라이드별 격자를 변경하고 셀을 병합·분할할 수 있다
- PPTX 출력이 선택한 규격과 격자 좌표를 반영한다

---

## 2. DB 스키마 변경

### `proposals` 테이블
```sql
-- slide_size가 없으면 추가
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS slide_size jsonb NOT NULL DEFAULT '{"preset":"A4P","width_mm":210,"height_mm":297}';
```

### `proposal_slides` 테이블
```sql
ALTER TABLE proposal_slides
  ADD COLUMN cols integer NOT NULL DEFAULT 2,
  ADD COLUMN rows integer NOT NULL DEFAULT 1;
```

### `slide_cells` 테이블
```sql
ALTER TABLE slide_cells
  ADD COLUMN col_start integer NOT NULL DEFAULT 1,
  ADD COLUMN row_start integer NOT NULL DEFAULT 1,
  ADD COLUMN col_span  integer NOT NULL DEFAULT 1,
  ADD COLUMN row_span  integer NOT NULL DEFAULT 1;

-- 기존 절댓값 컬럼 제거 (격자 좌표로 대체)
ALTER TABLE slide_cells
  DROP COLUMN IF EXISTS position_x,
  DROP COLUMN IF EXISTS position_y,
  DROP COLUMN IF EXISTS width,
  DROP COLUMN IF EXISTS height;
```

---

## 3. 슬라이드 크기 프리셋

| preset | width_mm | height_mm |
|--------|----------|-----------|
| A4P    | 210      | 297       |
| A4L    | 297      | 210       |
| A3P    | 297      | 420       |
| A3L    | 420      | 297       |
| custom | 사용자 입력 | 사용자 입력 |

### 설정 위치
- **목차 구성 페이지 (`toc/page.tsx`)**: 저장 버튼 위에 규격 선택 UI 추가. 선택값은 `PATCH /api/proposals/:id`로 저장.
- **슬라이드 편집 페이지 (`edit/page.tsx`)**: 상단에 현재 규격 표시 + 변경 드롭다운.

---

## 4. AI 격자 레이아웃 생성 (Pass 2 변경)

### 변경된 Gemini 출력 스키마
```json
{
  "selections": [{
    "section_title": "섹션명",
    "slides": [{
      "cols": 2,
      "rows": 1,
      "cells": [
        { "col_start": 1, "row_start": 1, "col_span": 1, "row_span": 1, "item_id": "uuid" },
        { "col_start": 2, "row_start": 1, "col_span": 1, "row_span": 1, "item_id": "uuid" }
      ]
    }]
  }]
}
```

### Gemini 프롬프트 지침 추가
- 섹션 특성별 격자 선택 가이드 (개요·위치도 → 단일/2분할, 공정 상세 → 3×2, 표+그래프 → 2×2)
- 최대 4열 × 3행 (12칸)
- 셀 병합으로 중요 아이템 강조 가능
- `col_start + col_span - 1 ≤ cols`, `row_start + row_span - 1 ≤ rows` 범위 준수
- 모든 셀은 겹치지 않아야 함

### `generate/route.ts` 변경
- `GeminiSelectionResult` 타입 → slides 배열 포함으로 변경
- DB insert: `proposal_slides`에 `cols`, `rows` 저장; `slide_cells`에 `col_start`, `row_start`, `col_span`, `row_span` 저장
- 후보 수: `totalCells = 섹션 내 모든 슬라이드의 셀 합산` (현재 `slideCount × 2` → AI가 결정 후 실제 셀 수로 대체)

---

## 5. 편집 화면 격자 에디터

### 슬라이드 썸네일
- CSS Grid (`grid-template-columns: repeat(cols, 1fr)`, `grid-template-rows: repeat(rows, 1fr)`)
- 셀: `grid-column: col_start / span col_span`, `grid-row: row_start / span row_span`
- 아이템 있으면 이미지 표시, 없으면 회색 placeholder

### 셀 조작
| 조작 | 조건 | 결과 |
|------|------|------|
| 단일 클릭 | 항상 | 셀 선택, 아이템 패널에서 교체 |
| 다중 클릭 | 인접 셀 | 다중 선택 |
| 병합 버튼 | 선택 셀이 직사각형 구성 | 하나의 셀로 통합 (col_span/row_span 확장) |
| 분할 버튼 | 병합된 셀 선택 | col_span/row_span → 1×1 복원 |

### 레이아웃 변경
슬라이드별 드롭다운: `1×1 / 2×1 / 1×2 / 2×2 / 3×1 / 3×2 / 3×3 / 4×2 / 4×3`  
→ 선택 시 기존 셀 초기화 후 새 균등 격자 생성 (아이템 배정 초기화)

### 신규 API 엔드포인트
| 메서드 | 경로 | 역할 |
|--------|------|------|
| PATCH | `/api/slides/:id` | cols/rows 변경 (레이아웃 변경) |
| POST | `/api/slides/:id/merge` | 셀 병합 (body: cell_ids[]) |
| POST | `/api/slides/:id/split` | 셀 분할 (body: cell_id) |

---

## 6. PPTX 생성 좌표 계산

```
mm → inch 변환: mmToIn(mm) = mm / 25.4

slideW = mmToIn(slide_size.width_mm)
slideH = mmToIn(slide_size.height_mm)
contentW = slideW - marginL - marginR
contentH = slideH - headerH - marginT - marginB
gutterCol = mmToIn(2)  -- 기본값
gutterRow = mmToIn(2)

cellUnitW = (contentW - gutterCol × (cols - 1)) / cols
cellUnitH = (contentH - gutterRow × (rows - 1)) / rows

cellX = marginL + (col_start - 1) × (cellUnitW + gutterCol)
cellY = headerH + marginT + (row_start - 1) × (cellUnitH + gutterRow)
cellW = cellUnitW × col_span + gutterCol × (col_span - 1)
cellH = cellUnitH × row_span + gutterRow × (row_span - 1)
```

PptxGenJS에서 A4P/A4L/A3P/A3L는 `pptx.defineLayout()`으로 커스텀 규격 등록.

---

## 7. 타입 변경 (`types/index.ts`)

```typescript
export type SlidePreset = 'A4P' | 'A4L' | 'A3P' | 'A3L' | 'custom'

export interface SlideSize {
  preset: SlidePreset
  width_mm: number
  height_mm: number
}

export interface SlideCell {
  id: string
  slide_id: string
  cell_index: number       // 제거 가능 (col_start/row_start로 대체)
  db_item_id: string | null
  image_url: string | null
  item_title: string | null
  col_start: number
  row_start: number
  col_span: number
  row_span: number
  created_at: string
}

export interface ProposalSlide {
  // 기존 필드 유지 +
  cols: number
  rows: number
  cells?: SlideCell[]
}
```

---

## 8. 구현 순서

1. DB 마이그레이션 (Supabase SQL 실행)
2. `types/index.ts` 업데이트
3. `lib/pptx-generator.ts` — 격자 좌표 기반 좌표 계산, 슬라이드 크기 반영
4. `app/api/generate/route.ts` — Pass 2 Gemini 스키마 변경, 격자 DB 저장
5. `toc/page.tsx` — 슬라이드 크기 선택 UI
6. `edit/page.tsx` — 격자 에디터, 병합/분할 버튼, 레이아웃 변경 드롭다운
7. 신규 API 라우트 (slides/:id PATCH, merge, split)
