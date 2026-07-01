import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getProposalAccess, accessDenied, ownerRequired } from '@/lib/proposal-access'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; genId: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, genId } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()
  if (access !== 'owner') return ownerRequired()

  // 해당 generation이 이 proposal에 속하는지 확인
  const { data: gen } = await sb
    .from('slide_generations')
    .select('id')
    .eq('id', genId)
    .eq('proposal_id', id)
    .single()
  if (!gen) return Response.json({ error: 'not found' }, { status: 404 })

  // slide_cells 먼저 삭제 (cascade가 없을 경우 대비)
  const { data: slides } = await sb
    .from('proposal_slides')
    .select('id')
    .eq('generation_id', genId)
  if (slides?.length) {
    const slideIds = slides.map((s: { id: string }) => s.id)
    await sb.from('slide_cells').delete().in('slide_id', slideIds)
    await sb.from('proposal_slides').delete().in('id', slideIds)
  }

  // generation 삭제
  const { error } = await sb
    .from('slide_generations')
    .delete()
    .eq('id', genId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
