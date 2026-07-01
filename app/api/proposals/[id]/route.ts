import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServerClient } from '@/lib/supabase'

async function getProposalIfOwned(id: string, userEmail: string) {
  const sb = createServerClient()
  const { data, error } = await sb.from('proposals').select('*').eq('id', id).single()
  if (error || !data) return { proposal: null, sb, error: 'not_found' }
  // user_email이 NULL인 기존 데이터는 관리자(ADMIN_EMAIL)만 접근 가능하게 처리
  if (data.user_email !== null && data.user_email !== userEmail) {
    return { proposal: null, sb, error: 'forbidden' }
  }
  return { proposal: data, sb, error: null }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { proposal, error } = await getProposalIfOwned(id, session.user.email)
  if (error === 'not_found') return Response.json({ error: 'not found' }, { status: 404 })
  if (error === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 })
  return Response.json(proposal)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { proposal, sb, error } = await getProposalIfOwned(id, session.user.email)
  if (error === 'not_found') return Response.json({ error: 'not found' }, { status: 404 })
  if (error === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { data, error: updateError } = await sb
    .from('proposals')
    .update(body)
    .eq('id', proposal!.id)
    .select()
    .single()
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { proposal, sb, error } = await getProposalIfOwned(id, session.user.email)
  if (error === 'not_found') return Response.json({ error: 'not found' }, { status: 404 })
  if (error === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { error: deleteError } = await sb.from('proposals').delete().eq('id', proposal!.id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
