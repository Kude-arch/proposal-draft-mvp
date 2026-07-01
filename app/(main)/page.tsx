import Link from 'next/link'
import { auth } from '@/auth'
import { createServerClient } from '@/lib/supabase'
import type { Proposal } from '@/types'
import ProposalCard from './ProposalCard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()
  const userEmail = session?.user?.email ?? null

  const sb = createServerClient()
  const query = sb.from('proposals').select('*').order('updated_at', { ascending: false })
  const adminEmail = process.env.ADMIN_EMAIL
  const isAdmin = userEmail && adminEmail && userEmail === adminEmail
  const { data: ownedProposals } = userEmail
    ? isAdmin
      ? await query.or(`user_email.eq.${userEmail},user_email.is.null`)
      : await query.eq('user_email', userEmail)
    : await query.is('user_email', null)

  // 멤버로 초대된 제안서도 포함
  let memberProposals: Proposal[] = []
  if (userEmail) {
    try {
      const { data: memberRows } = await sb
        .from('proposal_members')
        .select('proposal_id')
        .eq('user_email', userEmail)
      const memberIds = (memberRows ?? []).map((r: { proposal_id: string }) => r.proposal_id)
      if (memberIds.length > 0) {
        const ownedIds = new Set((ownedProposals ?? []).map((p: Proposal) => p.id))
        const newIds = memberIds.filter((id: string) => !ownedIds.has(id))
        if (newIds.length > 0) {
          const { data: mp } = await sb
            .from('proposals')
            .select('*')
            .in('id', newIds)
            .order('updated_at', { ascending: false })
          memberProposals = (mp ?? []) as Proposal[]
        }
      }
    } catch {
      // 멤버 제안서 로드 실패 시 소유 제안서만 표시
    }
  }

  const all = [...(ownedProposals ?? []), ...memberProposals] as Proposal[]

  // 안(案) 목록을 한 번에 조회
  const { data: allGenerations } = all.length
    ? await sb
        .from('slide_generations')
        .select('id, proposal_id, gen_number')
        .in('proposal_id', all.map(p => p.id))
        .order('gen_number', { ascending: true })
    : { data: [] }

  const gensByProposal: Record<string, { id: string; gen_number: number }[]> = {}
  for (const gen of allGenerations ?? []) {
    if (!gensByProposal[gen.proposal_id]) gensByProposal[gen.proposal_id] = []
    gensByProposal[gen.proposal_id].push(gen)
  }
  const inProgress = all.filter(p => p.status !== 'exported').length
  const exported = all.filter(p => p.status === 'exported').length

  return (
    <div className="flex flex-col min-h-full">
      {/* 페이지 헤더 */}
      <div className="sticky top-0 z-10 bg-[#F7F8FA] border-b border-[#F0F0EF] px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">제안서 목록</h1>
          <p className="text-xs text-gray-400 mt-0.5">작성 중인 제안서를 이어서 작업하거나 새로 시작합니다</p>
        </div>
        <Link
          href="/proposals/new"
          className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 새 제안서
        </Link>
      </div>

      <div className="px-8 py-6 flex-1">
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="전체 제안서" value={all.length} icon="📋" />
          <StatCard label="작업 중" value={inProgress} icon="✏️" />
          <StatCard label="완료" value={exported} icon="✅" />
        </div>

        {all.length === 0 ? (
          <div className="bg-white border border-[#F0F0EF] rounded-xl p-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-gray-600 font-medium mb-1">아직 작성된 제안서가 없습니다</p>
            <p className="text-gray-400 text-sm mb-6">새 제안서를 시작해보세요</p>
            <Link
              href="/proposals/new"
              className="bg-[#2563EB] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              첫 제안서 시작하기
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {all.map(p => (
              <ProposalCard key={p.id} proposal={p} generations={gensByProposal[p.id] ?? []} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white border border-[#F0F0EF] rounded-xl px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

