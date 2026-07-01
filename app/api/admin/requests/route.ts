import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const session = await auth()
  if (session?.user?.email !== process.env.ADMIN_EMAIL) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
