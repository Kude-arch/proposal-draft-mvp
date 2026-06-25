import PptxGenJS from 'pptxgenjs'

function isSafeImageUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function mmToIn(mm: number): number {
  return mm / 25.4
}

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const mime = res.headers.get('content-type') ?? 'image/png'
    return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
  } catch {
    return null
  }
}

interface SlideSize {
  preset: string
  width_mm: number
  height_mm: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePptx(proposal: any, slides: any[]): Promise<Buffer> {
  const pptx = new PptxGenJS()

  const slideSize: SlideSize = proposal.slide_size ?? { preset: 'A4L', width_mm: 297, height_mm: 210 }
  const SLIDE_W = mmToIn(slideSize.width_mm)
  const SLIDE_H = mmToIn(slideSize.height_mm)

  pptx.defineLayout({ name: 'CUSTOM', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'CUSTOM'

  const HEADER_H = mmToIn(22)
  const ACCENT_H = mmToIn(1)
  const MARGIN_L = mmToIn(8)
  const MARGIN_R = mmToIn(8)
  const MARGIN_T = mmToIn(6)
  const MARGIN_B = mmToIn(8)
  const GUTTER_COL = mmToIn(4)
  const GUTTER_ROW = mmToIn(4)

  const CONTENT_W = SLIDE_W - MARGIN_L - MARGIN_R
  const CONTENT_H = SLIDE_H - HEADER_H - ACCENT_H - MARGIN_T - MARGIN_B

  // 표지
  const cover = pptx.addSlide()
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: '1E3A5F' },
    line: { color: '1E3A5F' },
  })
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: SLIDE_H * 0.77, w: SLIDE_W, h: mmToIn(2),
    fill: { color: '4A90D9' },
    line: { color: '4A90D9' },
  })
  cover.addText(proposal.title ?? '제안서', {
    x: mmToIn(38), y: SLIDE_H * 0.24, w: SLIDE_W - mmToIn(76), h: mmToIn(35),
    fontSize: 34, bold: true, color: 'FFFFFF', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  cover.addText('건설사업관리 용역 제안서', {
    x: mmToIn(38), y: SLIDE_H * 0.44, w: SLIDE_W - mmToIn(76), h: mmToIn(15),
    fontSize: 16, color: '88AACC', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  if (proposal.client) {
    cover.addText(proposal.client, {
      x: mmToIn(38), y: SLIDE_H * 0.56, w: SLIDE_W - mmToIn(76), h: mmToIn(15),
      fontSize: 18, color: 'AACCEE', align: 'center',
      fontFace: 'Malgun Gothic',
    })
  }
  const metaParts: string[] = []
  if (proposal.location) metaParts.push(proposal.location)
  if (proposal.duration_months) metaParts.push(`과업기간 ${proposal.duration_months}개월`)
  if (metaParts.length > 0) {
    cover.addText(metaParts.join('  |  '), {
      x: mmToIn(38), y: SLIDE_H * 0.67, w: SLIDE_W - mmToIn(76), h: mmToIn(10),
      fontSize: 11, color: '6688AA', align: 'center',
      fontFace: 'Malgun Gothic',
    })
  }

  const totalPages = slides.length

  // 모든 이미지 URL 수집 후 병렬 프리패치 → data URI로 임베드
  const allImageUrls = new Set<string>()
  for (const slide of slides) {
    for (const cell of slide.cells ?? []) {
      if (cell.image_url && isSafeImageUrl(cell.image_url)) {
        allImageUrls.add(cell.image_url)
      }
    }
  }
  const imageCache = new Map<string, string | null>()
  await Promise.all(
    Array.from(allImageUrls).map(async url => {
      imageCache.set(url, await fetchImageAsDataUri(url))
    })
  )

  for (const slide of slides) {
    const sl = pptx.addSlide()
    const cols: number = slide.cols ?? 2
    const rows: number = slide.rows ?? 1

    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
      fill: { color: '1E3A5F' }, line: { color: '1E3A5F' },
    })
    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: HEADER_H, w: SLIDE_W, h: ACCENT_H,
      fill: { color: '4A90D9' }, line: { color: '4A90D9' },
    })
    sl.addText(slide.slide_title ?? '', {
      x: MARGIN_L, y: mmToIn(3), w: SLIDE_W - MARGIN_L - MARGIN_R - mmToIn(30), h: HEADER_H - mmToIn(6),
      fontSize: 18, bold: true, color: 'FFFFFF',
      fontFace: 'Malgun Gothic',
    })
    sl.addText(`${slide.slide_number} / ${totalPages}`, {
      x: SLIDE_W - mmToIn(32), y: mmToIn(3), w: mmToIn(28), h: HEADER_H - mmToIn(6),
      fontSize: 10, color: 'AACCEE', align: 'right',
      fontFace: 'Malgun Gothic',
    })

    const cellUnitW = (CONTENT_W - GUTTER_COL * (cols - 1)) / cols
    const cellUnitH = (CONTENT_H - GUTTER_ROW * (rows - 1)) / rows
    const contentStartY = HEADER_H + ACCENT_H + MARGIN_T

    const cells = (slide.cells ?? []).sort(
      (a: { cell_index: number }, b: { cell_index: number }) => a.cell_index - b.cell_index
    )

    for (const cell of cells) {
      const colStart: number = cell.col_start ?? 1
      const rowStart: number = cell.row_start ?? 1
      const colSpan: number = cell.col_span ?? 1
      const rowSpan: number = cell.row_span ?? 1

      const cellX = MARGIN_L + (colStart - 1) * (cellUnitW + GUTTER_COL)
      const cellY = contentStartY + (rowStart - 1) * (cellUnitH + GUTTER_ROW)
      const cellW = cellUnitW * colSpan + GUTTER_COL * (colSpan - 1)
      const cellH = cellUnitH * rowSpan + GUTTER_ROW * (rowSpan - 1)

      sl.addShape(pptx.ShapeType.rect, {
        x: cellX, y: cellY, w: cellW, h: cellH,
        fill: { color: 'F5F7FA' }, line: { color: 'D0D9E8', pt: 1 },
      })

      const dataUri = cell.image_url ? imageCache.get(cell.image_url) : null
      if (dataUri) {
        const imgH = cellH * 0.75
        sl.addImage({
          data: dataUri,
          x: cellX + mmToIn(1.5), y: cellY + mmToIn(1.5),
          w: cellW - mmToIn(3), h: imgH - mmToIn(3),
          sizing: { type: 'contain', w: cellW - mmToIn(3), h: imgH - mmToIn(3) },
        })

        const titleY = cellY + imgH + mmToIn(2)
        const titleH = cellH - imgH - mmToIn(2)
        sl.addText(cell.item_title ?? '', {
          x: cellX + mmToIn(2.5), y: titleY,
          w: cellW - mmToIn(5), h: Math.max(titleH, mmToIn(5)),
          fontSize: 8, color: '2C3E50', wrap: true,
          fontFace: 'Malgun Gothic', valign: 'top',
        })
      } else {
        sl.addShape(pptx.ShapeType.rect, {
          x: cellX + mmToIn(1.5), y: cellY + mmToIn(1.5),
          w: cellW - mmToIn(3), h: cellH - mmToIn(3),
          fill: { color: 'EEF1F5' },
          line: { color: 'C5CDD9', pt: 1, dashType: 'dash' },
        })
        sl.addText('아이템 미배정', {
          x: cellX, y: cellY + cellH / 2 - mmToIn(5),
          w: cellW, h: mmToIn(10),
          align: 'center', fontSize: 11, color: 'AABBCC',
          fontFace: 'Malgun Gothic',
        })
      }
    }
  }

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return buf
}
