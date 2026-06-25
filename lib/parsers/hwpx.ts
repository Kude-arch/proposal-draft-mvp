import JSZip from 'jszip'
import { parseStringPromise } from 'xml2js'

export async function parseHwpx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const xmlFile = zip.file('Contents/section0.xml')
  if (!xmlFile) throw new Error('Contents/section0.xml not found in HWPX')

  const xmlContent = await xmlFile.async('string')
  const parsed = await parseStringPromise(xmlContent, { explicitArray: true })

  const texts: string[] = []
  collectText(parsed, texts)
  return texts.join(' ').replace(/\s+/g, ' ').trim()
}

function collectText(node: unknown, result: string[]): void {
  if (typeof node === 'string') {
    const trimmed = node.trim()
    if (trimmed) result.push(trimmed)
    return
  }
  if (Array.isArray(node)) {
    node.forEach(child => collectText(child, result))
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    // <t> 태그 텍스트 우선 수집
    if ('t' in obj) collectText(obj['t'], result)
    // 그 외 모든 자식 순회
    for (const key of Object.keys(obj)) {
      if (key !== 't' && key !== '$') collectText(obj[key], result)
    }
  }
}
