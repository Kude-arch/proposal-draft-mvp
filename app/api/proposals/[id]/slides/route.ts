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
