'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import StepNav from '@/components/StepNav'
import CoveragePanel from '@/components/CoveragePanel'
import MembersPanel from '../MembersPanel'

interface Props {
  params: Promise<{ id: string }>
}

const ACCEPTED_EXTS = ['.hwpx', '.hwp', '.pdf', '.xlsx', '.xls', '.pptx']
const MAX_FILE_MB = 50
const MAX_TOTAL_MB = 200
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024

function getFileTypeBadge(name: string): { label: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'hwpx' || ext === 'pdf') return { label: 'RFP', color: 'bg-blue-100 text-blue-700' }
  if (ext === 'hwp') return { label: 'HWP', color: 'bg-orange-100 text-orange-600' }
  if (ext === 'pptx') return { label: 'PPT', color: 'bg-purple-100 text-purple-700' }
  if (ext === 'xlsx' || ext === 'xls') return { label: 'XLS', color: 'bg-green-100 text-green-700' }
  return { label: ext.toUpperCase(), color: 'bg-gray-100 text-gray-600' }
}

function formatBytes(b: number) {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / 1024 / 1024).toFixed(1)}MB`
}

export default function InfoPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [proposal, setProposal] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // 폼 상태
  const [title, setTitle] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const [constructionType, setConstructionType] = useState<string[]>([])
  const [scaleAmount, setScaleAmount] = useState('')
  const [durationMonths, setDurationMonths] = useState('')
  const [specialConditions, setSpecialConditions] = useState('')
  const [drawingMemo, setDrawingMemo] = useState('')

  // 통합 파일 목록
  const [allFiles, setAllFiles] = useState<File[]>([])
  const [genCount, setGenCount] = useState<number>(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/proposals/${id}`).then(r => r.json()),
      fetch(`/api/proposals/${id}/generations`).then(r => r.json()).catch(() => []),
    ]).then(([data, gens]) => {
      setProposal(data)
      setTitle(data.title ?? '')
      setClient(data.client ?? '')
      setLocation(data.location ?? '')
      setConstructionType(data.construction_type ?? [])
      setScaleAmount(data.scale_amount ? String(data.scale_amount) : '')
      setDurationMonths(data.duration_months ? String(data.duration_months) : '')
      setSpecialConditions(data.special_conditions ?? '')
      setDrawingMemo(data.drawing_review_raw ?? '')
      setGenCount(Array.isArray(gens) ? gens.length : 0)
      setLoading(false)
    })
  }, [id])

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter(f => {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
      return ACCEPTED_EXTS.includes(ext)
    })
    setAllFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...valid.filter(f => !names.has(f.name))]
    })
  }, [])

  function removeFile(name: string) {
    setAllFiles(prev => prev.filter(f => f.name !== name))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files: File[] = []
    if (e.dataTransfer.items) {
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
    } else {
      files.push(...Array.from(e.dataTransfer.files))
    }
    addFiles(files)
  }

  const ai_analysis = proposal.ai_analysis as Record<string, unknown> | undefined
  const sectionPlans = (ai_analysis?.section_plans as Array<{
    section_title: string
    coverage_score?: number
    coverage_hint?: string | null
  }> | undefined)

  // 크기 초과 파일 구분
  const oversizedFiles = new Set(allFiles.filter(f => f.size > MAX_FILE_BYTES).map(f => f.name))
  const uploadableFiles = allFiles.filter(f => !oversizedFiles.has(f.name))
  const totalBytes = uploadableFiles.reduce((s, f) => s + f.size, 0)
  const totalExceeded = totalBytes > MAX_TOTAL_BYTES

  const rfpFile = uploadableFiles.find(f => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    return ext === 'hwpx' || ext === 'pdf' || ext === 'xlsx' || ext === 'xls'
  })

  const sourceStatus = {
    rfp_uploaded: !!(rfpFile || ai_analysis?.rfp_keywords),
    drawing_memo: drawingMemo.length > 10,
    pptx_uploaded: allFiles.some(f => f.name.endsWith('.pptx')),
  }

  async function handleParseRfp() {
    if (!rfpFile || totalExceeded) return
    setParsing(true)
    setParseError('')
    try {
      const form = new FormData()
      // 크기 초과 파일 제외하고 업로드
      for (const f of uploadableFiles) form.append('files', f)
      if (drawingMemo) form.append('drawing_memo', drawingMemo)

      const res = await fetch('/api/parse-rfp', { method: 'POST', body: form })
      const parsed = await res.json()
      if (!res.ok) throw new Error(parsed.error ?? 'RFP 파싱 실패')

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

      const patchRes = await fetch(`/api/proposals/${id}`, {
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
          scale_amount: parsed.form_fields?.scale_amount ?? null,
          duration_months: parsed.form_fields?.duration_months ?? null,
          special_conditions: parsed.form_fields?.special_conditions ?? specialConditions,
        }),
      })
      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}))
        throw new Error(errData.error ?? 'DB 저장 실패 — RFP 파싱 결과가 저장되지 않았습니다')
      }
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
      const res = await fetch(`/api/proposals/${id}`, {
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
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '저장 실패')
      }
      router.push(`/proposals/${id}/toc`)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const s = (has: boolean) => (has ? 'done' as const : 'pending' as const)
  const hasSlides = (genCount ?? 0) > 0
  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'active' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: s(hasSlides) },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: s(hasSlides) },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: s(hasSlides) },
  ]

  if (loading) return <div className="p-8 text-gray-400">불러오는 중...</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <div className="flex gap-6">
        {/* 좌측 폼 */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800 mb-6">기본 정보 입력</h1>

          {/* ── 파일 업로드 존 ── */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">
              RFP 문서 업로드
              <span className="text-xs font-normal text-gray-400 ml-2">
                HWPX · PDF · XLSX · PPTX 지원
              </span>
            </p>

            {/* 드롭 존 */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={[
                'border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors cursor-pointer',
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/30',
              ].join(' ')}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm font-medium text-gray-600">
                파일을 여기에 드래그하거나 클릭하여 선택
              </p>
              <p className="text-xs text-gray-400 mt-1">여러 파일 동시 선택 가능</p>

              {/* 숨김 파일 input (다중) */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTS.join(',')}
                className="hidden"
                onChange={e => {
                  addFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </div>

            {/* 폴더 선택 버튼 */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-1.5"
              >
                <span>🗂️</span> 폴더 통째로 선택
              </button>
              {allFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAllFiles([])}
                  className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50"
                >
                  전체 제거
                </button>
              )}
              {/* 숨김 폴더 input */}
              <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-expect-error non-standard
                webkitdirectory=""
                className="hidden"
                onChange={e => {
                  addFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </div>

            {/* 파일 목록 */}
            {allFiles.length > 0 && (
              <div className="mt-3">
                {/* 총 용량 표시 */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">
                    {uploadableFiles.length}개 파일
                    {oversizedFiles.size > 0 && (
                      <span className="text-red-500 ml-1">({oversizedFiles.size}개 크기 초과 제외)</span>
                    )}
                  </span>
                  <span className={`text-xs font-medium ${totalExceeded ? 'text-red-500' : 'text-gray-500'}`}>
                    {formatBytes(totalBytes)} / {MAX_TOTAL_MB}MB
                  </span>
                </div>

                {/* 총합 프로그레스 바 */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${totalExceeded ? 'bg-red-400' : totalBytes > MAX_TOTAL_BYTES * 0.8 ? 'bg-yellow-400' : 'bg-blue-400'}`}
                    style={{ width: `${Math.min((totalBytes / MAX_TOTAL_BYTES) * 100, 100)}%` }}
                  />
                </div>

                <div className="space-y-1.5">
                  {allFiles.map(f => {
                    const badge = getFileTypeBadge(f.name)
                    const isHwp = f.name.toLowerCase().endsWith('.hwp')
                    const isOversized = oversizedFiles.has(f.name)
                    return (
                      <div
                        key={f.name}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                          isOversized
                            ? 'border-red-200 bg-red-50'
                            : isHwp
                            ? 'border-orange-200 bg-orange-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className={`text-sm flex-1 truncate min-w-0 ${isOversized ? 'text-red-500 line-through' : 'text-gray-700'}`}>
                          {f.name}
                        </span>
                        <span className={`text-xs flex-shrink-0 ${isOversized ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {formatBytes(f.size)}
                        </span>
                        {isOversized && (
                          <span className="text-xs text-red-500 flex-shrink-0 whitespace-nowrap">⚠ {MAX_FILE_MB}MB 초과</span>
                        )}
                        {isHwp && !isOversized && (
                          <span className="text-xs text-orange-500 flex-shrink-0 whitespace-nowrap">⚠ 변환 필요</span>
                        )}
                        <button
                          onClick={() => removeFile(f.name)}
                          className="text-gray-300 hover:text-red-400 flex-shrink-0 text-sm leading-none"
                          title="제거"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>

                {totalExceeded && (
                  <p className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                    총 업로드 용량이 {MAX_TOTAL_MB}MB를 초과했습니다. 불필요한 파일을 제거하세요.
                  </p>
                )}
              </div>
            )}

            {/* 파싱 버튼 */}
            <div className="mt-3">
              <button
                onClick={handleParseRfp}
                disabled={!rfpFile || parsing || totalExceeded}
                className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {parsing ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    AI 분석 중... (30초~1분)
                  </>
                ) : (
                  <>✨ AI 자동 입력</>
                )}
              </button>
              {!rfpFile && allFiles.length === 0 && (
                <p className="text-xs text-gray-400 mt-1 text-center">
                  HWPX · PDF · XLSX 파일을 추가하면 활성화됩니다
                </p>
              )}
              {allFiles.length > 0 && !rfpFile && !allFiles.every(f => oversizedFiles.has(f.name)) && (
                <p className="text-xs text-orange-500 mt-1 text-center">
                  HWP 구형 파일은 파싱 불가 — HWPX 또는 PDF로 변환 후 추가하세요
                </p>
              )}
            </div>

            {parseError && (
              <p className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                {parseError}
              </p>
            )}
            {rfpFile && !parsing && !!ai_analysis?.rfp_keywords && (
              <p className="text-xs text-green-600 mt-2 bg-green-50 px-3 py-2 rounded-lg border border-green-100">
                ✓ RFP 파싱 완료 — 아래 항목을 확인·수정하세요
              </p>
            )}
          </div>

          {/* ── 기본 정보 폼 ── */}
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
              <div className="flex gap-4 flex-wrap">
                {['건축', '토목', '전기', '기계', '소방', '통신'].map(type => (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={constructionType.includes(type)}
                      onChange={e => {
                        if (e.target.checked) setConstructionType([...constructionType, type])
                        else setConstructionType(constructionType.filter(t => t !== type))
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
                <span className="text-xs font-normal text-gray-400 ml-1.5">자유 서술 — AI가 핵심 내용 정리</span>
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

        {/* 우측 패널 */}
        <div className="w-60 flex-shrink-0 space-y-4">
          <CoveragePanel
            sourceStatus={sourceStatus}
            sectionPlans={sectionPlans}
          />
          <MembersPanel proposalId={id} />
        </div>
      </div>
    </div>
  )
}
