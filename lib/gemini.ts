import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

export function getModel(jsonMode = true) {
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: jsonMode
      ? { responseMimeType: 'application/json' }
      : undefined,
  })
}

export async function uploadPdfToGemini(buffer: Buffer, filename: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `rfp_${Date.now()}_${filename}`)
  fs.writeFileSync(tmpPath, buffer)
  try {
    const uploadResult = await fileManager.uploadFile(tmpPath, {
      mimeType: 'application/pdf',
      displayName: filename,
    })
    return uploadResult.file.uri
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

function parseJsonResponse<T>(text: string): T {
  if (!text?.trim()) throw new Error('Gemini 응답이 비어 있습니다')
  try {
    return JSON.parse(text) as T
  } catch {
    console.error('Gemini JSON 파싱 실패. 원본 응답 앞 500자:', text.slice(0, 500))
    throw new Error('Gemini 응답을 JSON으로 파싱할 수 없습니다')
  }
}

export async function generateJson<T>(prompt: string): Promise<T> {
  const model = getModel(true)
  const result = await model.generateContent(prompt)
  return parseJsonResponse<T>(result.response.text())
}

export async function generateJsonWithFile<T>(
  fileUri: string,
  mimeType: string,
  prompt: string
): Promise<T> {
  const model = getModel(true)
  const result = await model.generateContent([
    { fileData: { mimeType, fileUri } },
    { text: prompt },
  ])
  return parseJsonResponse<T>(result.response.text())
}

export async function generateJsonWithFiles<T>(
  files: Array<{ uri: string; mimeType: string }>,
  prompt: string
): Promise<T> {
  const model = getModel(true)
  const result = await model.generateContent([
    ...files.map(f => ({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })),
    { text: prompt },
  ])
  return parseJsonResponse<T>(result.response.text())
}
