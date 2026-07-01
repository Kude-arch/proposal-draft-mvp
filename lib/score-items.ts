interface ScoringItem {
  title: string
  keywords?: Array<{ type: string; value: string }> | null
  content_text?: string | null
  keyword_status?: string | null
}

export function scoreItem(item: ScoringItem, keywords: string[]): number {
  let score = 0
  const titleLower = (item.title ?? '').toLowerCase()
  const customKws = (item.keywords ?? [])
    .filter(k => k.type === 'custom')
    .map(k => k.value.toLowerCase())
  const taxKws = (item.keywords ?? [])
    .filter(k => k.type === 'taxonomy')
    .map(k => k.value.toLowerCase())
  const contentLower = (item.content_text ?? '').toLowerCase()

  for (const kw of keywords) {
    const kl = kw.toLowerCase()
    if (titleLower.includes(kl)) score += 40
    if (customKws.some(v => v.includes(kl) || kl.includes(v))) score += 30
    if (contentLower && contentLower.includes(kl)) score += 20
    else if (taxKws.some(v => v.includes(kl) || kl.includes(v))) score += 20
    if (taxKws.some(v => v.includes(kl))) score += 10
  }

  if (item.keyword_status === 'human_verified') score += 5
  return score
}
