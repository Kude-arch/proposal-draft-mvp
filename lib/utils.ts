export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export function mmToIn(mm: number): number {
  return mm / 25.4
}

export function formatAmount(won: number): string {
  if (won >= 1_000_000_000_000) return `${(won / 1_000_000_000_000).toFixed(1)}조원`
  if (won >= 100_000_000) return `${(won / 100_000_000).toFixed(0)}억원`
  if (won >= 10_000) return `${(won / 10_000).toFixed(0)}만원`
  return `${won.toLocaleString()}원`
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '입력 중',
    analyzing: '분석 중',
    slides_ready: '편집 대기',
    editing: '편집 중',
    exported: '완료',
  }
  return map[status] ?? status
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    analyzing: 'bg-yellow-100 text-yellow-700',
    slides_ready: 'bg-purple-100 text-purple-700',
    editing: 'bg-blue-100 text-blue-700',
    exported: 'bg-green-100 text-green-700',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function coverageColor(score: number): string {
  if (score >= 70) return 'bg-green-500'
  if (score >= 40) return 'bg-yellow-400'
  return 'bg-red-400'
}

export function coverageTextColor(score: number): string {
  if (score >= 70) return 'text-green-700'
  if (score >= 40) return 'text-yellow-700'
  return 'text-red-600'
}

export function detectDocType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes('과업') || lower.includes('업무')) return 'rfp'
  if (lower.includes('공고')) return 'notice'
  if (lower.includes('배치')) return 'staffing'
  if (lower.includes('평가')) return 'evaluation'
  if (lower.includes('자료조사') || lower.includes('조사')) return 'research'
  return 'other'
}
