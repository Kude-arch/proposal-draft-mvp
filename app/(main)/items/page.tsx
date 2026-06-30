'use client'

import { useState, useCallback, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Keyword { type: 'taxonomy' | 'custom'; value: string }

interface Item {
  id: string
  title: string
  section_big: string | null
  section_small: string | null
  source_proposal: string | null
  keywords: Keyword[]
  keyword_status: 'ai_generated' | 'human_verified'
  image_url: string | null
}

interface Group { name: string; count: number }

// ─── Taxonomy ──────────────────────────────────────────────────────────────
const TAXONOMY: Record<string, string[]> = {
  '공정관리':    ['공정계획','공정관리계획','마스터스케줄','마일스톤','공기단축','공정분석','지연분석','CPM','공정현황보고','공기지연','돌관공사'],
  '품질관리':    ['품질계획','품질관리계획','시공관리계획','검측계획','시공상세도','품질시험','품질교육','ISO','품질감사','불량관리','자재관리','검사계획'],
  '안전관리':    ['안전계획','안전관리계획','위험성평가','안전교육','재해예방','TBM','스마트안전','안전점검','안전관리비','중대재해','안전패트롤'],
  '원가관리':    ['예산계획','원가분석','EVM','공사비검토','VE','설계변경','정산관리','LCC분석','사업비관리','기성관리'],
  '설계관리':    ['설계검토','설계조정','설계변경관리','시공성검토','구조검토','도서관리','실시설계도서검토','설계도서검토','공법개선','시공성개선'],
  '계약·행정':   ['계약관리','클레임예방','분쟁조정','공문관리','보고체계','착공신고','인허가','준공관리'],
  '스마트건설·BIM': ['BIM','4D시뮬레이션','5D원가','드론측량','디지털트윈','IoT센서','AR/VR','스마트건설','스마트안전관제','영상분석'],
  '조직·의사소통': ['조직계획','업무분장','의사소통계획','이해관계자관리','회의관리','CM역할','인원투입계획','전문인력'],
  '리스크관리':  ['리스크식별','리스크분석','리스크대응','이슈관리','비상계획','예상문제점','개선대책'],
  '환경·민원':   ['환경관리계획','환경관리','소음진동관리','민원관리','폐기물관리','비산먼지','대기질관리','친환경공법'],
}
const ALL_TAX = Object.values(TAXONOMY).flat()
const HINTS = ['CM역할','이해관계자관리','공정계획','공정관리계획','설계검토','민원관리','리스크식별','개선대책','시공성검토','조직계획']

// ─── Chip component ────────────────────────────────────────────────────────
function KwChip({ kw, onDelete }: { kw: Keyword; onDelete?: () => void }) {
  const isT = kw.type === 'taxonomy'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
      ${isT ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>
      {!isT && <span className="text-teal-500">✎</span>}
      {kw.value}
      {onDelete && (
        <button onClick={onDelete} className="opacity-60 hover:opacity-100 leading-none ml-0.5">✕</button>
      )}
    </span>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
type View = 'search' | 'list' | 'detail'

export default function ItemsPage() {
  const [view, setView] = useState<View>('search')
  const [query, setQuery] = useState('')
  const [isAllMode, setIsAllMode] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [listLabel, setListLabel] = useState('')
  const [selected, setSelected] = useState<Item | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }

  const loadItems = useCallback(async (q: string, pg: number, status: string, source: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg) })
      if (q) params.set('q', q)
      if (status && status !== 'all') params.set('status', status)
      if (source) params.set('source', source)
      const res = await fetch(`/api/items?${params}`)
      const data = await res.json()
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGroups = useCallback(async () => {
    const res = await fetch('/api/items/groups')
    const data = await res.json()
    setGroups(data ?? [])
  }, [])

  const handleSearch = () => {
    const q = query.trim()
    if (!q) return
    setIsAllMode(false)
    setListLabel(`"${q}" 검색 결과`)
    setStatusFilter('all')
    setSourceFilter('')
    loadItems(q, 1, 'all', '')
    setView('list')
  }

  const handleShowAll = () => {
    setIsAllMode(true)
    setListLabel('전체 아이템')
    setQuery('')
    setStatusFilter('all')
    setSourceFilter('')
    loadItems('', 1, 'all', '')
    loadGroups()
    setView('list')
  }

  const handlePageChange = (pg: number) => {
    loadItems(query.trim(), pg, statusFilter, sourceFilter)
    window.scrollTo(0, 0)
  }

  const handleStatusFilter = (s: string) => {
    setStatusFilter(s)
    loadItems(query.trim(), 1, s, sourceFilter)
  }

  const handleSourceFilter = (src: string) => {
    setSourceFilter(src)
    setStatusFilter('all')
    loadItems(query.trim(), 1, 'all', src)
  }

  const openDetail = (item: Item) => {
    setSelected(item)
    setView('detail')
    window.scrollTo(0, 0)
  }

  const updateSelected = (updated: Item) => {
    setSelected(updated)
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  const totalPages = Math.ceil(total / 40)

  // ── Search View ──────────────────────────────────────────────────────────
  if (view === 'search') return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-[#F7F8FA] border-b border-[#F0F0EF] px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">아이템 DB</h1>
          <p className="text-xs text-gray-400 mt-0.5">건설사업관리용역 제안서 구성요소를 키워드로 검색합니다</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center px-6 py-12 flex-1">
        <div className="flex gap-2 w-full max-w-lg">
          <input
            className="flex-1 border-2 border-[#F0F0EF] rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 bg-white"
            placeholder="키워드 입력 (예: BIM, 공정관리, 안전)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="bg-[#2563EB] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-blue-700 transition-colors"
          >검색</button>
        </div>
        <div className="text-xs text-gray-400 mt-5 mb-2">데이터 기반 주요 키워드</div>
        <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
          {HINTS.map(h => (
            <button key={h}
              onClick={() => setQuery(h)}
              className="bg-white border border-[#F0F0EF] rounded-full px-3 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >{h}</button>
          ))}
        </div>
        <button
          onClick={handleShowAll}
          className="mt-7 border-2 border-[#F0F0EF] rounded-xl px-10 py-2.5 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >전체 이미지 보기</button>
      </div>
    </div>
  )

  // ── List View ────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-[#F7F8FA] border-b border-[#F0F0EF] px-8 py-3 flex items-center gap-3">
        <button onClick={() => setView('search')} className="border border-[#F0F0EF] bg-white rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">← 검색</button>
        <span className="text-sm font-semibold text-gray-700">{listLabel}</span>
        <span className="text-xs text-gray-400 ml-auto">{loading ? '불러오는 중...' : `총 ${total.toLocaleString()}개`}</span>
      </div>
      <div className="max-w-6xl mx-auto px-8 py-6 w-full">
        {/* 프로젝트 필터 (전체 모드일 때만) */}
        {isAllMode && groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => handleSourceFilter('')}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap
                ${sourceFilter === '' ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'bg-white border-[#F0F0EF] text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
            >전체 ({groups.reduce((s, g) => s + g.count, 0).toLocaleString()})</button>
            {groups.map(g => (
              <button key={g.name}
                onClick={() => handleSourceFilter(g.name)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap
                  ${sourceFilter === g.name ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'bg-white border-[#F0F0EF] text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
              >{g.name} ({g.count})</button>
            ))}
          </div>
        )}

        {/* 상태 필터 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[['all','전체'],['ai_generated','⚠ 검토 필요'],['human_verified','✓ 검토 완료']].map(([val, label]) => (
            <button key={val}
              onClick={() => handleStatusFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors
                ${statusFilter === val ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'bg-white border-[#F0F0EF] text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
            >{label}</button>
          ))}
        </div>

        {/* legend */}
        <div className="flex gap-4 mb-4 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs">Taxonomy</span>사전 정의 키워드</span>
          <span className="flex items-center gap-1.5"><span className="bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5 text-xs">✎ Custom</span>추가 키워드</span>
        </div>

        {/* grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">결과가 없습니다</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {items.map(item => <ItemCard key={item.id} item={item} onClick={() => openDetail(item)} />)}
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8">
            <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}
              className="px-3 py-1.5 text-xs border border-[#F0F0EF] bg-white rounded-lg disabled:opacity-40 hover:bg-gray-50">← 이전</button>
            <span className="text-xs text-gray-500">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}
              className="px-3 py-1.5 text-xs border border-[#F0F0EF] bg-white rounded-lg disabled:opacity-40 hover:bg-gray-50">다음 →</button>
          </div>
        )}
      </div>
    </div>
  )

  // ── Detail View ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-[#F7F8FA] border-b border-[#F0F0EF] px-8 py-3 flex items-center gap-3">
        <button onClick={() => setView('list')} className="border border-[#F0F0EF] bg-white rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">← 목록</button>
        <span className="text-sm font-semibold text-gray-700 truncate">{selected?.title}</span>
      </div>
      {selected && (
        <DetailView
          item={selected}
          onUpdate={updateSelected}
          showToast={showToast}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm rounded-lg px-5 py-2.5 z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── ItemCard ───────────────────────────────────────────────────────────────
function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  const visible = item.keywords.slice(0, 3)
  const extra = item.keywords.length - 3
  return (
    <div
      onClick={onClick}
      className="bg-white border border-[#F0F0EF] rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      {item.image_url ? (
        <img src={item.image_url} alt={item.title} className="w-full aspect-[16/10] object-cover block" />
      ) : (
        <div className="w-full aspect-[16/10] bg-gray-50 flex items-center justify-center text-gray-300 text-xs">이미지 없음</div>
      )}
      <div className="p-3">
        <div className="text-sm font-semibold text-gray-800 mb-0.5 leading-snug">{item.title}</div>
        <div className="text-xs text-gray-400 mb-2 truncate">
          {item.source_proposal && <span className="font-medium text-gray-500">{item.source_proposal} · </span>}
          {[item.section_big, item.section_small].filter(Boolean).join(' > ') || '분류 없음'}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {visible.map((k, i) => <KwChip key={i} kw={k} />)}
          {extra > 0 && <span className="text-xs text-gray-400">+{extra}</span>}
        </div>
        {item.keyword_status === 'ai_generated' && (
          <div className="mt-2 inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium">
            ⚠ 검토 필요
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DetailView ─────────────────────────────────────────────────────────────
function DetailView({ item, onUpdate, showToast }: {
  item: Item
  onUpdate: (item: Item) => void
  showToast: (msg: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [editingCls, setEditingCls] = useState(false)
  const [clsForm, setClsForm] = useState({ section_big: item.section_big ?? '', section_small: item.section_small ?? '', title: item.title })
  const [draftKws, setDraftKws] = useState<Keyword[]>(item.keywords)
  const [taxSearch, setTaxSearch] = useState('')
  const [cusInput, setCusInput] = useState('')

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('저장 실패')
      const updated = await res.json()
      onUpdate(updated)
      return true
    } catch {
      showToast('저장에 실패했습니다')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveKeywords = async () => {
    const ok = await patch({ keywords: draftKws, keyword_status: 'human_verified' })
    if (ok) showToast('✓ 키워드 검토가 완료되었습니다')
  }

  const saveClassification = async () => {
    const ok = await patch({ section_big: clsForm.section_big, section_small: clsForm.section_small, title: clsForm.title })
    if (ok) { showToast('✓ 분류 정보가 저장되었습니다'); setEditingCls(false) }
  }

  const filteredTax = ALL_TAX.filter(v => {
    const used = draftKws.some(k => k.value === v)
    if (used) return false
    return !taxSearch || v.toLowerCase().includes(taxSearch.toLowerCase())
  })

  const addTax = (v: string) => setDraftKws(prev => [...prev, { type: 'taxonomy', value: v }])
  const addCustom = () => {
    const v = cusInput.trim()
    if (!v) return
    if (draftKws.some(k => k.value === v)) { showToast('이미 있는 키워드입니다'); return }
    setDraftKws(prev => [...prev, { type: 'custom', value: v }])
    setCusInput('')
  }
  const removeKw = (v: string) => setDraftKws(prev => prev.filter(k => k.value !== v))

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      {/* meta */}
      <div className="text-xs text-gray-400 mb-1">
        {[item.source_proposal, item.section_big, item.section_small].filter(Boolean).join('  ·  ')}
      </div>
      <div className="text-xl font-bold text-gray-900 mb-4 leading-snug">{item.title}</div>

      {/* 이미지 */}
      <div className="bg-white border border-[#F0F0EF] rounded-xl overflow-hidden mb-4">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="w-full block" />
        ) : (
          <div className="w-full h-48 flex items-center justify-center text-gray-300 text-sm">이미지 없음</div>
        )}
      </div>

      {/* 이미지 다운로드 */}
      {item.image_url && (
        <div className="flex gap-2 mb-5">
          <a href={item.image_url} download target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-[#F0F0EF] bg-white rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            ⬇ 이미지 다운로드
          </a>
        </div>
      )}

      {/* 분류 정보 */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">분류 정보</span>
          {!editingCls && (
            <button onClick={() => setEditingCls(true)}
              className="text-xs border border-[#F0F0EF] rounded-md px-2 py-0.5 text-gray-400 hover:bg-gray-50">편집</button>
          )}
        </div>
        {editingCls ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-amber-800 mb-3">분류 편집</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([['title','아이템 이름'],['section_big','큰목차'],['section_small','작은목차']] as const).map(([key, label]) => (
                <div key={key} className={key === 'title' ? 'col-span-2' : ''}>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
                  <input
                    className="w-full border border-[#F0F0EF] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
                    value={clsForm[key]}
                    onChange={e => setClsForm(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveClassification} disabled={saving}
                className="flex-1 bg-[#2563EB] text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setEditingCls(false)}
                className="px-4 border border-[#F0F0EF] rounded-lg text-sm text-gray-500 hover:bg-gray-50">취소</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {([['프로젝트', item.source_proposal],['아이템 이름', item.title],['큰목차', item.section_big],['작은목차', item.section_small]] as const).map(([label, val]) => (
              <div key={label} className={`bg-white rounded-lg border border-[#F0F0EF] p-3 ${label === '아이템 이름' || label === '프로젝트' ? 'col-span-2' : ''}`}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</div>
                <div className={`text-sm ${val ? 'text-gray-800' : 'text-gray-300 italic'}`}>{val || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 키워드 검토 패널 */}
      {item.keyword_status === 'ai_generated' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="text-sm font-semibold text-amber-800 mb-1">⚠ 키워드 검토 필요</div>
          <div className="text-xs text-amber-700 mb-4">AI가 자동 추출한 키워드입니다. 불필요한 키워드를 삭제하고 필요한 키워드를 추가한 후 검토 완료를 눌러주세요.</div>
          {/* 현재 키워드 */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">현재 키워드 (✕ 클릭으로 삭제)</div>
            <div className="flex flex-wrap gap-1.5">
              {draftKws.map(k => <KwChip key={k.value} kw={k} onDelete={() => removeKw(k.value)} />)}
            </div>
          </div>
          {/* Taxonomy 추가 */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Taxonomy에서 추가</div>
            <div className="bg-white border border-[#F0F0EF] rounded-lg overflow-hidden">
              <input
                className="w-full border-b border-[#F0F0EF] px-3 py-2 text-sm outline-none"
                placeholder="키워드 검색…"
                value={taxSearch}
                onChange={e => setTaxSearch(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5 p-2.5 max-h-36 overflow-y-auto">
                {filteredTax.slice(0, 60).map(v => (
                  <button key={v} onClick={() => addTax(v)}
                    className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs hover:bg-blue-100 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Custom 추가 */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Custom 추가 키워드</div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-[#F0F0EF] rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white"
                placeholder="Taxonomy에 없는 키워드 입력"
                value={cusInput}
                onChange={e => setCusInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
              />
              <button onClick={addCustom}
                className="bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-3 py-2 text-sm font-medium hover:bg-teal-100 transition-colors">
                + 추가
              </button>
            </div>
          </div>
          <button onClick={saveKeywords} disabled={saving}
            className="w-full bg-[#2563EB] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : '검토 완료 →'}
          </button>
        </div>
      )}

      {/* 전체 키워드 */}
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">키워드</div>
        <div className="flex flex-wrap gap-1.5">
          {(item.keyword_status === 'ai_generated' ? draftKws : item.keywords).map((k, i) => (
            <KwChip key={i} kw={k} />
          ))}
        </div>
      </div>
    </div>
  )
}
