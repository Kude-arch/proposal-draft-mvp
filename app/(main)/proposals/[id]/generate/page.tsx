'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import StepNav from '@/components/StepNav'
import CoveragePanel from '@/components/CoveragePanel'

interface Props {
  params: Promise<{ id: string }>
}

type PhaseStatus = 'idle' | 'running' | 'done' | 'error'

interface Phase {
  label: string
  desc: string
  status: PhaseStatus
  detail?: string
}

export default function GeneratePage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [phases, setPhases] = useState<Phase[]>([
    { label: '현장 분석', desc: 'RFP 키워드 기반 사업여건 분석', status: 'idle' },
    { label: '섹션 계획', desc: '목차별 검색 전략 및 슬라이드 배분', status: 'idle' },
    { label: '슬라이드 생성', desc: 'DB 아이템 검색 및 배치', status: 'idle' },
  ])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [sectionPlans, setSectionPlans] = useState<Array<{
    section_title: string
    coverage_score?: number
    coverage_hint?: string | null
  }>>([])

  function setPhaseStatus(idx: number, status: PhaseStatus, detail?: string) {
    setPhases(prev =>
      prev.map((p, i) => (i === idx ? { ...p, status, detail } : p))
    )
  }

  async function handleGenerate() {
    setRunning(true)
    setError('')

    try {
      // Phase 0: Analyze (Pass1)
      setPhaseStatus(0, 'running')
      setPhaseStatus(1, 'running')
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: id }),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeData.error ?? '분석 실패')

      const plans = analyzeData.section_plans ?? []
      setSectionPlans(plans)

      setPhaseStatus(0, 'done', analyzeData.site_analysis?.summary ?? '')
      setPhaseStatus(1, 'done', `${plans.length}개 섹션 분석 완료`)

      // Phase 2: Generate slides (Pass2)
      setPhaseStatus(2, 'running')
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: id }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error ?? '슬라이드 생성 실패')

      setPhaseStatus(2, 'done', `${genData.total_slides}개 슬라이드 생성 완료`)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생')
      setPhases(prev => prev.map(p => p.status === 'running' ? { ...p, status: 'error' } : p))
    } finally {
      setRunning(false)
    }
  }

  const steps = [
    { label: '기본정보', href: `/proposals/${id}/info`, status: 'done' as const },
    { label: '목차구성', href: `/proposals/${id}/toc`, status: 'done' as const },
    { label: 'AI 생성', href: `/proposals/${id}/generate`, status: 'active' as const },
    { label: '슬라이드 편집', href: `/proposals/${id}/edit`, status: 'pending' as const },
    { label: 'PPTX 내보내기', href: `/proposals/${id}/export`, status: 'pending' as const },
  ]

  const sourceStatus = {
    rfp_uploaded: true,
    drawing_memo: false,
    pptx_uploaded: false,
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <StepNav steps={steps} />

      <h1 className="text-xl font-bold text-gray-800 mb-2">AI 슬라이드 생성</h1>
      <p className="text-sm text-gray-500 mb-8">
        RFP 분석 결과를 바탕으로 DB에서 적합한 아이템을 검색하고 슬라이드를 구성합니다.
      </p>

      <div className="flex gap-6">
        <div className="flex-1">
          {/* 단계 진행 표시 */}
          <div className="space-y-3 mb-8">
            {phases.map((phase, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  phase.status === 'running'
                    ? 'border-blue-200 bg-blue-50'
                    : phase.status === 'done'
                    ? 'border-green-200 bg-green-50'
                    : phase.status === 'error'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                    phase.status === 'running'
                      ? 'bg-blue-500 text-white animate-pulse'
                      : phase.status === 'done'
                      ? 'bg-green-500 text-white'
                      : phase.status === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {phase.status === 'done' ? '✓' : phase.status === 'error' ? '✕' : i + 1}
                </div>
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      phase.status === 'running'
                        ? 'text-blue-700'
                        : phase.status === 'done'
                        ? 'text-green-700'
                        : phase.status === 'error'
                        ? 'text-red-700'
                        : 'text-gray-600'
                    }`}
                  >
                    {phase.label}
                    {phase.status === 'running' && (
                      <span className="ml-2 text-xs font-normal animate-pulse">처리 중...</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{phase.desc}</p>
                  {phase.detail && (
                    <p className="text-xs text-gray-600 mt-1 italic">{phase.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {!done ? (
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/proposals/${id}/toc`)}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                ← 목차 수정
              </button>
              <button
                onClick={handleGenerate}
                disabled={running}
                className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {running ? '생성 중... (30초~1분 소요)' : 'AI 슬라이드 생성 시작'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                슬라이드 생성이 완료되었습니다. 편집 화면에서 아이템을 조정하세요.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={running}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                >
                  재생성
                </button>
                <button
                  onClick={() => router.push(`/proposals/${id}/edit`)}
                  className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  슬라이드 편집 →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 커버리지 패널 */}
        <div className="w-56 flex-shrink-0">
          <CoveragePanel
            sourceStatus={sourceStatus}
            sectionPlans={sectionPlans}
          />
        </div>
      </div>
    </div>
  )
}
