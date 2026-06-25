import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generateJson } from '@/lib/gemini'
import type { Pass2Slide, SectionPlan } from '@/types'

interface CandidateItem {
  id: string
  title: string
  image_url: string | null
}

interface GeminiSelectionResult {
  selections: Array<{
    section_title: string
    selected_item_ids: string[]
  }>
}

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

  // ── Step 1: 섹션별 후보 아이템 수집 ──────────────────────────────
  const sectionCandidates: Map<string, CandidateItem[]> = new Map()

  for (const section of sections) {
    const plan = sectionPlans.find(p => p.section_title === section.title)
    const tierBKeywords: string[] = plan?.tier_b_for_section ?? section.search_keywords ?? []

    let candidates: CandidateItem[] = []
    if (tierBKeywords.length > 0) {
      const conditions = tierBKeywords
        .slice(0, 8)
        .map(kw => `title.ilike.%${kw}%,content_text.ilike.%${kw}%`)
        .join(',')
      const { data: items } = await sb
        .from('proposal_items')
        .select('id, title, image_url, content_text, keywords')
        .or(conditions)
        .limit(20)
      candidates = (items ?? []).map((it: { id: string; title: string; image_url: string | null }) => ({
        id: it.id,
        title: it.title,
        image_url: it.image_url,
      }))
    }
    sectionCandidates.set(section.id, candidates)
  }

  // ── Step 2: Gemini로 섹션별 최적 아이템 선택 ────────────────────
  const geminiSelectionMap: Map<string, string[]> = new Map()

  const sectionsWithCandidates = sections.filter(s => (sectionCandidates.get(s.id) ?? []).length > 0)

  if (sectionsWithCandidates.length > 0) {
    const sectionBlocks = sectionsWithCandidates.map(section => {
      const plan = sectionPlans.find(p => p.section_title === section.title)
      const candidates = sectionCandidates.get(section.id) ?? []
      const slideCount = (section as { slide_count?: number }).slide_count ?? plan?.slide_count_suggestion ?? 2
      const needed = slideCount * 2

      const candidateList = candidates
        .map((c, i) => `  [${i}] id="${c.id}" title="${c.title}"`)
        .join('\n')

      return `## 섹션: "${section.title}"
설명: ${plan?.search_description ?? ''}
필요 아이템 수: ${needed}개 (슬라이드 ${slideCount}개 × 셀 2개)
후보 목록:
${candidateList}`
    }).join('\n\n')

    const prompt = `당신은 건설사업관리 제안서 전문가입니다.
아래 사업 정보와 각 목차 섹션에 대해, 제공된 후보 아이템 목록에서 가장 적합한 아이템을 선택하고 순서를 정하세요.

[사업 정보]
- 용역명: ${proposal.title}
- 발주처: ${proposal.client ?? '-'}
- 위치: ${proposal.location ?? '-'}
- 공종: ${(proposal.construction_type ?? []).join(', ') || '-'}
- 사업 특성: ${proposal.ai_analysis?.site_analysis?.summary ?? '-'}

[목차별 아이템 선택]
${sectionBlocks}

응답 형식 (JSON만, 설명 없이):
{
  "selections": [
    {
      "section_title": "섹션명 (위 ## 섹션: 뒤의 텍스트 그대로)",
      "selected_item_ids": ["id값1", "id값2", ...] // 필요 아이템 수만큼, 관련성 높은 순
    }
  ]
}

주의:
- selected_item_ids에는 반드시 위 후보 목록의 실제 id값을 사용하세요
- 중복 id 없이, 관련성 높은 순서로 나열
- 후보가 부족하면 있는 것만 사용 (빈 배열도 가능)`

    try {
      const result = await generateJson<GeminiSelectionResult>(prompt)
      for (const sel of result.selections ?? []) {
        const section = sections.find(s => s.title === sel.section_title)
        if (section) {
          geminiSelectionMap.set(section.id, sel.selected_item_ids ?? [])
        }
      }
    } catch {
      // Gemini 실패 시 키워드 순 fallback (로그만)
    }
  }

  // ── Step 3: 슬라이드 및 셀 생성 ────────────────────────────────
  let globalSlideIndex = 0
  const allSlides: Pass2Slide[] = []

  for (const section of sections) {
    const plan = sectionPlans.find(p => p.section_title === section.title)
    const slideCount = (section as { slide_count?: number }).slide_count ?? plan?.slide_count_suggestion ?? 2

    const rawCandidates = sectionCandidates.get(section.id) ?? []
    const geminiIds = geminiSelectionMap.get(section.id)

    // Gemini 선택이 있으면 그 순서대로, 없으면 키워드 매치 순서
    let orderedCandidates: CandidateItem[]
    if (geminiIds && geminiIds.length > 0) {
      const candidateMap = new Map(rawCandidates.map(c => [c.id, c]))
      orderedCandidates = geminiIds
        .map(id => candidateMap.get(id))
        .filter((c): c is CandidateItem => !!c)
      // Gemini가 선택 못한 나머지를 뒤에 붙임
      const usedIds = new Set(geminiIds)
      const remaining = rawCandidates.filter(c => !usedIds.has(c.id))
      orderedCandidates = [...orderedCandidates, ...remaining]
    } else {
      orderedCandidates = rawCandidates
    }

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
      if (slideErr || !slide) { globalSlideIndex++; continue }

      const cells = []
      const baseIdx = si * 2
      for (let ci = 0; ci < 2; ci++) {
        const candidate = orderedCandidates[baseIdx + ci] ?? null
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

  await sb.from('proposals').update({ status: 'slides_ready' }).eq('id', proposal_id)
  return Response.json({ total_slides: globalSlideIndex, slides: allSlides })
}
