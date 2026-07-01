import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const sb = createServerClient()

  // PostgreSQL GROUP BY를 직접 실행해 row limit 문제를 회피
  const { data, error } = await sb.rpc('get_source_proposal_counts')

  if (error) {
    return Response.json({ error: 'get_source_proposal_counts RPC가 존재하지 않습니다. supabase/migration_proposal_owner.sql을 적용하거나 RPC를 생성하세요.' }, { status: 500 })
  }

  return Response.json(data)
}
