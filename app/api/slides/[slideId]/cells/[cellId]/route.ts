import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string; cellId: string }> }
) {
  const { cellId } = await params
  const body = await req.json()
  const sb = createServerClient()
  const { data, error } = await sb
    .from('slide_cells')
    .update({ db_item_id: body.db_item_id, image_url: body.image_url, item_title: body.item_title })
    .eq('id', cellId)
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
