'use client'

import { useState } from 'react'
import type { ProposalSlide, SlideCell } from '@/types'
import Image from 'next/image'
import ItemPanel from './ItemPanel'
import type { ProposalItem } from '@/types'

interface SlideGridProps {
  slides: (ProposalSlide & { cells: SlideCell[] })[]
  onCellUpdate: (slideId: string, cellId: string, item: ProposalItem | null) => void
  sectionKeywords: Record<string, string[]> // section_id -> keywords
}

export default function SlideGrid({ slides, onCellUpdate, sectionKeywords }: SlideGridProps) {
  const [activeCell, setActiveCell] = useState<{
    slideId: string
    cellId: string
    sectionId: string
    sectionTitle: string
  } | null>(null)

  function handleCellClick(
    slideId: string,
    cellId: string,
    sectionId: string,
    sectionTitle: string
  ) {
    setActiveCell({ slideId, cellId, sectionId, sectionTitle })
  }

  function handleItemSelect(item: ProposalItem) {
    if (!activeCell) return
    onCellUpdate(activeCell.slideId, activeCell.cellId, item)
    setActiveCell(null)
  }

  // 섹션별로 그룹화
  const grouped: Record<string, (ProposalSlide & { cells: SlideCell[] })[]> = {}
  for (const slide of slides) {
    const key = slide.section_id ?? 'no-section'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(slide)
  }

  return (
    <div className="flex gap-4 h-full">
      {/* 슬라이드 그리드 (좌측) */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([sectionId, sectionSlides]) => (
          <div key={sectionId} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 sticky top-0 bg-white py-1 border-b border-gray-100">
              {sectionSlides[0]?.slide_title?.replace(/ \(\d+\/\d+\)$/, '') ?? '섹션'}
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {sectionSlides.map(slide => (
                <div
                  key={slide.id}
                  className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
                >
                  {/* 슬라이드 미니 헤더 */}
                  <div className="bg-slate-700 text-white text-xs px-2 py-1 flex justify-between">
                    <span className="truncate">
                      {slide.slide_title}
                    </span>
                    <span className="text-slate-300 ml-1">#{slide.slide_number}</span>
                  </div>

                  {/* 셀들 */}
                  <div className="flex gap-1 p-1.5">
                    {(slide.cells ?? [])
                      .sort((a, b) => a.cell_index - b.cell_index)
                      .map(cell => {
                        const isActive =
                          activeCell?.cellId === cell.id
                        return (
                          <div
                            key={cell.id}
                            onClick={() =>
                              handleCellClick(
                                slide.id,
                                cell.id,
                                sectionId,
                                slide.slide_title ?? ''
                              )
                            }
                            className={[
                              'flex-1 aspect-[3/4] rounded border cursor-pointer transition-all relative overflow-hidden',
                              isActive
                                ? 'border-blue-500 ring-2 ring-blue-300'
                                : 'border-gray-200 hover:border-blue-300',
                            ].join(' ')}
                          >
                            {cell.image_url ? (
                              <>
                                <Image
                                  src={cell.image_url}
                                  alt={cell.item_title ?? ''}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] p-1 line-clamp-2">
                                  {cell.item_title}
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300">
                                <span className="text-lg">+</span>
                                <span className="text-[9px]">아이템 배정</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 아이템 패널 (우측) */}
      {activeCell && (
        <div className="w-72 flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-md">
          <div className="bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">아이템 선택</span>
            <button
              onClick={() => setActiveCell(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="h-[calc(100%-3rem)]">
            <ItemPanel
              sectionTitle={activeCell.sectionTitle}
              tierBKeywords={sectionKeywords[activeCell.sectionId] ?? []}
              onSelect={handleItemSelect}
            />
          </div>
        </div>
      )}
    </div>
  )
}
