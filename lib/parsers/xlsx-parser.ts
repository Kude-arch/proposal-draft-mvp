import * as XLSX from 'xlsx'

export function parseXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const lines: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) {
      lines.push(`[시트: ${sheetName}]`)
      lines.push(csv)
    }
  }
  return lines.join('\n').slice(0, 50000) // 50k자 제한
}
