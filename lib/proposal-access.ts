import { createServerClient } from '@/lib/supabase'
import type { Proposal } from '@/types'

export type AccessLevel = 'owner' | 'member' | null

interface AccessResult {
  proposal: Proposal | null
  access: AccessLevel
  sb: ReturnType<typeof createServerClient>
}

/**
 * proposal_id + userEmail → 소유자/멤버 여부 반환.
 * access === null 이면 접근 불가 (존재하지 않거나 권한 없음).
 */
export async function getProposalAccess(
  proposalId: string,
  userEmail: string
): Promise<AccessResult> {
  const sb = createServerClient()
  const { data: proposal } = await sb
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .single()

  if (!proposal) return { proposal: null, access: null, sb }

  // 소유자 확인 (null 레거시 데이터는 관리자만 접근)
  const adminEmail = process.env.ADMIN_EMAIL
  if (proposal.user_email === userEmail) {
    return { proposal, access: 'owner', sb }
  }
  if (proposal.user_email === null && adminEmail && userEmail === adminEmail) {
    return { proposal, access: 'owner', sb }
  }

  // 멤버 확인
  const { data: member } = await sb
    .from('proposal_members')
    .select('role')
    .eq('proposal_id', proposalId)
    .eq('user_email', userEmail)
    .single()

  if (member) return { proposal, access: 'member', sb }
  return { proposal: null, access: null, sb }
}

/**
 * slideId 기반으로 proposal_id 를 조회한 뒤 getProposalAccess 위임.
 */
export async function getSlideProposalAccess(
  slideId: string,
  userEmail: string
): Promise<AccessResult & { proposalId: string | null }> {
  const sb = createServerClient()
  const { data: slide } = await sb
    .from('proposal_slides')
    .select('proposal_id')
    .eq('id', slideId)
    .single()

  if (!slide) return { proposal: null, access: null, sb, proposalId: null }

  const result = await getProposalAccess(slide.proposal_id as string, userEmail)
  return { ...result, proposalId: slide.proposal_id as string }
}

/** 403/404 Response 헬퍼 */
export function accessDenied() {
  return Response.json({ error: 'Not found or forbidden' }, { status: 404 })
}
export function ownerRequired() {
  return Response.json({ error: 'Owner permission required' }, { status: 403 })
}
