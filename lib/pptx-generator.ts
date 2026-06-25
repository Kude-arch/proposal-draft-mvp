import PptxGenJS from 'pptxgenjs'

function isSafeImageUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePptx(proposal: any, slides: any[]): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 16:9 (13.33" x 7.5")

  const SLIDE_W = 13.33
  const SLIDE_H = 7.5
  const HEADER_H = 0.9
  const MARGIN = 0.3

  // Q1 FIX: 표지를 먼저 추가해야 첫 페이지가 됨
  const cover = pptx.addSlide()
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: '1E3A5F' },
    line: { color: '1E3A5F' },
  })
  // 상단 악센트 바
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 5.8, w: SLIDE_W, h: 0.08,
    fill: { color: '4A90D9' },
    line: { color: '4A90D9' },
  })
  cover.addText(proposal.title ?? '제안서', {
    x: 1.5, y: 1.8, w: SLIDE_W - 3, h: 1.4,
    fontSize: 34, bold: true, color: 'FFFFFF', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  cover.addText('건설사업관리 용역 제안서', {
    x: 1.5, y: 3.3, w: SLIDE_W - 3, h: 0.6,
    fontSize: 16, color: '88AACC', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  if (proposal.client) {
    cover.addText(proposal.client, {
      x: 1.5, y: 4.2, w: SLIDE_W - 3, h: 0.6,
      fontSize: 18, color: 'AACCEE', align: 'center',
      fontFace: 'Malgun Gothic',
    })
  }
  const metaParts: string[] = []
  if (proposal.location) metaParts.push(proposal.location)
  if (proposal.duration_months) metaParts.push(`과업기간 ${proposal.duration_months}개월`)
  if (metaParts.length > 0) {
    cover.addText(metaParts.join('  |  '), {
      x: 1.5, y: 5.0, w: SLIDE_W - 3, h: 0.4,
      fontSize: 11, color: '6688AA', align: 'center',
      fontFace: 'Malgun Gothic',
    })
  }

  // 표지를 제외한 실제 본문 쪽수
  const totalPages = slides.length

  // 본문 슬라이드 (표지 다음부터, 쪽번호는 1~totalPages)
  for (const slide of slides) {
    const sl = pptx.addSlide()

    // 헤더 배경
    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
      fill: { color: '1E3A5F' },
      line: { color: '1E3A5F' },
    })
    // 헤더 하단 악센트
    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: HEADER_H, w: SLIDE_W, h: 0.04,
      fill: { color: '4A90D9' },
      line: { color: '4A90D9' },
    })

    sl.addText(slide.slide_title ?? '', {
      x: MARGIN, y: 0.1, w: SLIDE_W - MARGIN * 2 - 1.2, h: 0.7,
      fontSize: 20, bold: true, color: 'FFFFFF',
      fontFace: 'Malgun Gothic',
    })
    // 쪽번호: "1 / 20" 형식, 표지 제외 카운트
    sl.addText(`${slide.slide_number} / ${totalPages}`, {
      x: SLIDE_W - 1.5, y: 0.1, w: 1.2, h: 0.7,
      fontSize: 11, color: 'AACCEE', align: 'right',
      fontFace: 'Malgun Gothic',
    })

    const cells = (slide.cells ?? []).sort(
      (a: { cell_index: number }, b: { cell_index: number }) => a.cell_index - b.cell_index
    )
    const cellCount = cells.length || 2
    const cellW = (SLIDE_W - MARGIN * (cellCount + 1)) / cellCount
    const cellH = SLIDE_H - HEADER_H - MARGIN * 2 - 0.04
    const cellY = HEADER_H + MARGIN + 0.04

    for (let ci = 0; ci < cellCount; ci++) {
      const cell = cells[ci] ?? {}
      const cellX = MARGIN + ci * (cellW + MARGIN)

      sl.addShape(pptx.ShapeType.rect, {
        x: cellX, y: cellY, w: cellW, h: cellH,
        fill: { color: 'F5F7FA' },
        line: { color: 'D0D9E8', pt: 1 },
      })

      if (cell.image_url && isSafeImageUrl(cell.image_url)) {
        const imgH = cellH * 0.72
        try {
          sl.addImage({
            path: cell.image_url,
            x: cellX + 0.06, y: cellY + 0.06,
            w: cellW - 0.12, h: imgH - 0.12,
            sizing: { type: 'contain', w: cellW - 0.12, h: imgH - 0.12 },
          })
        } catch {
          sl.addShape(pptx.ShapeType.rect, {
            x: cellX + 0.06, y: cellY + 0.06,
            w: cellW - 0.12, h: imgH - 0.12,
            fill: { color: 'E0E7EF' },
            line: { color: 'B0BCCC' },
          })
          sl.addText('이미지 로드 실패', {
            x: cellX + 0.06, y: cellY + imgH * 0.4,
            w: cellW - 0.12, h: 0.4,
            align: 'center', fontSize: 9, color: 'AAAAAA',
            fontFace: 'Malgun Gothic',
          })
        }

        const titleY = cellY + imgH + 0.08
        const titleH = cellH - imgH - 0.1
        sl.addText(cell.item_title ?? '', {
          x: cellX + 0.1, y: titleY, w: cellW - 0.2, h: titleH,
          fontSize: 9, color: '2C3E50', wrap: true,
          fontFace: 'Malgun Gothic', valign: 'top',
        })
      } else {
        sl.addShape(pptx.ShapeType.rect, {
          x: cellX + 0.06, y: cellY + 0.06,
          w: cellW - 0.12, h: cellH - 0.12,
          fill: { color: 'EEF1F5' },
          line: { color: 'C5CDD9', pt: 1, dashType: 'dash' },
        })
        sl.addText('아이템 미배정', {
          x: cellX, y: cellY + cellH / 2 - 0.2,
          w: cellW, h: 0.4,
          align: 'center', fontSize: 11, color: 'AABBCC',
          fontFace: 'Malgun Gothic',
        })
      }
    }
  }

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return buf
}
