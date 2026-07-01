import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { createServerClient } from '@/lib/supabase'
import { scoreItem } from '@/lib/score-items'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { tier_b_keywords, limit = 20 } = await req.json()
  const sb = createServerClient()

  if (!tier_b_keywords?.length) {
    // fallback: 최신 아이템
    const { data } = await sb
      .from('proposal_items')
      .select('id, title, section_big, keywords, keyword_status, image_url, content_text')
      .order('created_at', { ascending: false })
      .limit(limit)
    return Response.json(data ?? [])
  }

  // 각 키워드로 ILIKE 검색 후 스코어 계산
  const keywords: string[] = tier_b_keywords.slice(0, 10)

  // title + content_text ILIKE 검색 (PostgREST 필터 문법 특수문자 제거)
  const conditions = keywords.map(kw => {
    const safe = kw.replace(/[,()]/g, '')
    return `title.ilike.%${safe}%,content_text.ilike.%${safe}%`
  }).join(',')

  const { data: items, error } = await sb
    .from('proposal_items')
    .select('id, title, section_big, keywords, keyword_status, image_url, content_text')
    .or(conditions)
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const scored = (items ?? []).map(item => ({
    ...item,
    score: scoreItem(item, keywords),
  }))

  scored.sort((a, b) => b.score - a.score)
  return Response.json(scored.slice(0, limit))
}
