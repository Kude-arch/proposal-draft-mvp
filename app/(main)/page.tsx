import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { statusLabel, statusColor, formatAmount } from '@/lib/utils'
import type { Proposal } from '@/types'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const sb = createServerClient()
  const { data: proposals } = await sb
    .from('proposals')
    .select('*')
    .order('updated_at', { ascending: false })

  const all = (proposals ?? []) as Proposal[]
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
              <ProposalCard key={p.id} proposal={p} />
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

function ProposalCard({ proposal: p }: { proposal: Proposal }) {
  const stepHref =
    p.status === 'draft' ? `/proposals/${p.id}/info`
    : p.status === 'analyzing' ? `/proposals/${p.id}/generate`
    : p.status === 'slides_ready' ? `/proposals/${p.id}/edit`
    : p.status === 'editing' ? `/proposals/${p.id}/edit`
    : `/proposals/${p.id}/export`

  return (
    <div className="bg-white border border-[#F0F0EF] rounded-xl p-5 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="font-semibold text-gray-900 text-sm truncate">{p.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor(p.status)}`}>
              {statusLabel(p.status)}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            {p.client && <span>{p.client}</span>}
            {p.location && <span>📍 {p.location}</span>}
            {p.scale_amount && <span>💰 {formatAmount(p.scale_amount)}</span>}
            {p.duration_months && <span>📅 {p.duration_months}개월</span>}
          </div>
          {p.construction_type?.length > 0 && (
            <div className="flex gap-1 mt-2">
              {p.construction_type.map((ct: string) => (
                <span key={ct} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                  {ct}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Link
            href={stepHref}
            className="bg-[#2563EB] text-white text-xs px-3.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {p.status === 'exported' ? '다시 편집' : '이어서 작업'}
          </Link>
          {(p.status === 'editing' || p.status === 'exported') && (
            <Link
              href={`/proposals/${p.id}/export`}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              PPTX 다운로드
            </Link>
          )}
          <span className="text-xs text-gray-300">
            {new Date(p.updated_at).toLocaleDateString('ko-KR')}
          </span>
        </div>
      </div>
    </div>
  )
}
