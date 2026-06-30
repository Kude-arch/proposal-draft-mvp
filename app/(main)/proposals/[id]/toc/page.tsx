'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import StepNav from '@/components/StepNav'
import type { SlideSize, SlidePreset } from '@/types'

interface Section {
  id?: string
  title: string
  order_index: number
  slide_count?: number
}

interface Props {
  params: Promise<{ id: string }>
}

export default function TocPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [slideSize, setSlideSize] = useState<SlideSize>({ preset: 'A4L', width_mm: 297, height_mm: 210 })
  const [newTitle, setNewTitle] = useState('')
  const [aiSections, setAiSections] = useState<string[]>([])
  const [genCount, setGenCount] = useState<number>(0)

  useEffect(() => {
    async function load() {
      const [propRes, secRes, genRes] = await Promise.all([
        fetch(`/api/proposals/${id}`),
        fetch(`/api/proposals/${id}/sections`),
        fetch(`/api/proposals/${id}/generations`),
      ])
      const prop = await propRes.json()
      if (prop.slide_size) setSlideSize(prop.slide_size)
      const secs = await secRes.json()
      const gens = await genRes.json().catch(() => [])
      setGenCount(Array.isArray(gens) ? gens.length : 0)

      // AI 추천 목차 (Pass0에서 추출)
      const suggested = prop.ai_analysis?.sections ?? []
      setAiSections(suggested)

      if (secs.length > 0) {
        setSections(secs)
      } else if (suggested.length > 0) {
        // AI 추천 목차를 기본 섹션으로 적용
        setSections(
          suggested.map((title: string, i: number) => ({
            title,
            order_index: i,
            slide_count: 2,
          }))
        )
      }
      setLoading(false)
    }
    load()
  }, [id])

  function addSection() {
    if (!newTitle.trim()) return
    setSections(prev => [
      ...prev,
      { title: newTitle.trim(), order_index: prev.length, slide_count: 2 },
    ])
    setNewTitle('')
  }

  function removeSection(idx: number) {
    setSections(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order_index: i })))
  }

  function moveSection(idx: number, direction: 'up' | 'down') {
    const next = [...sections]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    setSections(next.map((s, i) => ({ ...s, order_index: i })))
  }

  function applyAiSuggestions() {
    setSections(
      aiSections.map((title, i) => ({
        title,
        order_index: i,
        slide_count: 2,
      }))
    )
  }

  async function handleSave() {
    if (!sections.length) return
    if (genCount > 0) {
      const ok = confirm(
        `이미 ${genCount}개의 안(案)이 생성되어 있습니다.\n목차를 변경하면 기존 슬라이드의 섹션 분류가 맞지 않을 수 있습니다.\n계속 저장하시겠습니까?`
      )
      if (!ok) return
    }
    setSaving(true)
    setSaveError('')
    try {
      await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_size: slideSize }),
      })
      const res = await fetch(`/api/proposals/${id}/sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sections),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '저장 실패')
      }
      router.push(`/proposals/${id}/generate`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const s = (has: boolean) => (has ? 'done' as const : 'pending' as const)
  const hasSlides = genCount > 0
  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'active' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: s(hasSlides) },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: s(hasSlides) },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: s(hasSlides) },
  ]

  if (loading) return <div className="p-8 text-gray-400">불러오는 중...</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <h1 className="text-xl font-bold text-gray-800 mb-2">목차 구성</h1>
      <p className="text-sm text-gray-500 mb-6">
        발주처 요구 목차를 구성하세요. RFP에서 자동 추출된 목차를 확인하고 수정하세요.
      </p>

      {/* AI 추천 목차 */}
      {aiSections.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-blue-700">AI 추천 목차 ({aiSections.length}개)</p>
            <button
              onClick={applyAiSuggestions}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              전체 적용
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {aiSections.map((sec, i) => (
              <span
                key={i}
                onClick={() => {
                  if (!sections.find(s => s.title === sec)) {
                    setSections(prev => [
                      ...prev,
                      { title: sec, order_index: prev.length, slide_count: 2 },
                    ])
                  }
                }}
                className="text-xs px-2 py-1 bg-white border border-blue-200 text-blue-600 rounded cursor-pointer hover:bg-blue-100"
              >
                + {sec}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 섹션 목록 */}
      <div className="space-y-2 mb-4">
        {sections.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
            목차 항목을 추가하거나 AI 추천 목차를 적용하세요
          </div>
        )}
        {sections.map((sec, i) => (
          <div
            key={i}
            className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <span className="text-sm text-gray-400 w-6 text-center">{i + 1}</span>
            <input
              type="text"
              value={sec.title}
              onChange={e => {
                const next = [...sections]
                next[i] = { ...next[i], title: e.target.value }
                setSections(next)
              }}
              className="flex-1 text-sm border-0 focus:outline-none focus:bg-gray-50 px-1 py-0.5 rounded"
            />
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-400">슬라이드</label>
              <input
                type="number"
                min={1}
                max={10}
                value={sec.slide_count ?? 2}
                onChange={e => {
                  const next = [...sections]
                  next[i] = { ...next[i], slide_count: Number(e.target.value) }
                  setSections(next)
                }}
                className="w-12 text-sm border border-gray-200 rounded px-1 py-0.5 text-center"
              />
            </div>
            <div className="flex gap-0.5">
              <button
                onClick={() => moveSection(i, 'up')}
                disabled={i === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                title="위로"
              >
                ▲
              </button>
              <button
                onClick={() => moveSection(i, 'down')}
                disabled={i === sections.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                title="아래로"
              >
                ▼
              </button>
              <button
                onClick={() => removeSection(i)}
                className="p-1 text-red-400 hover:text-red-600 text-xs"
                title="삭제"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 섹션 추가 */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSection()}
          placeholder="새 목차 항목 추가"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={addSection}
          disabled={!newTitle.trim()}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          추가
        </button>
      </div>

      {/* 슬라이드 규격 선택 */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">슬라이드 규격</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { preset: 'A4P' as SlidePreset, label: 'A4 세로', width_mm: 210, height_mm: 297 },
            { preset: 'A4L' as SlidePreset, label: 'A4 가로', width_mm: 297, height_mm: 210 },
            { preset: 'A3P' as SlidePreset, label: 'A3 세로', width_mm: 297, height_mm: 420 },
            { preset: 'A3L' as SlidePreset, label: 'A3 가로', width_mm: 420, height_mm: 297 },
          ]).map(opt => (
            <button
              key={opt.preset}
              onClick={() => setSlideSize({ preset: opt.preset, width_mm: opt.width_mm, height_mm: opt.height_mm })}
              className={[
                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                slideSize.preset === opt.preset
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400',
              ].join(' ')}
            >
              {opt.label}
              <span className="ml-1 text-xs opacity-70">{opt.width_mm}×{opt.height_mm}</span>
            </button>
          ))}
          <button
            onClick={() => setSlideSize(prev => ({ ...prev, preset: 'custom' }))}
            className={[
              'px-3 py-1.5 rounded-lg text-sm border transition-colors',
              slideSize.preset === 'custom'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400',
            ].join(' ')}
          >
            Custom
          </button>
        </div>
        {slideSize.preset === 'custom' && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">W (mm)</label>
            <input
              type="number"
              min={100}
              max={841}
              value={slideSize.width_mm}
              onChange={e => setSlideSize(prev => ({ ...prev, width_mm: Number(e.target.value) }))}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
            />
            <span className="text-gray-400">×</span>
            <label className="text-xs text-gray-500">H (mm)</label>
            <input
              type="number"
              min={100}
              max={1189}
              value={slideSize.height_mm}
              onChange={e => setSlideSize(prev => ({ ...prev, height_mm: Number(e.target.value) }))}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
            />
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          현재: {slideSize.width_mm}×{slideSize.height_mm}mm
        </p>
      </div>

      {saveError && (
        <p className="mb-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
          {saveError}
        </p>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => router.push(`/proposals/${id}/info`)}
          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
        >
          ← 이전
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !sections.length}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '다음: AI 생성 →'}
        </button>
      </div>
    </div>
  )
}
