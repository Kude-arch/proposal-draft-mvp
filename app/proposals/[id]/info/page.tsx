'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import StepNav from '@/components/StepNav'
import CoveragePanel from '@/components/CoveragePanel'

interface Props {
  params: Promise<{ id: string }>
}

export default function InfoPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [proposal, setProposal] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  // 폼 상태
  const [title, setTitle] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const [constructionType, setConstructionType] = useState<string[]>([])
  const [scaleAmount, setScaleAmount] = useState('')
  const [durationMonths, setDurationMonths] = useState('')
  const [specialConditions, setSpecialConditions] = useState('')
  const [drawingMemo, setDrawingMemo] = useState('')

  // 파일 업로드
  const [rfpFile, setRfpFile] = useState<File | null>(null)
  const [auxFiles, setAuxFiles] = useState<File[]>([])

  useEffect(() => {
    fetch(`/api/proposals/${id}`)
      .then(r => r.json())
      .then(data => {
        setProposal(data)
        setTitle(data.title ?? '')
        setClient(data.client ?? '')
        setLocation(data.location ?? '')
        setConstructionType(data.construction_type ?? [])
        setScaleAmount(data.scale_amount ? String(data.scale_amount) : '')
        setDurationMonths(data.duration_months ? String(data.duration_months) : '')
        setSpecialConditions(data.special_conditions ?? '')
        setDrawingMemo(data.drawing_review_raw ?? '')
        setLoading(false)
      })
  }, [id])

  const ai_analysis = proposal.ai_analysis as Record<string, unknown> | undefined
  const sectionPlans = (ai_analysis?.section_plans as Array<{
    section_title: string
    coverage_score?: number
    coverage_hint?: string | null
  }> | undefined)

  const sourceStatus = {
    rfp_uploaded: !!(rfpFile || (ai_analysis?.rfp_keywords)),
    drawing_memo: drawingMemo.length > 10,
    pptx_uploaded: auxFiles.some(f => f.name.endsWith('.pptx')),
  }

  async function handleParseRfp() {
    if (!rfpFile) return
    setParsing(true)
    setParseError('')
    try {
      const form = new FormData()
      form.append('files', rfpFile)
      for (const f of auxFiles) form.append('files', f)
      if (drawingMemo) form.append('drawing_memo', drawingMemo)

      const res = await fetch('/api/parse-rfp', { method: 'POST', body: form })
      const parsed = await res.json()
      if (!res.ok) throw new Error(parsed.error ?? 'RFP 파싱 실패')

      // 폼에 자동 채우기
      if (parsed.form_fields) {
        const ff = parsed.form_fields
        if (ff.title) setTitle(ff.title)
        if (ff.client) setClient(ff.client)
        if (ff.location) setLocation(ff.location)
        if (ff.construction_type?.length) setConstructionType(ff.construction_type)
        if (ff.scale_amount) setScaleAmount(String(ff.scale_amount))
        if (ff.duration_months) setDurationMonths(String(ff.duration_months))
        if (ff.special_conditions) setSpecialConditions(ff.special_conditions)
      }

      // ai_analysis 저장
      await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_analysis: {
            rfp_keywords: parsed.rfp_keywords,
            sections: parsed.sections,
            drawing_notes: parsed.drawing_notes,
            target_slides: 20,
          },
          drawing_review_raw: drawingMemo,
          title: parsed.form_fields?.title ?? title,
          client: parsed.form_fields?.client ?? client,
          location: parsed.form_fields?.location ?? location,
          construction_type: parsed.form_fields?.construction_type ?? constructionType,
          scale_amount: parsed.form_fields?.scale_amount,
          duration_months: parsed.form_fields?.duration_months,
          special_conditions: parsed.form_fields?.special_conditions ?? specialConditions,
        }),
      })
      const updated = await fetch(`/api/proposals/${id}`).then(r => r.json())
      setProposal(updated)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          client,
          location,
          construction_type: constructionType,
          scale_amount: scaleAmount ? Number(scaleAmount) : null,
          duration_months: durationMonths ? Number(durationMonths) : null,
          special_conditions: specialConditions,
          drawing_review_raw: drawingMemo,
        }),
      })
      router.push(`/proposals/${id}/toc`)
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'active' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'pending' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'pending' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'pending' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'pending' as const },
  ]

  if (loading) return <div className="p-8 text-gray-400">불러오는 중...</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <div className="flex gap-6">
        {/* 좌측 폼 */}
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800 mb-6">기본 정보 입력</h1>

          {/* RFP 파일 업로드 */}
          <div className="mb-6 p-4 border border-dashed border-blue-300 rounded-lg bg-blue-50">
            <p className="text-sm font-medium text-blue-700 mb-2">
              RFP 문서 자동 파싱 <span className="text-xs font-normal text-blue-500">(HWPX, PDF, XLSX)</span>
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="file"
                accept=".hwpx,.pdf,.xlsx,.xls"
                onChange={e => setRfpFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-white file:text-blue-600 file:text-xs"
              />
              <button
                onClick={handleParseRfp}
                disabled={!rfpFile || parsing}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {parsing ? '분석 중...' : 'AI 자동 입력'}
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept=".pptx,.xlsx"
                multiple
                onChange={e => setAuxFiles(Array.from(e.target.files ?? []))}
                className="flex-1 text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white file:text-gray-500 file:text-xs"
              />
              <span className="text-xs text-gray-400">보조 파일 (선택)</span>
            </div>
            {parseError && (
              <p className="text-xs text-red-600 mt-2 bg-red-50 px-2 py-1 rounded">{parseError}</p>
            )}
            {rfpFile && !parsing && !!ai_analysis?.rfp_keywords && (
              <p className="text-xs text-green-600 mt-2">RFP 파싱 완료 — 아래 항목을 확인하세요</p>
            )}
          </div>

          {/* 기본 정보 폼 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                용역명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">발주처</label>
                <input
                  type="text"
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사업 위치</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">공사금액 (원)</label>
                <input
                  type="number"
                  value={scaleAmount}
                  onChange={e => setScaleAmount(e.target.value)}
                  placeholder="예) 5000000000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">과업기간 (개월)</label>
                <input
                  type="number"
                  value={durationMonths}
                  onChange={e => setDurationMonths(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">공종</label>
              <div className="flex gap-2 flex-wrap">
                {['건축', '토목', '전기', '기계', '소방', '통신'].map(type => (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={constructionType.includes(type)}
                      onChange={e => {
                        if (e.target.checked) {
                          setConstructionType([...constructionType, type])
                        } else {
                          setConstructionType(constructionType.filter(t => t !== type))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">특이사항</label>
              <textarea
                value={specialConditions}
                onChange={e => setSpecialConditions(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                도면 검토 메모
                <span className="text-xs font-normal text-gray-400 ml-1">(자유 서술 — AI가 핵심 내용 정리)</span>
              </label>
              <textarea
                value={drawingMemo}
                onChange={e => setDrawingMemo(e.target.value)}
                rows={4}
                placeholder="예) 지하 2층 필로티 구조, NATM 터널 구간 있음, 연약지반 구간 pile 기초 계획 등..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '다음: 목차 구성 →'}
            </button>
          </div>
        </div>

        {/* 우측 커버리지 패널 */}
        <div className="w-64 flex-shrink-0">
          <CoveragePanel
            sourceStatus={sourceStatus}
            sectionPlans={sectionPlans}
          />
        </div>
      </div>
    </div>
  )
}
