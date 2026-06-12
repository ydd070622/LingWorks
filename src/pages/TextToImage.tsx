import { useState, useCallback } from 'react'
import { Download, Copy, Sparkles, Send } from 'lucide-react'
import { callTextToImage } from '../services/api'
import { historyService } from '../services/history'
import type { CustomModel, GenerationResult, AgentContext } from '../types'

const ratios = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']
const resolutions = ['1K', '2K']

export default function TextToImage({ models, onSendToAgent }: { models: CustomModel[]; onSendToAgent?: (ctx: AgentContext) => void }) {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [ratio, setRatio] = useState('1:1')
  const [resolution, setResolution] = useState('1K')
  const [count, setCount] = useState('1')
  const [modelId, setModelId] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || models.length === 0 || !count.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const model = models[modelId]
      const numCount = Math.max(1, Math.min(20, parseInt(count) || 1))
      const images = await callTextToImage(model, prompt.trim(), negativePrompt.trim(), ratio, resolution, numCount)
      setResult({ images, prompt: prompt.trim(), timestamp: Date.now(), modelName: model.name })
      for (const img of images) {
        await historyService.addItem({ type: 'text-to-image', prompt: prompt.trim(), imageBase64: img, modelName: model.name, parameters: { negativePrompt, ratio, resolution } })
      }
    } catch (e: any) {
      const detail = e?.response?.data?.error?.message || e?.response?.data?.msg || e?.message || '未知错误'
      alert('生成失败: ' + detail)
    } finally {
      setLoading(false)
    }
  }, [prompt, negativePrompt, ratio, resolution, count, modelId, models])

  const handleSave = async (dataUrl: string) => {
    if (window.electronAPI) {
      await window.electronAPI.saveImage(dataUrl, `ai-${Date.now()}.png`)
    } else {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `ai-${Date.now()}.png`
      link.click()
    }
  }

  const handleCopy = async (dataUrl: string) => {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
    } catch {
      const input = document.createElement('input')
      input.value = dataUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
  }

  return (
    <div style={{ padding: '8px 24px 24px', height: '100%', overflow: 'hidden', display: 'flex', gap: 16 }}>
      <div className="glass-card" style={{ padding: 20, width: 340, minWidth: 340, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <div className="form-group">
          <label>提示词</label>
          <textarea
            className="input-base"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="描述你要生成的图片..."
            rows={4}
          />
        </div>
        <div className="form-group">
          <label>负面提示词（可选）</label>
          <textarea
            className="input-base"
            value={negativePrompt}
            onChange={e => setNegativePrompt(e.target.value)}
            placeholder="不希望出现的内容..."
            rows={2}
          />
        </div>
        <div className="form-group">
          <label>比例 · 分辨率 · 数量</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select-base" value={ratio} onChange={e => setRatio(e.target.value)} style={{ flex: 1 }}>
              {ratios.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="select-base" value={resolution} onChange={e => setResolution(e.target.value)} style={{ flex: 1 }}>
              {resolutions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              type="number"
              className="input-base"
              value={count}
              onChange={e => setCount(e.target.value)}
              min={1}
              max={20}
              placeholder="1-20"
              style={{ flex: 1, textAlign: 'center' }}
            />
          </div>
        </div>
        <div className="form-group">
          <label>模型</label>
          <select className="select-base" value={modelId} onChange={e => setModelId(Number(e.target.value))}>
            {models.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim() || models.length === 0}
          style={{ marginTop: 'auto' }}
        >
          {loading ? <><span className="spinner" /> 生成中...</> : <><Sparkles size={16} /> 生成</>}
        </button>
      </div>

      <div className="glass-card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : result ? (
          result.images.length === 1 ? (
            <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
              <img
                src={result.images[0]}
                alt="生成结果"
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer', background: 'rgba(0,0,0,0.2)' }}
                onClick={() => window.electronAPI?.openImageWindow(result.images[0])}
              />
              <div className="result-actions" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 14px', display: 'flex', gap: 6, justifyContent: 'center', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleSave(result.images[0])}><Download size={14} /> 保存</button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(result.images[0])}><Copy size={14} /> 复制</button>
                {onSendToAgent && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onSendToAgent({ kind: 'image', data: result.images[0], prompt: result.prompt, model: result.modelName })}><Send size={14} /> 智能体</button>
                )}
              </div>
            </div>
          ) : (
            <div className="result-grid" style={{ padding: 0 }}>
              {result.images.map((img, i) => (
                <div key={i} className="result-item">
                  <img src={img} alt={`结果 ${i + 1}`} onClick={() => window.electronAPI?.openImageWindow(img)} style={{ cursor: 'pointer' }} />
                  <div className="result-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => handleSave(img)}>
                      <Download size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(img)}>
                      <Copy size={14} />
                    </button>
                    {onSendToAgent && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onSendToAgent({ kind: 'image', data: img, prompt: result.prompt, model: result.modelName })}>
                        <Send size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            生成后在此显示
          </div>
        )}
      </div>
    </div>
  )
}
