import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getProposalAccess, accessDenied, ownerRequired } from '@/lib/proposal-access'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { proposal, access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const { data: members } = await sb
    .from('proposal_members')
    .select('id, user_email, role, invited_by, created_at')
    .eq('proposal_id', id)
    .order('created_at')

  return Response.json({
    owner_email: proposal!.user_email ?? null,
    members: members ?? [],
    my_access: access,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { proposal, access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()
  if (access !== 'owner') return ownerRequired()

  const { email } = await req.json()
  if (!email?.trim()) return Response.json({ error: 'email required' }, { status: 400 })
  const targetEmail = email.trim().toLowerCase()

  // 소유자 본인을 멤버로 추가 불가
  if ((proposal as { user_email?: string | null })?.user_email === targetEmail) {
    return Response.json({ error: '소유자는 이미 전체 권한을 갖고 있습니다' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('proposal_members')
    .upsert(
      { proposal_id: id, user_email: targetEmail, role: 'editor', invited_by: session.user.email },
      { onConflict: 'proposal_id,user_email' }
    )
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { access, sb } = await getProposalAccess(id, session.user.email)
  if (!access) return accessDenied()

  const { email } = await req.json()
  if (!email?.trim()) return Response.json({ error: 'email required' }, { status: 400 })
  const targetEmail = email.trim().toLowerCase()

  // 소유자만 타인 제거 가능, 본인은 스스로 제거 가능
  if (access !== 'owner' && targetEmail !== session.user.email) return ownerRequired()

  const { error } = await sb
    .from('proposal_members')
    .delete()
    .eq('proposal_id', id)
    .eq('user_email', targetEmail)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
