import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'
import { getProposalAccess, accessDenied } from '@/lib/proposal-access'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const { data, error } = await sb
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', id)
    .order('order_index')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const body = await req.json()
  if (!body.title?.trim()) return Response.json({ error: 'title is required' }, { status: 400 })

  const { count } = await sb
    .from('proposal_sections')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', id)
  const { data, error } = await sb
    .from('proposal_sections')
    .insert({ title: body.title.trim(), proposal_id: id, order_index: count ?? 0 })
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const body: Array<{ id?: string; title: string; order_index: number; slide_count?: number }> = await req.json()

  const { error: deleteError } = await sb.from('proposal_sections').delete().eq('proposal_id', id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })

  if (body.length > 0) {
    const rows = body.map((s, i) => ({
      id: (s.id && !s.id.startsWith('new-')) ? s.id : randomUUID(),
      proposal_id: id,
      title: s.title,
      order_index: i,
      slide_count: s.slide_count ?? 2,
    }))
    const { error } = await sb.from('proposal_sections').insert(rows)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  const { data } = await sb
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', id)
    .order('order_index')
  return Response.json(data)
}
