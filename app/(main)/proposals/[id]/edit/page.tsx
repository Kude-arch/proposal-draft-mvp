'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepNav from '@/components/StepNav'
import SlideGrid from '@/components/SlideGrid'
import type { ProposalSlide, SlideCell, ProposalItem, SlideGeneration } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const genParam = searchParams.get('gen')

  const [generations, setGenerations] = useState<SlideGeneration[]>([])
  const [selectedGenId, setSelectedGenId] = useState<string | null>(genParam)
  const [slides, setSlides] = useState<(ProposalSlide & { cells: SlideCell[] })[]>([])
  const [sectionKeywords, setSectionKeywords] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [deletingGenId, setDeletingGenId] = useState<string | null>(null)
  const [cellError, setCellError] = useState('')

  const loadGenerations = useCallback(async () => {
    const res = await fetch(`/api/proposals/${id}/generations`)
    const data: SlideGeneration[] = await res.json()
    setGenerations(data)
    return data
  }, [id])

  const loadSlides = useCallback(async (genId: string | null) => {
    setLoading(true)
    try {
      const genQuery = genId ? `?gen=${genId}` : ''
      const [slidesRes, sectionsRes] = await Promise.all([
        fetch(`/api/proposals/${id}/slides${genQuery}`),
        fetch(`/api/proposals/${id}/sections`),
      ])
      const slidesData = await slidesRes.json()
      const sectionsData = await sectionsRes.json()
      setSlides(Array.isArray(slidesData) ? slidesData : [])
      const kwMap: Record<string, string[]> = {}
      for (const sec of (Array.isArray(sectionsData) ? sectionsData : [])) {
        kwMap[sec.id] = sec.search_keywords ?? []
      }
      setSectionKeywords(kwMap)
    } catch (e) {
      console.error('슬라이드 로드 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [id])

  // 초기 로드: generations 먼저, 그 후 선택된 gen의 슬라이드
  useEffect(() => {
    // Mount-only: id is stable for the lifetime of this page instance.
    // loadGenerations/loadSlides/genParam/router intentionally not in deps —
    // this effect should only run once per page mount.
    loadGenerations().then(gens => {
      if (gens.length === 0) {
        setLoading(false)
        return
      }
      // URL gen 파라미터가 유효하면 사용, 없으면 최신(마지막) gen 선택
      const validGen = genParam && gens.find(g => g.id === genParam) ? genParam : gens[gens.length - 1].id
      setSelectedGenId(validGen)
      loadSlides(validGen)
      // URL에 gen 파라미터 반영
      if (validGen !== genParam) {
        router.replace(`/proposals/${id}/edit?gen=${validGen}`)
      }
    })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function switchGen(genId: string) {
    setSelectedGenId(genId)
    router.replace(`/proposals/${id}/edit?gen=${genId}`)
    await loadSlides(genId)
  }

  async function handleDeleteGen(genId: string, genNumber: number) {
    if (!confirm(`${genNumber}안을 삭제하시겠습니까? 해당 안의 슬라이드가 모두 삭제됩니다.`)) return
    setDeletingGenId(genId)
    const res = await fetch(`/api/proposals/${id}/generations/${genId}`, { method: 'DELETE' })
    if (res.ok) {
      const newGens = generations.filter(g => g.id !== genId)
      setGenerations(newGens)
      if (selectedGenId === genId) {
        if (newGens.length > 0) {
          const nextGen = newGens[newGens.length - 1]
          await switchGen(nextGen.id)
        } else {
          setSelectedGenId(null)
          setSlides([])
          router.replace(`/proposals/${id}/edit`)
        }
      }
    }
    setDeletingGenId(null)
  }

  function handleSlideUpdate(updatedSlide: ProposalSlide & { cells: SlideCell[] }) {
    setSlides(prev => prev.map(s => s.id === updatedSlide.id ? updatedSlide : s))
  }

  async function handleCellUpdate(slideId: string, cellId: string, item: ProposalItem | null) {
    setCellError('')
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
    } else {
      const errData = await res.json().catch(() => ({}))
      setCellError(errData.error ?? '아이템 저장 실패 — 다시 시도하세요')
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'done' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'active' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'pending' as const },
  ]

  const atLimit = generations.length >= 10

  if (loading)
    return <div className="p-8 text-gray-400">슬라이드 불러오는 중...</div>

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-gray-200 flex-shrink-0">
        <StepNav steps={steps} />

        {/* 안 탭 */}
        {generations.length > 0 && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {generations.map(gen => {
              const isSelected = gen.id === selectedGenId
              const isDeleting = deletingGenId === gen.id
              return (
                <div
                  key={gen.id}
                  className={`flex items-center rounded-md border text-xs transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <button
                    onClick={() => switchGen(gen.id)}
                    className={`px-2.5 py-1 font-medium ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}
                  >
                    {gen.gen_number}안
                  </button>
                  <button
                    onClick={() => handleDeleteGen(gen.id, gen.gen_number)}
                    disabled={isDeleting}
                    className="pr-1.5 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                    title={`${gen.gen_number}안 삭제`}
                  >
                    ×
                  </button>
                </div>
              )
            })}
            {atLimit && (
              <span className="text-xs text-amber-600 ml-2">
                최대 10개 도달 — 기존 안을 삭제해야 새로 생성할 수 있습니다
              </span>
            )}
          </div>
        )}

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
              disabled={atLimit}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title={atLimit ? '최대 10개 도달 — 기존 안 삭제 후 생성 가능' : '새 안 생성'}
            >
              재생성
            </button>
            <button
              onClick={() => {
                const genQuery = selectedGenId ? `?gen=${selectedGenId}` : ''
                router.push(`/proposals/${id}/export${genQuery}`)
              }}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              PPTX 내보내기 →
            </button>
          </div>
        </div>
      </div>

      {cellError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center justify-between flex-shrink-0">
          <span>{cellError}</span>
          <button onClick={() => setCellError('')} className="ml-2 text-red-400 hover:text-red-600">×</button>
        </div>
      )}

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
