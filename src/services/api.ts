import axios from 'axios'
import type { CustomModel } from '../types'

function isPollinationsModel(model: CustomModel): boolean {
  return model.modelName === 'pollinations' || model.endpoint.includes('pollinations.ai')
}

function buildApiUrl(endpoint: string, suffix: string): string {
  const base = endpoint.replace(/\/+$/, '')
  const hasImg = /\/images\/generations/.test(base)
  const hasChat = /\/chat\/completions/.test(base)
  if ((suffix.includes('images/generations') && hasImg) ||
      (suffix.includes('chat/completions') && hasChat)) {
    return base
  }
  return base + '/' + suffix.replace(/^\/+/, '')
}

function getEndpoint(model: CustomModel): string {
  return buildApiUrl(model.endpoint, '/v1/images/generations')
}

function getChatEndpoint(model: CustomModel): string {
  return buildApiUrl(model.endpoint, '/v1/chat/completions')
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function resolveImageFromUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  try { return await fetchImageAsBase64(url) } catch { return url }
}

async function parseCustomResponse(res: any): Promise<string[]> {
  const items: any[] = []
  if (res.data && Array.isArray(res.data)) items.push(...res.data)
  if (res.images && Array.isArray(res.images)) items.push(...res.images)
  if (res.output && Array.isArray(res.output)) items.push(...res.output)
  if (res.results && Array.isArray(res.results)) items.push(...res.results)

  const results: string[] = []

  for (const item of items) {
    if (item?.url) { results.push(await resolveImageFromUrl(item.url)); continue }
    if (item?.image_url) { results.push(await resolveImageFromUrl(item.image_url)); continue }
    if (item?.b64_json) { results.push(`data:image/png;base64,${item.b64_json}`); continue }
    if (typeof item === 'string' && item.length > 100) {
      if (item.startsWith('http')) results.push(await resolveImageFromUrl(item))
      else if (item.startsWith('data:')) results.push(item)
      else results.push(`data:image/png;base64,${item}`)
    }
  }

  if (results.length > 0) return results

  if (res.choices?.[0]?.message?.content) {
    const content = res.choices[0].message.content
    const jsonMatch = content.match(/```json\n?([\s\S]*?)```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      if (Array.isArray(parsed)) return parsed
    }
  }

  throw new Error(`API 返回格式异常: ${JSON.stringify(res).slice(0, 300)}`)
}

function buildSize(aspectRatio: string, resolution: string): string {
  const sizes: Record<string, Record<string, string>> = {
    '1:1': { '1K': '1920x1920', '2K': '2560x2560' },
    '4:3': { '1K': '2240x1680', '2K': '3200x2400' },
    '3:4': { '1K': '1680x2240', '2K': '2400x3200' },
    '16:9': { '1K': '2560x1440', '2K': '3840x2160' },
    '9:16': { '1K': '1440x2560', '2K': '2160x3840' },
    '3:2': { '1K': '2352x1568', '2K': '3072x2048' },
    '2:3': { '1K': '1568x2352', '2K': '2048x3072' },
  }
  return sizes[aspectRatio]?.[resolution] || '1920x1920'
}

function calcImg2ImgSize(w: number, h: number): string {
  const minPixels = 3686400
  const minSide = 1920
  const ratio = w / h
  let width = Math.max(w, minSide)
  let height = Math.ceil(width / ratio)
  if (height < minSide) { height = minSide; width = Math.ceil(height * ratio) }
  if (width * height < minPixels) { height = Math.ceil(Math.sqrt(minPixels / ratio)); width = Math.ceil(height * ratio) }
  return `${width}x${height}`
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

export async function callTextToImage(
  model: CustomModel,
  prompt: string,
  negativePrompt: string,
  aspectRatio: string,
  resolution: string,
  imageCount: number,
): Promise<string[]> {
  const size = buildSize(aspectRatio, resolution)
  const [w, h] = size.split('x')

  if (isPollinationsModel(model)) {
    const fullPrompt = negativePrompt ? `${prompt} ### ${negativePrompt}` : prompt
    const params = new URLSearchParams({ width: w, height: h, nologo: 'true' })
    const results: string[] = []
    for (let i = 0; i < imageCount; i++) {
      const seed = Math.floor(Math.random() * 1000000)
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?${params.toString()}&seed=${seed}`
      const dataUrl = await fetchImageAsBase64(url)
      results.push(dataUrl)
    }
    return results
  }

  if (model.modelName.includes('flux') || model.modelName.includes('FLUX')) {
    const basePayload: Record<string, any> = {
      model: model.modelName,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Generate an image: ${prompt}` }] }],
      response_format: 'b64_json',
      size,
    }
    if (negativePrompt) basePayload.negative_prompt = negativePrompt
    const results: string[] = []
    for (let i = 0; i < imageCount; i++) {
      const res = await axios.post(getChatEndpoint(model), basePayload, {
        headers: { Authorization: `Bearer ${model.apiKey}` },
        timeout: 180000,
      })
      const imgs = await parseCustomResponse(res.data)
      results.push(...imgs)
    }
    return results
  }

  const results: string[] = []
  for (let i = 0; i < imageCount; i++) {
    const payload: Record<string, any> = {
      model: model.modelName,
      prompt,
      n: 1,
      size,
      response_format: 'b64_json',
    }
    if (negativePrompt) payload.negative_prompt = negativePrompt
    const res = await axios.post(getEndpoint(model), payload, {
      headers: { Authorization: `Bearer ${model.apiKey}` },
      timeout: 120000,
    })
    const imgs = await parseCustomResponse(res.data)
    results.push(...imgs)
  }
  return results
}

export async function callImageToImage(
  model: CustomModel,
  prompt: string,
  imageBase64: string,
  strength: number,
): Promise<string[]> {
  if (isPollinationsModel(model)) {
    throw new Error('Pollinations AI 不支持图生图，请在「API 设置」中添加自定义模型')
  }

  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`

  if (model.modelName.includes('flux') || model.modelName.includes('FLUX')) {
    const payload = {
      model: model.modelName,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Transform this image: ${prompt}` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      response_format: 'b64_json',
    }
    const res = await axios.post(getChatEndpoint(model), payload, {
      headers: { Authorization: `Bearer ${model.apiKey}` },
      timeout: 120000,
    })
    return parseCustomResponse(res.data)
  }

  const dims = await getImageDimensions(dataUrl)
  const imgSize = calcImg2ImgSize(dims.width, dims.height)

  const res = await axios.post(getEndpoint(model), {
    model: model.modelName,
    prompt,
    image: dataUrl,
    strength,
    n: 1,
    size: imgSize,
    response_format: 'b64_json',
  }, {
    headers: { Authorization: `Bearer ${model.apiKey}` },
    timeout: 120000,
  })
  return parseCustomResponse(res.data)
}

export function getDefaultModels(): CustomModel[] {
  return [
    {
      name: 'Pollinations AI',
      apiKey: '',
      endpoint: 'https://pollinations.ai',
      modelName: 'pollinations',
    },
  ]
}
