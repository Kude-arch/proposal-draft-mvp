import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

export function getModel(jsonMode = true) {
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
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

export async function generateJson<T>(prompt: string): Promise<T> {
  const model = getModel(true)
  const result = await model.generateContent(prompt)
  const text = result.response.text()
  return JSON.parse(text) as T
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
  return JSON.parse(result.response.text()) as T
}
