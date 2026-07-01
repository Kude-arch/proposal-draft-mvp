import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getProposalAccess, accessDenied } from '@/lib/proposal-access'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const genId = req.nextUrl.searchParams.get('gen')
  let targetGenId = genId

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
