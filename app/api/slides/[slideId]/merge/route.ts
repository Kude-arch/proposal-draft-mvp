import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getSlideProposalAccess, accessDenied } from '@/lib/proposal-access'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { slideId } = await params
  const { access, sb } = await getSlideProposalAccess(slideId, session.user.email)
  if (!access) return accessDenied()

  const { cell_ids }: { cell_ids: string[] } = await req.json()

  if (!Array.isArray(cell_ids) || cell_ids.length < 2) {
    return Response.json({ error: '병합하려면 2개 이상 셀 선택 필요' }, { status: 400 })
  }

  const { data: cells, error: fetchErr } = await sb
    .from('slide_cells')
    .select('*')
    .in('id', cell_ids)
    .eq('slide_id', slideId)
  if (fetchErr || !cells?.length) {
    return Response.json({ error: '셀을 찾을 수 없습니다' }, { status: 404 })
  }

  const minCol = Math.min(...cells.map(c => c.col_start))
  const maxCol = Math.max(...cells.map(c => c.col_start + c.col_span - 1))
  const minRow = Math.min(...cells.map(c => c.row_start))
  const maxRow = Math.max(...cells.map(c => c.row_start + c.row_span - 1))

  const newColSpan = maxCol - minCol + 1
  const newRowSpan = maxRow - minRow + 1

  const totalArea = cells.reduce((sum, c) => sum + c.col_span * c.row_span, 0)
  if (totalArea !== newColSpan * newRowSpan) {
    return Response.json({ error: '선택된 셀이 직사각형을 구성하지 않습니다' }, { status: 400 })
  }

  const keepCell = cells.reduce((a, b) => a.cell_index < b.cell_index ? a : b)
  const deleteCellIds = cells.filter(c => c.id !== keepCell.id).map(c => c.id)

  await sb.from('slide_cells').delete().in('id', deleteCellIds)
  const { error: updateErr } = await sb.from('slide_cells')
    .update({
      col_start: minCol,
      row_start: minRow,
      col_span: newColSpan,
      row_span: newRowSpan,
    })
    .eq('id', keepCell.id)
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })

  const { data: slide } = await sb
    .from('proposal_slides')
    .select('*, cells:slide_cells(*)')
    .eq('id', slideId)
    .single()

  return Response.json(slide)
}
