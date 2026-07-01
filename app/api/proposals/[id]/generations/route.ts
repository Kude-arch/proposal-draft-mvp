import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getProposalAccess, accessDenied } from '@/lib/proposal-access'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const { data, error } = await sb
    .from('slide_generations')
    .select('id, proposal_id, gen_number, created_at')
    .eq('proposal_id', id)
    .order('gen_number', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
