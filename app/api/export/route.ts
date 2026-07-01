import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { generatePptx } from '@/lib/pptx-generator'
import type { Proposal, ProposalSlide, SlideCell } from '@/types'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { proposal_id, generation_id } = await req.json()

  const { getProposalAccess, accessDenied } = await import('@/lib/proposal-access')
  const { proposal, access, sb } = await getProposalAccess(proposal_id, session.user.email)
  if (!access) return accessDenied()
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

  const pptxBuffer = await generatePptx(
    proposal as Proposal,
    slides as (ProposalSlide & { cells: SlideCell[] })[]
  )

  const filename = `${proposal.title ?? 'proposal'}_제안서.pptx`
    .replace(/[/\\:*?"<>|]/g, '_')

  return new Response(new Uint8Array(pptxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
