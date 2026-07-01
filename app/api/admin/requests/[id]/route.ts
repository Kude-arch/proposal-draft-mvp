import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { action } = await req.json()
  const sb = createServiceClient()

  if (action === 'approve') {
    const { data: reqData } = await sb
      .from('access_requests')
      .select('email')
      .eq('id', id)
      .single()

    if (reqData?.email) {
      await sb.from('allowed_users').upsert({ email: reqData.email }, { onConflict: 'email' })
    }
  }

  const status = action === 'approve' ? 'approved' : 'rejected'
  const { error } = await sb.from('access_requests').update({ status }).eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
