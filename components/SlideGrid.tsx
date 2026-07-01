'use client'

import { useState, useRef } from 'react'
import type { ProposalSlide, SlideCell } from '@/types'
import Image from 'next/image'
import ItemPanel from './ItemPanel'
import type { ProposalItem } from '@/types'

const LAYOUT_OPTIONS = [
  { label: '1×1', value: '1x1', cols: 1, rows: 1 },
  { label: '2×1', value: '2x1', cols: 2, rows: 1 },
  { label: '1×2', value: '1x2', cols: 1, rows: 2 },
  { label: '2×2', value: '2x2', cols: 2, rows: 2 },
  { label: '3×1', value: '3x1', cols: 3, rows: 1 },
  { label: '3×2', value: '3x2', cols: 3, rows: 2 },
  { label: '3×3', value: '3x3', cols: 3, rows: 3 },
  { label: '4×1', value: '4x1', cols: 4, rows: 1 },
  { label: '4×2', value: '4x2', cols: 4, rows: 2 },
  { label: '4×3', value: '4x3', cols: 4, rows: 3 },
]

interface SlideGridProps {
  slides: (ProposalSlide & { cells: SlideCell[] })[]
  onCellUpdate: (slideId: string, cellId: string, item: ProposalItem | null) => void
  onSlideUpdate: (updatedSlide: ProposalSlide & { cells: SlideCell[] }) => void
  sectionKeywords: Record<string, string[]>
}

export default function SlideGrid({
  slides,
  onCellUpdate,
  onSlideUpdate,
  sectionKeywords,
}: SlideGridProps) {
  const [activeCell, setActiveCell] = useState<{
    slideId: string
    cellId: string
    sectionId: string
    sectionTitle: string
  } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Record<string, Set<string>>>({})
  const [mergingSlide, setMergingSlide] = useState<string | null>(null)
  const [editingTitleSlideId, setEditingTitleSlideId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  function getSelected(slideId: string): Set<string> {
    return selectedCells[slideId] ?? new Set()
  }

  function toggleCellSelect(slideId: string, cellId: string) {
    setSelectedCells(prev => {
      const set = new Set(prev[slideId] ?? [])
      if (set.has(cellId)) {
        set.delete(cellId)
      } else {
        set.add(cellId)
      }
      return { ...prev, [slideId]: set }
    })
  }

  function clearSelected(slideId: string) {
    setSelectedCells(prev => ({ ...prev, [slideId]: new Set() }))
  }

  function handleCellClick(
    slideId: string,
    cellId: string,
    sectionId: string,
    sectionTitle: string,
    isMergeMode: boolean
  ) {
    if (isMergeMode) {
      toggleCellSelect(slideId, cellId)
    } else {
      setActiveCell({ slideId, cellId, sectionId, sectionTitle })
    }
  }

  function handleItemSelect(item: ProposalItem) {
    if (!activeCell) return
    onCellUpdate(activeCell.slideId, activeCell.cellId, item)
    setActiveCell(null)
  }

  function startEditTitle(slideId: string, currentTitle: string) {
    setEditingTitleSlideId(slideId)
    setTitleDraft(currentTitle)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  async function commitTitle(slideId: string) {
    if (editingTitleSlideId !== slideId) return
    setEditingTitleSlideId(null)
    const res = await fetch(`/api/slides/${slideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slide_title: titleDraft }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
    }
  }

  async function handleLayoutChange(slideId: string, cols: number, rows: number) {
    const res = await fetch(`/api/slides/${slideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
      clearSelected(slideId)
    }
  }

  async function handleMerge(slideId: string) {
    const ids = Array.from(getSelected(slideId))
    if (ids.length < 2) return
    const res = await fetch(`/api/slides/${slideId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell_ids: ids }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
      clearSelected(slideId)
      setMergingSlide(null)
    } else {
      const err = await res.json()
      alert(err.error ?? '병합 실패')
    }
  }

  async function handleSplit(slideId: string) {
    const ids = Array.from(getSelected(slideId))
    if (ids.length !== 1) return
    const res = await fetch(`/api/slides/${slideId}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell_id: ids[0] }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSlideUpdate(updated)
      clearSelected(slideId)
      setMergingSlide(null)
    } else {
      const err = await res.json()
      alert(err.error ?? '분할 실패')
    }
  }

  const grouped: Record<string, (ProposalSlide & { cells: SlideCell[] })[]> = {}
  for (const slide of slides) {
    const key = slide.section_id ?? 'no-section'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(slide)
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([sectionId, sectionSlides]) => (
          <div key={sectionId} className="mb-8">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 sticky top-0 bg-white py-1 border-b border-gray-100 z-10">
              {sectionSlides[0]?.slide_title?.replace(/ \(\d+\/\d+\)$/, '') ?? '섹션'}
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {sectionSlides.map(slide => {
                const cols = slide.cols ?? 2
                const rows = slide.rows ?? 1
                const isMerge = mergingSlide === slide.id
                const selected = getSelected(slide.id)

                return (
                  <div
                    key={slide.id}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
                  >
                    <div className="bg-slate-700 text-white text-xs px-2 py-1 flex justify-between items-center">
                      {editingTitleSlideId === slide.id ? (
                        <input
                          ref={titleInputRef}
                          value={titleDraft}
                          onChange={e => setTitleDraft(e.target.value)}
                          onBlur={() => commitTitle(slide.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitTitle(slide.id)
                            if (e.key === 'Escape') setEditingTitleSlideId(null)
                          }}
                          className="flex-1 bg-slate-600 text-white text-xs px-1 rounded outline-none min-w-0"
                        />
                      ) : (
                        <span
                          className="truncate cursor-text hover:underline"
                          title="클릭하여 제목 수정"
                          onClick={() => startEditTitle(slide.id, slide.slide_title ?? '')}
                        >
                          {slide.slide_title}
                        </span>
                      )}
                      <span className="text-slate-300 ml-1 flex-shrink-0">#{slide.slide_number}</span>
                    </div>

                    <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-50 border-b border-gray-100 flex-wrap">
                      <select
                        value={`${cols}x${rows}`}
                        onChange={e => {
                          const opt = LAYOUT_OPTIONS.find(o => o.value === e.target.value)
                          if (opt) handleLayoutChange(slide.id, opt.cols, opt.rows)
                        }}
                        className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600"
                      >
                        {LAYOUT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => {
                          if (isMerge) {
                            setMergingSlide(null)
                            clearSelected(slide.id)
                          } else {
                            setMergingSlide(slide.id)
                            setActiveCell(null)
                          }
                        }}
                        className={[
                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          isMerge
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-orange-400',
                        ].join(' ')}
                      >
                        {isMerge ? '취소' : '선택'}
                      </button>

                      {isMerge && selected.size >= 2 && (
                        <button
                          onClick={() => handleMerge(slide.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-500 text-white border-blue-500"
                        >
                          병합
                        </button>
                      )}

                      {isMerge && selected.size === 1 && (() => {
                        const cellId = Array.from(selected)[0]
                        const cell = slide.cells?.find(c => c.id === cellId)
                        return cell && (cell.col_span > 1 || cell.row_span > 1)
                      })() && (
                        <button
                          onClick={() => handleSplit(slide.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500 text-white border-purple-500"
                        >
                          분할
                        </button>
                      )}
                    </div>

                    <div
                      className="p-1.5"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                        gap: '3px',
                        aspectRatio: `${cols} / ${rows}`,
                      }}
                    >
                      {(slide.cells ?? [])
                        .sort((a, b) => a.cell_index - b.cell_index)
                        .map(cell => {
                          const isActiveItem = activeCell?.cellId === cell.id
                          const isSelected = selected.has(cell.id)

                          return (
                            <div
                              key={cell.id}
                              onClick={() =>
                                handleCellClick(
                                  slide.id,
                                  cell.id,
                                  sectionId,
                                  slide.slide_title ?? '',
                                  isMerge
                                )
                              }
                              style={{
                                gridColumn: `${cell.col_start} / span ${cell.col_span}`,
                                gridRow: `${cell.row_start} / span ${cell.row_span}`,
                              }}
                              className={[
                                'rounded border cursor-pointer transition-all relative overflow-hidden min-h-[40px]',
                                isSelected
                                  ? 'border-orange-500 ring-2 ring-orange-300'
                                  : isActiveItem
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
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] p-0.5 line-clamp-2">
                                    {cell.item_title}
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300">
                                  <span className="text-base">+</span>
                                  <span className="text-[8px]">배정</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

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
