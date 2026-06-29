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

  return (
    <div>
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
      <a href="/" className="text-blue-600 font-bold text-lg">제안서 자동생성</a>
      <span className="text-gray-300">|</span>
      <span className="text-gray-500 text-sm">미래사업팀</span>
    </header>
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">제안서 목록</h1>
          <p className="text-gray-500 text-sm mt-1">작성 중인 제안서를 이어서 작업하거나 새로 시작합니다</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/items"
            className="bg-white text-gray-700 border border-gray-300 px-5 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            아이템 DB
          </Link>
          <Link
            href="/proposals/new"
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            + 새 제안서
          </Link>
        </div>
      </div>

      {!proposals || proposals.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-600 font-medium mb-2">아직 작성된 제안서가 없습니다</p>
          <p className="text-gray-400 text-sm mb-6">새 제안서를 시작해보세요</p>
          <Link
            href="/proposals/new"
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            첫 제안서 시작하기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {(proposals as Proposal[]).map(p => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      )}
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
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-semibold text-gray-900 text-lg truncate">{p.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor(p.status)}`}>
              {statusLabel(p.status)}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-500">
            {p.client && <span>{p.client}</span>}
            {p.location && <span>📍 {p.location}</span>}
            {p.scale_amount && <span>💰 {formatAmount(p.scale_amount)}</span>}
            {p.duration_months && <span>📅 {p.duration_months}개월</span>}
          </div>
          {p.construction_type?.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {p.construction_type.map((ct: string) => (
                <span key={ct} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                  {ct}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Link
            href={stepHref}
            className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {p.status === 'exported' ? '다시 편집' : '이어서 작업'}
          </Link>
          {(p.status === 'editing' || p.status === 'exported') && (
            <Link
              href={`/proposals/${p.id}/export`}
              className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
            >
              PPTX 다운로드
            </Link>
          )}
          <span className="text-xs text-gray-400">
            {new Date(p.updated_at).toLocaleDateString('ko-KR')}
          </span>
        </div>
      </div>
    </div>
  )
}
