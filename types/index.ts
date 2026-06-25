export type ProposalStatus = 'draft' | 'analyzing' | 'slides_ready' | 'editing' | 'exported'

export type SlidePreset = 'A4P' | 'A4L' | 'A3P' | 'A3L' | 'custom'

export interface SlideSize {
  preset: SlidePreset
  width_mm: number
  height_mm: number
}

export interface SlideMargins {
  top_mm: number
  bottom_mm: number
  left_mm: number
  right_mm: number
  gutter_col_mm: number
  gutter_row_mm: number
}

export interface Proposal {
  id: string
  title: string
  client: string | null
  location: string | null
  construction_type: string[]
  scale_amount: number | null
  scale_area: number | null
  duration_months: number | null
  special_conditions: string | null
  drawing_review_raw: string | null
  rfp_file_url: string | null
  slide_size: SlideSize
  slide_margins: SlideMargins
  ai_analysis: AiAnalysis
  status: ProposalStatus
  created_at: string
  updated_at: string
}

export interface AiAnalysis {
  rfp_keywords?: { tier_a: string[]; tier_b: string[] }
  drawing_notes?: { summary: string; tier_b_extracted: string[] }
  site_analysis?: SiteAnalysis
  section_plans?: SectionPlan[]
}

export interface SiteAnalysis {
  construction_category: string
  scale_tier: string
  key_emphasis: string[]
  summary: string
}

export interface SectionPlan {
  section_title: string
  search_description: string
  tier_b_for_section: string[]
  slide_count_suggestion: number
  coverage_score: number
  coverage_sources: string[]
  coverage_hint: string | null
}

export interface ProposalSection {
  id: string
  proposal_id: string
  title: string
  order_index: number
  slide_count: number
  search_keywords: string[]
  created_at: string
}

export interface ProposalSlide {
  id: string
  proposal_id: string
  section_id: string | null
  slide_number: number
  order_index: number
  layout_type: string
  slide_title: string | null
  cols: number
  rows: number
  created_at: string
  cells?: SlideCell[]
}

export interface SlideCell {
  id: string
  slide_id: string
  cell_index: number
  db_item_id: string | null
  image_url: string | null
  item_title: string | null
  col_start: number
  row_start: number
  col_span: number
  row_span: number
  created_at: string
}

export interface ProposalItem {
  id: string
  title: string
  section_big: string
  section_small: string
  keywords: Array<{ type: 'taxonomy' | 'custom'; value: string }>
  keyword_status: 'ai_generated' | 'human_verified'
  content_text: string | null
  image_url: string | null
  created_at: string
  score?: number
}

export interface SiteDocument {
  id: string
  proposal_id: string
  file_url: string
  file_name: string | null
  file_type: string
  extracted_text: string | null
  created_at: string
}

export interface Pass0Result {
  form_fields: {
    title?: string
    client?: string
    location?: string
    construction_type?: string[]
    scale_amount?: number
    duration_months?: number
    special_conditions?: string
  }
  sections: string[]
  rfp_keywords: { tier_a: string[]; tier_b: string[] }
  drawing_notes?: { summary: string; tier_b_extracted: string[] }
}

export interface Pass1Result {
  site_analysis: SiteAnalysis
  section_plans: SectionPlan[]
}

export interface GeminiCell {
  col_start: number
  row_start: number
  col_span: number
  row_span: number
  item_id: string | null
}

export interface GeminiSlide {
  cols: number
  rows: number
  cells: GeminiCell[]
}

export interface GeminiSectionSelection {
  section_title: string
  slides: GeminiSlide[]
}

export interface Pass2Result {
  selections: GeminiSectionSelection[]
}

export interface Pass2Slide {
  slide_number: number
  section_title: string
  layout_type: string
  cols: number
  rows: number
  cells: Array<{
    cell_index: number
    db_item_id: string | null
    image_url: string | null
    item_title: string | null
    col_start: number
    row_start: number
    col_span: number
    row_span: number
  }>
}
