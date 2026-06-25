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
