import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  const { slideId } = await params
  const body = await req.json()
  const { cols, rows, slide_title } = body

  // slide_title만 수정하는 경우 — 셀 재생성 없이 제목만 업데이트
  if (slide_title !== undefined && cols === undefined && rows === undefined) {
    const sb = createServerClient()
    const { data: slide } = await sb
      .from('proposal_slides')
      .update({ slide_title })
      .eq('id', slideId)
      .select('*, cells:slide_cells(*)')
      .single()
    return Response.json(slide)
  }

  if (!Number.isInteger(cols) || cols < 1 || cols > 4) {
    return Response.json({ error: 'cols must be 1–4' }, { status: 400 })
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > 3) {
    return Response.json({ error: 'rows must be 1–3' }, { status: 400 })
  }

  const sb = createServerClient()

  await sb.from('slide_cells').delete().eq('slide_id', slideId)

  await sb.from('proposal_slides')
    .update({ cols, rows, layout_type: `${cols}x${rows}` })
    .eq('id', slideId)

  const cells = []
  let cellIndex = 0
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      cells.push({
        id: randomUUID(),
        slide_id: slideId,
        cell_index: cellIndex++,
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
  const { error } = await sb.from('slide_cells').insert(cells)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { data: slide } = await sb
    .from('proposal_slides')
    .select('*, cells:slide_cells(*)')
    .eq('id', slideId)
    .single()

  return Response.json(slide)
}
