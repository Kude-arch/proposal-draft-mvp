import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await req.json()
  const email = session.user.email
  const sb = createServiceClient()

  const { data: existing } = await sb
    .from('access_requests')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .single()

  if (existing) {
    return Response.json({ error: '이미 요청이 접수되었습니다.' }, { status: 409 })
  }

  const { error } = await sb.from('access_requests').insert({ email, name })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
