import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getProposalAccess, accessDenied, ownerRequired } from '@/lib/proposal-access'

const PATCHABLE_FIELDS = new Set([
  'title', 'client', 'location', 'construction_type',
  'scale_amount', 'scale_area', 'duration_months',
  'special_conditions', 'drawing_review_raw', 'rfp_file_url',
  'slide_size', 'slide_margins', 'ai_analysis', 'status',
])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { proposal, access } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()
  return Response.json(proposal)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const rawBody = await req.json()
  const safeBody = Object.fromEntries(
    Object.entries(rawBody).filter(([k]) => PATCHABLE_FIELDS.has(k))
  )
  if (Object.keys(safeBody).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('proposals')
    .update(safeBody)
    .eq('id', id)
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()
  if (access !== 'owner') return ownerRequired()

  const { error } = await sb.from('proposals').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
