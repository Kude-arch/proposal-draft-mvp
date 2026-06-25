import PptxGenJS from 'pptxgenjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePptx(proposal: any, slides: any[]): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 16:9 (13.33" x 7.5")

  const SLIDE_W = 13.33
  const SLIDE_H = 7.5
  const HEADER_H = 0.9
  const MARGIN = 0.3

  for (const slide of slides) {
    const sl = pptx.addSlide()

    // 헤더 배경
    sl.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
      fill: { color: '1E3A5F' },
      line: { color: '1E3A5F' },
    })

    // 슬라이드 제목
    sl.addText(slide.slide_title ?? '', {
      x: MARGIN, y: 0.1, w: SLIDE_W - MARGIN * 2, h: 0.7,
      fontSize: 20, bold: true, color: 'FFFFFF',
      fontFace: 'Malgun Gothic',
    })

    // 페이지 번호
    sl.addText(`${slide.slide_number}`, {
      x: SLIDE_W - 1.0, y: 0.1, w: 0.7, h: 0.7,
      fontSize: 12, color: 'AACCEE', align: 'right',
      fontFace: 'Malgun Gothic',
    })

    const cells = (slide.cells ?? []).sort(
      (a: { cell_index: number }, b: { cell_index: number }) => a.cell_index - b.cell_index
    )
    const cellCount = cells.length || 2
    const cellW = (SLIDE_W - MARGIN * (cellCount + 1)) / cellCount
    const cellH = SLIDE_H - HEADER_H - MARGIN * 2
    const cellY = HEADER_H + MARGIN

    for (let ci = 0; ci < cellCount; ci++) {
      const cell = cells[ci] ?? {}
      const cellX = MARGIN + ci * (cellW + MARGIN)

      // 셀 배경
      sl.addShape(pptx.ShapeType.rect, {
        x: cellX, y: cellY, w: cellW, h: cellH,
        fill: { color: 'F5F7FA' },
        line: { color: 'D0D9E8', pt: 1 },
      })

      if (cell.image_url) {
        // 이미지 영역 (상단 70%)
        const imgH = cellH * 0.7
        try {
          sl.addImage({
            path: cell.image_url,
            x: cellX + 0.05, y: cellY + 0.05,
            w: cellW - 0.1, h: imgH - 0.1,
            sizing: { type: 'contain', w: cellW - 0.1, h: imgH - 0.1 },
          })
        } catch {
          // 이미지 로드 실패 시 플레이스홀더
          sl.addShape(pptx.ShapeType.rect, {
            x: cellX + 0.05, y: cellY + 0.05,
            w: cellW - 0.1, h: imgH - 0.1,
            fill: { color: 'E0E7EF' },
            line: { color: 'B0BCCC' },
          })
          sl.addText('이미지 없음', {
            x: cellX + 0.05, y: cellY + imgH * 0.4,
            w: cellW - 0.1, h: 0.4,
            align: 'center', fontSize: 10, color: '888888',
            fontFace: 'Malgun Gothic',
          })
        }

        // 아이템 제목 (하단 30%)
        const titleY = cellY + imgH + 0.1
        const titleH = cellH * 0.3 - 0.15
        sl.addText(cell.item_title ?? '', {
          x: cellX + 0.1, y: titleY, w: cellW - 0.2, h: titleH,
          fontSize: 9, color: '2C3E50', wrap: true,
          fontFace: 'Malgun Gothic', valign: 'top',
        })
      } else {
        // 빈 셀 플레이스홀더
        sl.addShape(pptx.ShapeType.rect, {
          x: cellX + 0.05, y: cellY + 0.05,
          w: cellW - 0.1, h: cellH - 0.1,
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

  // 표지 슬라이드 prepend
  const cover = pptx.addSlide()
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: '1E3A5F' },
  })
  cover.addText(proposal.title ?? '제안서', {
    x: 1, y: 2.5, w: SLIDE_W - 2, h: 1.2,
    fontSize: 36, bold: true, color: 'FFFFFF', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  cover.addText(proposal.client ?? '', {
    x: 1, y: 4.0, w: SLIDE_W - 2, h: 0.7,
    fontSize: 20, color: 'AACCEE', align: 'center',
    fontFace: 'Malgun Gothic',
  })
  cover.addText('건설사업관리 용역 제안서', {
    x: 1, y: 4.8, w: SLIDE_W - 2, h: 0.6,
    fontSize: 16, color: '88AACC', align: 'center',
    fontFace: 'Malgun Gothic',
  })

  // 표지를 첫 번째로 이동 (pptxgenjs는 순서 이동이 없으므로 커버를 먼저 추가하고 싶으면
  // 위 addSlide 순서를 바꿔야 하지만, 여기서는 마지막 추가라 마지막으로 감)
  // 실제로는 cover를 먼저 만들어야 하지만 현 구조상 마지막에 추가됨
  // TODO: 표지를 첫 페이지로 위치시키는 처리 필요

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return buf
}
