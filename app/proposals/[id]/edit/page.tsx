'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import StepNav from '@/components/StepNav'
import SlideGrid from '@/components/SlideGrid'
import type { ProposalSlide, SlideCell, ProposalItem } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [slides, setSlides] = useState<(ProposalSlide & { cells: SlideCell[] })[]>([])
  const [sectionKeywords, setSectionKeywords] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const loadSlides = useCallback(async () => {
    const [slidesRes, sectionsRes] = await Promise.all([
      fetch(`/api/proposals/${id}/slides`),
      fetch(`/api/proposals/${id}/sections`),
    ])
    const slidesData = await slidesRes.json()
    const sectionsData = await sectionsRes.json()

    setSlides(slidesData ?? [])

    // 섹션 키워드 매핑
    const kwMap: Record<string, string[]> = {}
    for (const sec of sectionsData ?? []) {
      kwMap[sec.id] = sec.search_keywords ?? []
    }
    setSectionKeywords(kwMap)
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadSlides()
  }, [loadSlides])

  function handleSlideUpdate(updatedSlide: ProposalSlide & { cells: SlideCell[] }) {
    setSlides(prev => prev.map(s => s.id === updatedSlide.id ? updatedSlide : s))
  }

  async function handleCellUpdate(slideId: string, cellId: string, item: ProposalItem | null) {
    const res = await fetch(`/api/slides/${slideId}/cells/${cellId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        db_item_id: item?.id ?? null,
        image_url: item?.image_url ?? null,
        item_title: item?.title ?? null,
      }),
    })
    if (res.ok) {
      // 해당 슬라이드의 셀 업데이트
      setSlides(prev =>
        prev.map(slide => {
          if (slide.id !== slideId) return slide
          return {
            ...slide,
            cells: slide.cells.map(cell =>
              cell.id === cellId
                ? {
                    ...cell,
                    db_item_id: item?.id ?? null,
                    image_url: item?.image_url ?? null,
                    item_title: item?.title ?? null,
                  }
                : cell
            ),
          }
        })
      )
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'done' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'active' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'pending' as const },
  ]

  if (loading)
    return (
      <div className="p-8 text-gray-400">슬라이드 불러오는 중...</div>
    )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-gray-200 flex-shrink-0">
        <StepNav steps={steps} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">슬라이드 편집</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              셀을 클릭하여 아이템을 교체하세요 ({slides.length}개 슬라이드)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/proposals/${id}/generate`)}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
            >
              재생성
            </button>
            <button
              onClick={() => router.push(`/proposals/${id}/export`)}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              PPTX 내보내기 →
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 py-3">
        {slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg mb-2">슬라이드가 없습니다</p>
            <button
              onClick={() => router.push(`/proposals/${id}/generate`)}
              className="text-blue-500 text-sm underline"
            >
              AI 생성으로 이동
            </button>
          </div>
        ) : (
          <SlideGrid
            slides={slides}
            onCellUpdate={handleCellUpdate}
            onSlideUpdate={handleSlideUpdate}
            sectionKeywords={sectionKeywords}
          />
        )}
      </div>
    </div>
  )
}
