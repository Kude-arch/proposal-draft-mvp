import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  const { slideId } = await params
  const { cell_id }: { cell_id: string } = await req.json()

  const sb = createServerClient()

  const { data: cell, error: fetchErr } = await sb
    .from('slide_cells')
    .select('*')
    .eq('id', cell_id)
    .eq('slide_id', slideId)
    .single()
  if (fetchErr || !cell) return Response.json({ error: '셀을 찾을 수 없습니다' }, { status: 404 })

  if (cell.col_span === 1 && cell.row_span === 1) {
    return Response.json({ error: '이미 1×1 셀입니다' }, { status: 400 })
  }

  const newCells = []
  let cellIndex = cell.cell_index
  for (let r = cell.row_start; r < cell.row_start + cell.row_span; r++) {
    for (let c = cell.col_start; c < cell.col_start + cell.col_span; c++) {
      if (c === cell.col_start && r === cell.row_start) {
        continue
      }
      newCells.push({
        id: randomUUID(),
        slide_id: slideId,
        cell_index: ++cellIndex,
        db_item_id: null,
        image_url: null,
        item_title: null,
        col_start: c,
        row_start: r,
        col_span: 1,
        row_span: 1,
      })
    }
  }

  await sb.from('slide_cells')
    .update({ col_span: 1, row_span: 1 })
    .eq('id', cell_id)

  if (newCells.length > 0) {
    await sb.from('slide_cells').insert(newCells)
  }

  const { data: slide } = await sb
    .from('proposal_slides')
    .select('*, cells:slide_cells(*)')
    .eq('id', slideId)
    .single()

  return Response.json(slide)
}
