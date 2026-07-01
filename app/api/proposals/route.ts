import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createServerClient()
  const { data, error } = await sb
    .from('proposals')
    .select('*')
    .eq('user_email', session.user.email)
    .order('updated_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
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
