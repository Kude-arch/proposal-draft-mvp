import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const PAGE_SIZE = 40

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const status = searchParams.get('status') ?? ''
  const source = searchParams.get('source') ?? ''
  const offset = (page - 1) * PAGE_SIZE

  const sb = createServerClient()
  let query = sb
    .from('proposal_items')
    .select('id, title, section_big, section_small, keywords, keyword_status, image_url, source_proposal', { count: 'exact' })

  if (q) {
    const safe = q.replace(/[,()]/g, '')
    query = query.or(`title.ilike.%${safe}%,content_text.ilike.%${safe}%`)
  }
  if (status && status !== 'all') {
    query = query.eq('keyword_status', status)
  }
  if (source) {
    query = query.eq('source_proposal', source)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ items: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
}
