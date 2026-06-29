import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isValidUuid } from '@/lib/utils'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) return Response.json({ error: 'invalid id' }, { status: 400 })

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.keywords !== undefined) update.keywords = body.keywords
  if (body.keyword_status !== undefined) update.keyword_status = body.keyword_status
  if (body.section_big !== undefined) update.section_big = body.section_big
  if (body.section_small !== undefined) update.section_small = body.section_small
  if (body.title !== undefined) update.title = body.title

  if (Object.keys(update).length === 0)
    return Response.json({ error: 'no fields to update' }, { status: 400 })

  const sb = createServerClient()
  const { data, error } = await sb
    .from('proposal_items')
    .update(update)
    .eq('id', id)
    .select('id, title, section_big, section_small, keywords, keyword_status, image_url')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
