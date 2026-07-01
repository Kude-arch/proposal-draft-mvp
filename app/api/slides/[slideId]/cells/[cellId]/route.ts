import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getSlideProposalAccess, accessDenied } from '@/lib/proposal-access'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slideId: string; cellId: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { slideId, cellId } = await params
  const { access, sb } = await getSlideProposalAccess(slideId, session.user.email)
  if (!access) return accessDenied()

  const body = await req.json()
  const { data, error } = await sb
    .from('slide_cells')
    .update({ db_item_id: body.db_item_id, image_url: body.image_url, item_title: body.item_title })
    .eq('id', cellId)
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
