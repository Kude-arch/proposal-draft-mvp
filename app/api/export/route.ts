import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generatePptx } from '@/lib/pptx-generator'

export async function POST(req: NextRequest) {
  const { proposal_id } = await req.json()
  const sb = createServerClient()

  const { data: proposal } = await sb
    .from('proposals')
    .select('*')
    .eq('id', proposal_id)
    .single()
  if (!proposal) return Response.json({ error: 'proposal not found' }, { status: 404 })

  const { data: slides } = await sb
    .from('proposal_slides')
    .select(`*, cells:slide_cells(*)`)
    .eq('proposal_id', proposal_id)
    .order('order_index')

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
