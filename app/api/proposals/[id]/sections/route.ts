import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createServerClient()
  const { data, error } = await sb
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', id)
    .order('order_index')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const sb = createServerClient()
  // 현재 섹션 수 조회 → order_index 결정
  const { count } = await sb
    .from('proposal_sections')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', id)
  const { data, error } = await sb
    .from('proposal_sections')
    .insert({ ...body, proposal_id: id, order_index: (count ?? 0) })
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body: Array<{ id?: string; title: string; order_index: number; slide_count?: number }> = await req.json()
  const sb = createServerClient()
  // 전체 섹션 목록 교체
  const { error: deleteError } = await sb.from('proposal_sections').delete().eq('proposal_id', id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })
  if (body.length > 0) {
    const rows = body.map((s, i) => ({
      id: (s.id && !s.id.startsWith('new-')) ? s.id : randomUUID(),
      proposal_id: id,
      title: s.title,
      order_index: i,
      slide_count: s.slide_count ?? 2,
    }))
    const { error } = await sb.from('proposal_sections').insert(rows)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }
  const { data } = await sb
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', id)
    .order('order_index')
  return Response.json(data)
}
