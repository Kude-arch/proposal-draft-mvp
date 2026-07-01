import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createServerClient()

  // 소유한 제안서
  const { data: owned, error } = await sb
    .from('proposals')
    .select('*')
    .or(`user_email.eq.${session.user.email},user_email.is.null`)
    .order('updated_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // 멤버로 초대된 제안서
  const { data: memberRows } = await sb
    .from('proposal_members')
    .select('proposal_id')
    .eq('user_email', session.user.email)
  const memberIds = (memberRows ?? []).map((r: { proposal_id: string }) => r.proposal_id)
  const ownedIds = new Set((owned ?? []).map((p: { id: string }) => p.id))
  const newIds = memberIds.filter((id: string) => !ownedIds.has(id))

  let memberProposals: unknown[] = []
  if (newIds.length > 0) {
    const { data: mp } = await sb
      .from('proposals')
      .select('*')
      .in('id', newIds)
      .order('updated_at', { ascending: false })
    memberProposals = mp ?? []
  }

  return Response.json([...(owned ?? []), ...memberProposals])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const sb = createServerClient()
  const { data, error } = await sb
    .from('proposals')
    .insert({ title: body.title || '새 제안서', status: 'draft', user_email: session.user.email })
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
