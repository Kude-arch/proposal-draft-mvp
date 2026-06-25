import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { Pass2Slide, SectionPlan } from '@/types'

export async function POST(req: NextRequest) {
  const { proposal_id } = await req.json()
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

  // 각 섹션별로 슬라이드 생성
  let globalSlideIndex = 0
  const allSlides: Pass2Slide[] = []

  for (const section of sections) {
    const plan = sectionPlans.find(p => p.section_title === section.title)
    const slideCount = (section as { slide_count?: number }).slide_count ?? plan?.slide_count_suggestion ?? 2
    const tierBKeywords: string[] = plan?.tier_b_for_section ?? section.search_keywords ?? []

    // 섹션 키워드로 아이템 검색
    let candidates: Array<{ id: string; title: string; image_url: string }> = []
    if (tierBKeywords.length > 0) {
      const conditions = tierBKeywords
        .slice(0, 8)
        .map(kw => `title.ilike.%${kw}%,content_text.ilike.%${kw}%`)
        .join(',')
      const { data: items } = await sb
        .from('proposal_items')
        .select('id, title, image_url, content_text, keywords')
        .or(conditions)
        .limit(50)
      candidates = (items ?? []).map((it: { id: string; title: string; image_url: string }) => ({
        id: it.id,
        title: it.title,
        image_url: it.image_url,
      }))
    }

    // 슬라이드 레이아웃: 2-cell 기본 (좌우 분할)
    for (let si = 0; si < slideCount; si++) {
      const slideNumber = globalSlideIndex + 1
      const { data: slide, error: slideErr } = await sb
        .from('proposal_slides')
        .insert({
          proposal_id,
          section_id: section.id,
          slide_number: slideNumber,
          order_index: globalSlideIndex,
          layout_type: '2-cell',
          slide_title: `${section.title}${slideCount > 1 ? ` (${si + 1}/${slideCount})` : ''}`,
        })
        .select()
        .single()
      if (slideErr || !slide) {
        globalSlideIndex++
        continue
      }

      // 셀 2개 생성 (각 셀에 후보 아이템 배정)
      const cells: Array<{
        slide_id: string
        cell_index: number
        db_item_id: string | null
        image_url: string | null
        item_title: string | null
        position_x: number
        position_y: number
        width: number
        height: number
      }> = []
      const baseItemIdx = si * 2
      for (let ci = 0; ci < 2; ci++) {
        const candidate = candidates[baseItemIdx + ci] ?? null
        cells.push({
          slide_id: slide.id,
          cell_index: ci,
          db_item_id: candidate?.id ?? null,
          image_url: candidate?.image_url ?? null,
          item_title: candidate?.title ?? null,
          position_x: ci === 0 ? 0.5 : 5.0,
          position_y: 1.0,
          width: 4.2,
          height: 5.5,
        })
      }
      await sb.from('slide_cells').insert(cells)

      allSlides.push({
        slide_number: slideNumber,
        section_title: section.title,
        layout_type: '2-cell',
        cells: cells.map((c, idx) => ({
          cell_index: idx,
          db_item_id: c.db_item_id,
          image_url: c.image_url,
          item_title: c.item_title,
        })),
      })
      globalSlideIndex++
    }
  }

  // 상태 업데이트
  await sb
    .from('proposals')
    .update({ status: 'slides_ready' })
    .eq('id', proposal_id)

  return Response.json({ total_slides: globalSlideIndex, slides: allSlides })
}
