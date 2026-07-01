import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { parseHwpx } from '@/lib/parsers/hwpx'
import { parseXlsx } from '@/lib/parsers/xlsx-parser'
import { generateJson, generateJsonWithFiles, uploadPdfToGemini } from '@/lib/gemini'
import { detectDocType } from '@/lib/utils'
import type { Pass0Result } from '@/types'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  const drawingMemo = (formData.get('drawing_memo') as string) || ''

  if (!files.length) return Response.json({ error: '파일이 없습니다' }, { status: 400 })

  const docTexts: Array<{ label: string; text: string }> = []
  const pdfUris: Array<{ label: string; uri: string }> = []

  for (const file of files) {
    const docType = detectDocType(file.name)
    const label = docType === 'rfp' ? '[주 문서]' : `[보조 문서: ${file.name}]`
    const buf = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    if (ext === 'hwpx') {
      try {
        const text = await parseHwpx(buf)
        docTexts.push({ label, text: text.slice(0, 60000) })
      } catch {
        docTexts.push({ label, text: `[HWPX 파싱 실패: ${file.name}]` })
      }
    } else if (ext === 'pdf') {
      try {
        const uri = await uploadPdfToGemini(buf, file.name)
        pdfUris.push({ label, uri })
      } catch {
        docTexts.push({ label, text: `[PDF 업로드 실패: ${file.name}]` })
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      const text = parseXlsx(buf)
      docTexts.push({ label, text })
    } else if (ext === 'hwp') {
      docTexts.push({ label, text: `[HWP 구형 파일은 HWPX 또는 PDF로 변환 후 업로드해 주세요: ${file.name}]` })
    }
  }

  const pass0Prompt = buildPass0Prompt(docTexts, drawingMemo)

  let result: Pass0Result
  try {
    if (pdfUris.length > 0) {
      // 모든 PDF를 Gemini에 전달 (multi-file content)
      const extraText = docTexts.map(d => `${d.label}\n${d.text}`).join('\n\n')
      const promptWithExtra = extraText ? `${pass0Prompt}\n\n[추가 문서]\n${extraText}` : pass0Prompt
      result = await generateJsonWithFiles<Pass0Result>(
        pdfUris.map(p => ({ uri: p.uri, mimeType: 'application/pdf' })),
        promptWithExtra
      )
    } else {
      result = await generateJson<Pass0Result>(pass0Prompt)
    }
  } catch (e) {
    console.error('RFP 파싱 실패:', e)
    return Response.json(
      { error: e instanceof Error ? e.message : 'AI 파싱 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }

  return Response.json(result)
}

function buildPass0Prompt(
  docs: Array<{ label: string; text: string }>,
  drawingMemo: string
): string {
  const docSection = docs.map(d => `${d.label}\n${d.text}`).join('\n\n---\n\n')
  const drawingSection = drawingMemo
    ? `\n\n[도면 검토 메모]\n${drawingMemo}`
    : ''

  return `당신은 건설사업관리 용역 제안서 작성 전문가입니다.
아래 RFP(과업지시서 등) 문서를 분석하여 제안서 작성에 필요한 정보를 추출하세요.

${docSection}${drawingSection}

다음 JSON 스키마에 맞게 정확히 응답하세요:

{
  "form_fields": {
    "title": "용역명 (예: OO건설사업관리 용역)",
    "client": "발주처명",
    "location": "사업 위치",
    "construction_type": ["건축", "토목" 등 해당 공종 배열],
    "scale_amount": 용역 예정금액(원, 숫자만),
    "duration_months": 과업기간(개월, 숫자만),
    "special_conditions": "특이사항 자유 서술"
  },
  "sections": ["발주처 요구 목차 섹션명 배열 - 과업수행범위에서 추출"],
  "rfp_keywords": {
    "tier_a": ["공정관리","품질관리","안전관리" 등 관리영역 키워드 배열],
    "tier_b": ["NATM","연약지반","전이층" 등 사업 고유 기술·지역·공법 용어 배열 (최소 5개)"]
  },
  "drawing_notes": {
    "summary": "도면 검토 메모에서 파악된 핵심 사항 1~3문장 요약 (메모가 없으면 빈 문자열)",
    "tier_b_extracted": ["도면 메모에서 추출한 Tier B 키워드 배열"]
  }
}

주의:
- sections는 실제 발주처가 요구하는 목차 항목만 추출 (일반적인 항목 추가 금지)
- tier_b는 사업 고유 기술·지역·공법 용어 위주 (일반 용어 제외)
- scale_amount, duration_months가 없으면 null
- 모든 필드를 최선을 다해 추출`
}
