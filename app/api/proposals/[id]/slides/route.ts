import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createServerClient()
  const { data: slides, error } = await sb
    .from('proposal_slides')
    .select(`*, cells:slide_cells(*)`)
    .eq('proposal_id', id)
    .order('order_index')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(slides)
}
