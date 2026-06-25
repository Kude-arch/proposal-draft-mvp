import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
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

  // title + content_text ILIKE 검색
  const conditions = keywords.map(kw =>
    `title.ilike.%${kw}%,content_text.ilike.%${kw}%`
  ).join(',')

  const { data: items, error } = await sb
    .from('proposal_items')
    .select('id, title, section_big, keywords, keyword_status, image_url, content_text')
    .or(conditions)
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // 클라이언트사이드 스코어 계산
  const scored = (items ?? []).map(item => {
    let score = 0
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      const titleLower = (item.title ?? '').toLowerCase()
      const contentLower = (item.content_text ?? '').toLowerCase()
      const customKws: string[] = (item.keywords ?? [])
        .filter((k: { type: string }) => k.type === 'custom')
        .map((k: { value: string }) => k.value.toLowerCase())
      const taxKws: string[] = (item.keywords ?? [])
        .filter((k: { type: string }) => k.type === 'taxonomy')
        .map((k: { value: string }) => k.value.toLowerCase())

      if (titleLower.includes(kwLower)) score += 40
      if (customKws.some(c => c.includes(kwLower))) score += 30
      if (contentLower.includes(kwLower)) score += 20
      if (taxKws.some(t => t.includes(kwLower))) score += 10
    }
    if (item.keyword_status === 'human_verified') score += 5
    return { ...item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return Response.json(scored.slice(0, limit))
}
