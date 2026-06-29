import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()

  // PostgreSQL GROUP BY를 직접 실행해 row limit 문제를 회피
  const { data, error } = await sb.rpc('get_source_proposal_counts')

  if (error) {
    // RPC 없으면 fallback: 충분히 큰 limit으로 클라이언트 집계
    const { data: rows, error: err2 } = await sb
      .from('proposal_items')
      .select('source_proposal')
      .not('source_proposal', 'is', null)
      .limit(10000)

    if (err2) return Response.json({ error: err2.message }, { status: 500 })

    const counts: Record<string, number> = {}
    for (const row of rows ?? []) {
      const src = row.source_proposal as string
      if (src) counts[src] = (counts[src] ?? 0) + 1
    }
    const groups = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    return Response.json(groups)
  }

  return Response.json(data)
}
