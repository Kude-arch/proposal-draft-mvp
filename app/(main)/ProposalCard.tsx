'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { statusLabel, statusColor, formatAmount } from '@/lib/utils'
import type { Proposal } from '@/types'

interface Props {
  proposal: Proposal
  generations: { id: string; gen_number: number }[]
}

export default function ProposalCard({ proposal: p, generations }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const latestGen = generations.length > 0 ? generations[generations.length - 1] : null
  const hasSlides = generations.length > 0

  const stepHref =
    p.status === 'draft' ? `/proposals/${p.id}/info`
    : p.status === 'analyzing' ? `/proposals/${p.id}/generate`
    : hasSlides ? `/proposals/${p.id}/edit?gen=${latestGen!.id}`
    : p.status === 'slides_ready' ? `/proposals/${p.id}/edit`
    : p.status === 'editing' ? `/proposals/${p.id}/edit`
    : `/proposals/${p.id}/export`

  async function handleDelete() {
    if (!confirm(`"${p.title}" 제안서를 삭제하시겠습니까?\n슬라이드, 분석 결과가 모두 삭제됩니다.`)) return
    setDeleting(true)
    const res = await fetch(`/api/proposals/${p.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    } else {
      alert('삭제 실패 — 다시 시도해 주세요')
      setDeleting(false)
    }
  }

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
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {generations.length > 0 ? (
              <>
                <span className="text-xs text-gray-400 mr-0.5">안 선택:</span>
                {generations.map((gen, idx) => {
                  const isLatest = idx === generations.length - 1
                  return (
                    <Link
                      key={gen.id}
                      href={`/proposals/${p.id}/edit?gen=${gen.id}`}
                      title={isLatest ? '최근 작업 안' : undefined}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        isLatest
                          ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {gen.gen_number}안
                    </Link>
                  )
                })}
                <Link
                  href={`/proposals/${p.id}/generate`}
                  className="text-xs px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                >
                  + 새 안
                </Link>
              </>
            ) : (
              p.status !== 'draft' && (
                <Link
                  href={`/proposals/${p.id}/generate`}
                  className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                >
                  → AI 슬라이드 생성하기
                </Link>
              )
            )}
          </div>
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
              href={`/proposals/${p.id}/export${latestGen ? `?gen=${latestGen.id}` : ''}`}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              PPTX 다운로드
            </Link>
          )}
          <span className="text-xs text-gray-300">
            {new Date(p.updated_at).toLocaleDateString('ko-KR')}
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
            title="제안서 삭제"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  )
}
