'use client'

import { useState } from 'react'
import type { ProposalItem } from '@/types'
import Image from 'next/image'

interface ItemPanelProps {
  sectionTitle: string
  tierBKeywords: string[]
  onSelect: (item: ProposalItem) => void
}

export default function ItemPanel({ sectionTitle, tierBKeywords, onSelect }: ItemPanelProps) {
  const [items, setItems] = useState<(ProposalItem & { score: number })[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [query, setQuery] = useState('')

  async function search(keywords?: string[]) {
    setLoading(true)
    try {
      const kws = keywords ?? (query ? [query] : tierBKeywords)
      const res = await fetch('/api/search-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier_b_keywords: kws, limit: 30 }),
      })
      const data = await res.json()
      setItems(data)
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-gray-200">
        <p className="text-xs text-gray-500 mb-1 font-medium">{sectionTitle}</p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="키워드 검색"
            className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={() => search()}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '...' : '검색'}
          </button>
        </div>
        {tierBKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tierBKeywords.slice(0, 5).map((kw, i) => (
              <button
                key={i}
                onClick={() => search([kw])}
                className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 border border-blue-100"
              >
                {kw}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
            <p>키워드를 입력하거나</p>
            <p>태그를 클릭하여 검색하세요</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            검색 중...
          </div>
        )}
        {searched && !loading && items.length === 0 && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            검색 결과가 없습니다
          </div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className="flex gap-2 p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100"
          >
            <div className="relative w-16 h-12 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                  없음
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 line-clamp-2">{item.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.section_big ?? ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
