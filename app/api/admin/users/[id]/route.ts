import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

const ADMIN = process.env.ADMIN_EMAIL ?? ''

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!ADMIN || session?.user?.email !== ADMIN) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const sb = createServiceClient()

  // 관리자 계정은 삭제 불가
  const { data: target } = await sb.from('allowed_users').select('email').eq('id', id).single()
  if (target?.email === ADMIN) return Response.json({ error: '관리자 계정은 삭제할 수 없습니다' }, { status: 400 })

  const { error } = await sb.from('allowed_users').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
