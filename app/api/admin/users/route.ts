import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

const ADMIN = 'hoo000kr789@gmail.com'

export async function GET() {
  const session = await auth()
  if (session?.user?.email !== ADMIN) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('allowed_users')
    .select('id, email, created_at')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: Request) {
  const session = await auth()
  if (session?.user?.email !== ADMIN) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await req.json()
  if (!email?.trim()) return Response.json({ error: 'email required' }, { status: 400 })

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('allowed_users')
    .upsert({ email: email.trim().toLowerCase() }, { onConflict: 'email' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
