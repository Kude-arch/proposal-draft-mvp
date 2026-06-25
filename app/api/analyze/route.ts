import { NextRequest } from 'next/server'
import { generateJson } from '@/lib/gemini'
import { createServerClient } from '@/lib/supabase'
import { isValidUuid } from '@/lib/utils'
import type { Pass1Result } from '@/types'

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

  const tierA: string[] = proposal.ai_analysis?.rfp_keywords?.tier_a ?? []
  const tierB: string[] = [
    ...(proposal.ai_analysis?.rfp_keywords?.tier_b ?? []),
    ...(proposal.ai_analysis?.drawing_notes?.tier_b_extracted ?? []),
  ]
  const drawingNotesSummary = proposal.ai_analysis?.drawing_notes?.summary ?? ''

  const sectionTitles = (sections ?? []).map((s: { title: string }) => s.title)

  const prompt = `당신은 건설사업관리 용역 제안서 작성 전문가입니다.
아래 현장 정보와 RFP 키워드를 바탕으로 사업여건을 분석하고 각 목차 섹션에 대한 검색 전략을 수립하세요.

[현장 정보]
- 용역명: ${proposal.title}
- 발주처: ${proposal.client ?? '-'}
- 위치: ${proposal.location ?? '-'}
- 공종: ${(proposal.construction_type ?? []).join(', ') || '-'}
- 공사금액: ${proposal.scale_amount ? `${(proposal.scale_amount / 1e8).toFixed(0)}억원` : '-'}
- 기간: ${proposal.duration_months ? `${proposal.duration_months}개월` : '-'}
- 특이사항: ${proposal.special_conditions ?? '-'}
${drawingNotesSummary ? `- 도면 검토: ${drawingNotesSummary}` : ''}

[RFP 키워드]
- Tier A (관리 영역): ${tierA.join(', ')}
- Tier B (사업 특성): ${tierB.join(', ')}

[발주처 목차 섹션]
${sectionTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

다음 JSON 스키마에 맞게 응답하세요:

{
  "site_analysis": {
    "construction_category": "건축|토목|복합",
    "scale_tier": "소규모|중규모|대규모",
    "key_emphasis": ["이 사업에서 강조해야 할 관리 영역 3~5개"],
    "summary": "사업 특성 1~2문장 요약"
  },
  "section_plans": [
    {
      "section_title": "목차 섹션명 (위 목차 원문 그대로)",
      "search_description": "이 섹션에 필요한 아이템 특성을 2~3문장으로 서술 (검색 쿼리 역할)",
      "tier_b_for_section": ["이 섹션에 특히 관련된 Tier B 키워드 배열"],
      "slide_count_suggestion": 섹션당 적정 슬라이드 수(정수),
      "coverage_score": 0~100 (현재 확보된 키워드로 이 섹션을 얼마나 잘 커버하는지),
      "coverage_sources": ["rfp_text", "pptx", "drawing_notes" 중 기여한 소스],
      "coverage_hint": "coverage_score < 50이면 보완 방법 1문장, 아니면 null"
    }
  ]
}

총 목차 슬라이드 합계가 ${proposal.ai_analysis?.target_slides ?? 20}페이지에 맞도록 배분하세요.
모든 목차 섹션에 대해 section_plans 항목을 생성하세요 (${sectionTitles.length}개).`

  const result = await generateJson<Pass1Result>(prompt)

  // DB 저장
  const updatedAnalysis = {
    ...proposal.ai_analysis,
    site_analysis: result.site_analysis,
    section_plans: result.section_plans,
  }
  await sb.from('proposals').update({ ai_analysis: updatedAnalysis }).eq('id', proposal_id)

  // 섹션별 keywords 업데이트
  for (const plan of result.section_plans) {
    const section = (sections ?? []).find((s: { title: string }) => s.title === plan.section_title)
    if (section) {
      await sb
        .from('proposal_sections')
        .update({ search_keywords: plan.tier_b_for_section })
        .eq('id', section.id)
    }
  }

  return Response.json(result)
}
