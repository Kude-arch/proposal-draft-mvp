import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = createServerClient()

  const { data, error } = await sb
    .from('slide_generations')
    .select('id, proposal_id, gen_number, created_at')
    .eq('proposal_id', id)
    .order('gen_number', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
