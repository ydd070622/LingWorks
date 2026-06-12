import { useState, useCallback, useRef } from 'react'
import { Download, Copy, Sparkles, Upload, Send } from 'lucide-react'
import { callImageToImage } from '../services/api'
import { historyService } from '../services/history'
import type { CustomModel, GenerationResult, AgentContext } from '../types'

export default function ImageToImage({ models, onSendToAgent }: { models: CustomModel[]; onSendToAgent?: (ctx: AgentContext) => void }) {
  const [prompt, setPrompt] = useState('')
  const [strength, setStrength] = useState(0.8)
  const [modelId, setModelId] = useState(0)
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setSourceImage(reader.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !sourceImage || models.length === 0) return
    setLoading(true)
    setResult(null)
    try {
      const model = models[modelId]
      const images = await callImageToImage(model, prompt.trim(), sourceImage, strength)
      setResult({ images, prompt: prompt.trim(), timestamp: Date.now(), modelName: model.name })
      for (const img of images) {
        historyService.addItem({ type: 'image-to-image', prompt: prompt.trim(), imageBase64: img, modelName: model.name, parameters: { strength } })
      }
    } catch (e: any) {
      const detail = e?.response?.data?.error?.message || e?.response?.data?.msg || e?.message || '未知错误'
      alert('生成失败: ' + detail)
    } finally {
      setLoading(false)
    }
  }, [prompt, strength, sourceImage, modelId, models])

  const handleSave = async (dataUrl: string) => {
    if (window.electronAPI) {
      await window.electronAPI.saveImage(dataUrl, `img2img-${Date.now()}.png`)
    } else {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `img2img-${Date.now()}.png`
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
    <div style={{ padding: '8px 24px 24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, minHeight: 0, marginBottom: 16 }}>
        <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <label>参考图片</label>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {sourceImage ? (
                <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                  <img
                    src={sourceImage}
                    alt="参考图"
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      borderRadius: 'var(--radius-sm)' as any,
                      background: 'rgba(0,0,0,0.3)',
                      cursor: 'pointer',
                      border: '1px solid var(--border-color)',
                    }}
                    onClick={() => fileRef.current?.click()}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    onClick={() => setSourceImage(null)}
                  >清除</button>
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '40px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    transition: 'border-color 0.15s',
                    width: '100%',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                >
                  <Upload size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div style={{ fontSize: 13 }}>点击选择图片</div>
                </div>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
        </div>

        <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <label className="label">生成结果</label>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? (
              <span className="spinner" />
            ) : result ? (
              <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                <img
                  src={result.images[0]}
                  alt="生成结果"
                  onClick={() => window.electronAPI?.openImageWindow(result.images[0])}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    borderRadius: 'var(--radius-sm)' as any,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleSave(result.images[0])}><Download size={14} /> 保存</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(result.images[0])}><Copy size={14} /> 复制</button>
                  {onSendToAgent && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onSendToAgent({ kind: 'image', data: result.images[0], prompt: result.prompt, model: result.modelName })}><Send size={14} /> 智能体</button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>生成后在此显示</div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'end' }}>
          <div>
            <div className="form-group">
              <label className="label">提示词</label>
              <textarea
                className="input-base"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="描述你想要的风格或修改..."
                rows={2}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
            <div className="form-group">
              <label className="label">强度 {strength.toFixed(1)}</label>
              <input type="range" min={0.1} max={1.0} step={0.1} value={strength}
                onChange={e => setStrength(Number(e.target.value))}
                style={{ width: 120, accentColor: 'var(--accent)' }} />
            </div>
            <div className="form-group">
              <label className="label">模型</label>
              <select className="select-base" value={modelId} onChange={e => setModelId(Number(e.target.value))} style={{ minWidth: 140 }}>
                {models.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading || !prompt.trim() || !sourceImage || models.length === 0}
            >
              {loading ? <><span className="spinner" /> 生成中...</> : <><Sparkles size={16} /> 生成</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
