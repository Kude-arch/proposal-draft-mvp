'use client'

import { coverageColor, coverageTextColor } from '@/lib/utils'

interface SourceStatus {
  rfp_uploaded: boolean
  drawing_memo: boolean
  pptx_uploaded: boolean
}

interface PartialSectionPlan {
  section_title: string
  coverage_score?: number
  coverage_hint?: string | null
}

interface CoveragePanelProps {
  sourceStatus: SourceStatus
  sectionPlans?: PartialSectionPlan[]
  className?: string
}

export default function CoveragePanel({
  sourceStatus,
  sectionPlans,
  className = '',
}: CoveragePanelProps) {
  const sources = [
    { key: 'rfp_uploaded', label: 'RFP 문서', icon: '📄' },
    { key: 'drawing_memo', label: '도면 검토 메모', icon: '📐' },
    { key: 'pptx_uploaded', label: '참고 PPTX', icon: '📊' },
  ] as const

  return (
    <div className={`border border-gray-200 rounded-lg p-4 bg-gray-50 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">입력 소스 현황</h3>

      {/* 소스 상태 */}
      <div className="flex gap-3 flex-wrap mb-4">
        {sources.map(src => (
          <div
            key={src.key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              sourceStatus[src.key]
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-gray-100 text-gray-400 border border-gray-200'
            }`}
          >
            <span>{src.icon}</span>
            <span>{src.label}</span>
            <span>{sourceStatus[src.key] ? '✓' : '—'}</span>
          </div>
        ))}
      </div>

      {/* 섹션별 커버리지 */}
      {sectionPlans && sectionPlans.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">섹션별 분석 품질</h3>
          <div className="space-y-1.5">
            {sectionPlans.map((plan, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-4 text-right">{i + 1}</span>
                <span className="text-xs text-gray-700 flex-1 truncate" title={plan.section_title}>
                  {plan.section_title}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${coverageColor(plan.coverage_score ?? 0)}`}
                      style={{ width: `${plan.coverage_score ?? 0}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium w-8 text-right ${coverageTextColor(plan.coverage_score ?? 0)}`}>
                    {plan.coverage_score ?? 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 보완 힌트 */}
          {sectionPlans.some(p => p.coverage_hint) && (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="text-xs font-medium text-gray-600 mb-1.5">보완 제안</p>
              {sectionPlans
                .filter(p => p.coverage_hint)
                .map((p, i) => (
                  <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-1">
                    <span className="font-medium">{p.section_title}:</span> {p.coverage_hint}
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
