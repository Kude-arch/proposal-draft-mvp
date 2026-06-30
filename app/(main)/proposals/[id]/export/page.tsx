'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepNav from '@/components/StepNav'
import type { SlideGeneration } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function ExportPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const genParam = searchParams.get('gen')

  const [proposal, setProposal] = useState<Record<string, unknown>>({})
  const [slideCount, setSlideCount] = useState(0)
  const [currentGen, setCurrentGen] = useState<SlideGeneration | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    async function load() {
      const genQuery = genParam ? `?gen=${genParam}` : ''
      const [propRes, slidesRes, gensRes] = await Promise.all([
        fetch(`/api/proposals/${id}`),
        fetch(`/api/proposals/${id}/slides${genQuery}`),
        fetch(`/api/proposals/${id}/generations`),
      ])
      const prop = await propRes.json()
      const sls = await slidesRes.json()
      const gens: SlideGeneration[] = await gensRes.json()

      setProposal(prop)
      setSlideCount((sls ?? []).length)

      if (genParam) {
        setCurrentGen(gens.find(g => g.id === genParam) ?? null)
      } else if (gens.length > 0) {
        setCurrentGen(gens[gens.length - 1])
      }
      setLoading(false)
    }
    load()
  }, [id, genParam])

  async function handleExport() {
    setExporting(true)
    setExportError('')
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_id: id,
          generation_id: currentGen?.id ?? null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'PPTX 생성 실패')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''(.+)/)
      a.download = match ? decodeURIComponent(match[1]) : `${proposal.title}_제안서.pptx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setExporting(false)
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'done' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'done' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'active' as const },
  ]

  if (loading) return <div className="p-8 text-gray-400">불러오는 중...</div>

  const ai_analysis = proposal.ai_analysis as Record<string, unknown> | undefined

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-bold text-gray-800">PPTX 내보내기</h1>
        {currentGen && (
          <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {currentGen.gen_number}안
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-8">
        완성된 슬라이드를 PPTX 파일로 내보냅니다.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border border-gray-200 rounded-lg p-4 text-center bg-white">
          <p className="text-2xl font-bold text-blue-600">{slideCount}</p>
          <p className="text-xs text-gray-500 mt-1">슬라이드</p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 text-center bg-white">
          <p className="text-2xl font-bold text-blue-600">
            {(ai_analysis?.section_plans as unknown[])?.length ?? '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">섹션</p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4 text-center bg-white">
          <p className="text-lg font-bold text-blue-600 truncate">
            {(proposal.construction_type as string[] | undefined)?.join('/') ?? '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">공종</p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 mb-8 bg-gray-50 space-y-2">
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 w-20">용역명</span>
          <span className="text-sm text-gray-800 font-medium">{proposal.title as string}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 w-20">발주처</span>
          <span className="text-sm text-gray-700">{(proposal.client as string) ?? '-'}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 w-20">위치</span>
          <span className="text-sm text-gray-700">{(proposal.location as string) ?? '-'}</span>
        </div>
        {(proposal.scale_amount as number) && (
          <div className="flex gap-2">
            <span className="text-xs text-gray-500 w-20">공사금액</span>
            <span className="text-sm text-gray-700">
              {((proposal.scale_amount as number) / 1e8).toFixed(0)}억원
            </span>
          </div>
        )}
      </div>

      {exportError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {exportError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => {
            const genQuery = currentGen ? `?gen=${currentGen.id}` : ''
            router.push(`/proposals/${id}/edit${genQuery}`)
          }}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
        >
          ← 편집으로 돌아가기
        </button>
        <button
          onClick={handleExport}
          disabled={exporting || slideCount === 0}
          className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {exporting ? (
            <>
              <span className="animate-spin">⏳</span>
              PPTX 생성 중...
            </>
          ) : (
            `📥 ${currentGen ? `${currentGen.gen_number}안 ` : ''}PPTX 다운로드`
          )}
        </button>
      </div>

      {slideCount === 0 && (
        <p className="text-xs text-amber-600 mt-2 text-center">
          슬라이드가 없습니다.{' '}
          <a href={`/proposals/${id}/generate`} className="underline">
            AI 생성 먼저 실행
          </a>
          하세요.
        </p>
      )}
    </div>
  )
}
