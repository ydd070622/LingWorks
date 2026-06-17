import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, Trash2, Pencil, Settings2, Image, Bot, Key, Command, Info, Loader2, FolderOpen, Search, ArrowLeft, Wifi, ChevronDown, Download, PlugZap } from 'lucide-react'
import type { CustomModel, ShortcutBindings, AgentModel } from '../types'
import { AGENT_PROVIDERS, loadModels as loadAgentModels, saveModels as saveAgentModels, fetchProviderModels, generateId, getProviderEndpoint } from '../services/agent'
import { clearCityCache } from '../services/agent-loop'
import { getSortedProvinces, getCities, getDistricts } from '../data/regions'

interface SettingsProps {
  models: CustomModel[]
  onSave: (models: CustomModel[]) => void
  onClose: () => void
  onNavigate?: (id: string) => void
}

type TabId = 'general' | 'image-models' | 'agent-models' | 'tavily' | 'shortcuts' | 'about'

const SHORTCUT_TARGETS: { id: string; label: string }[] = [
  { id: 'liblib', label: 'Lib tv' },
  { id: 'runninghub', label: 'RunningHub' },
  { id: 'tapnow', label: 'TapNow' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'github', label: 'GitHub' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'xhs_juguang', label: '小红书' },
  { id: 'txt2img', label: '文生图' },
  { id: 'img2img', label: '图生图' },
  { id: 'history', label: '生成历史' },
  { id: 'prompts', label: 'Prompt管理' },
  { id: 'platforms', label: '开放平台' },
  { id: 'recharge', label: '充值平台' },
  { id: 'dashboard', label: '数据面板' },
  { id: 'accounts', label: '常用账号' },
  { id: 'home', label: '主页' },
]

const STORAGE_KEY = 'shortcutBindings'

const DEFAULT_SHORTCUTS: ShortcutBindings = {
  'Alt+1': 'chatgpt',
  'Alt+2': 'github',
  'Alt+3': 'liblib',
  'Alt+4': 'runninghub',
  'Alt+5': 'gemini',
  'Alt+6': 'tapnow',
  'Ctrl+Shift+T': 'txt2img',
  'Ctrl+Shift+I': 'img2img',
}

function eventToCombo(e: KeyboardEvent): string | null {
  const key = e.key
  if (!key || key === 'Alt' || key === 'Control' || key === 'Shift' || key === 'Meta') return null
  const parts: string[] = []
  if (e.altKey) parts.push('Alt')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  let k = key
  if (k.length === 1) k = k.toUpperCase()
  else if (k === ' ') k = 'Space'
  parts.push(k)
  return parts.join('+')
}

function comboSegments(combo: string): string[] {
  return combo.split('+')
}

const emptyModel: CustomModel = { name: '', apiKey: '', endpoint: '', modelName: '' }

export default function Settings({ models, onSave, onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // --- General ---
  const [showHome, setShowHome] = useState(true)
  const [checkUpdate, setCheckUpdate] = useState(true)
  const [downloadPath, setDownloadPath] = useState('')
  const [cityProvince, setCityProvince] = useState('')
  const [cityList, setCityList] = useState<string[]>([])
  const [city, setCity] = useState('')
  const [districtList, setDistrictList] = useState<string[]>([])
  const [district, setDistrict] = useState('')
  // theme & desktop behavior
  const [theme, setTheme] = useState<'dark'|'light'|'system'>('dark')
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [startMinimized, setStartMinimized] = useState(false)
  const [closeToTray, setCloseToTray] = useState(false)
  const [notifyComplete, setNotifyComplete] = useState(false)

  // --- Image Models (dual-panel) ---
  const [imgModels, setImgModels] = useState<CustomModel[]>(() => JSON.parse(JSON.stringify(models)))
  const [imgSelectedIdx, setImgSelectedIdx] = useState<number>(models.length > 0 ? 0 : -1)
  const [imgDraft, setImgDraft] = useState<CustomModel>({ ...emptyModel })
  const [imgDraftIdx, setImgDraftIdx] = useState<number | null>(null) // null = adding new
  const [imgShowAdd, setImgShowAdd] = useState(false)

  // --- Agent Models (dual-panel, per-provider) ---
  const [agentModels, setAgentModels] = useState<AgentModel[]>([])
  const [agProviderId, setAgProviderId] = useState('')
  const [agApiKey, setAgApiKey] = useState('')
  const [agFetchedModels, setAgFetchedModels] = useState<string[]>([])
  const [agCheckedModels, setAgCheckedModels] = useState<Set<string>>(new Set())
  const [agProbeMode, setAgProbeMode] = useState<'test' | 'fetch' | null>(null)
  const [agProbeResult, setAgProbeResult] = useState<string | null>(null)
  const [agSavedText, setAgSavedText] = useState('')
  const [agAddMenuOpen, setAgAddMenuOpen] = useState(false)
  const isAgCustom = agProviderId === 'custom'

  // Computed: models belonging to selected provider
  const providerAgentModels = agentModels.filter(m => m.providerId === agProviderId)
  // Only show providers that have models configured
  const configuredProviderIds = new Set(agentModels.map(m => m.providerId))
  const configuredProviders = AGENT_PROVIDERS.filter(p => configuredProviderIds.has(p.id))
  const unconfiguredProviders = AGENT_PROVIDERS.filter(p => !configuredProviderIds.has(p.id))

  // --- Tavily ---
  const [tavilyKey, setTavilyKey] = useState('')
  const [tavilySaved, setTavilySaved] = useState(false)

  // --- Shortcuts ---
  const [shortcuts, setShortcuts] = useState<ShortcutBindings>({})
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null)
  const recordingComboRef = useRef<string>('')
  const [shortcutSaved, setShortcutSaved] = useState(false)

  // ===== Load stored data =====
  useEffect(() => {
    const load = async () => {
      if (window.electronAPI) {
        const [savedHome, savedUpdate, savedPath, savedProvince, savedCity, savedDistrict, savedTheme, savedAutoLaunch, savedStartMinimized, savedCloseToTray, savedNotifyComplete, savedTavily, savedShortcuts] = await Promise.all([
          window.electronAPI.getStore('showHomeOnStartup'),
          window.electronAPI.getStore('checkUpdate'),
          window.electronAPI.getStore('downloadPath'),
          window.electronAPI.getStore('preferredProvince'),
          window.electronAPI.getStore('preferredCity'),
          window.electronAPI.getStore('preferredDistrict'),
          window.electronAPI.getStore('theme'),
          window.electronAPI.getAutoLaunch(),
          window.electronAPI.getStartMinimized(),
          window.electronAPI.getStore('closeToTray'),
          window.electronAPI.getStore('notifyComplete'),
          window.electronAPI.getStore('agent_tavily_key'),
          window.electronAPI.getStore(STORAGE_KEY),
        ])
        if (typeof savedHome === 'boolean') setShowHome(savedHome)
        if (typeof savedUpdate === 'boolean') setCheckUpdate(savedUpdate)
        if (typeof savedPath === 'string') setDownloadPath(savedPath)
        else setDownloadPath(await window.electronAPI.getDesktopPath())
        if (typeof savedProvince === 'string' && savedProvince) {
          setCityProvince(savedProvince); setCityList(getCities(savedProvince))
          if (typeof savedCity === 'string' && savedCity) {
            // savedCity 格式为 "省,市"，需要提取城市名
            const cityName = savedCity.includes(',') ? savedCity.split(',')[1] : savedCity
            setCity(cityName); setDistrictList(getDistricts(savedProvince, cityName))
            if (typeof savedDistrict === 'string' && savedDistrict) setDistrict(savedDistrict)
          }
        }
        if (typeof savedTavily === 'string') setTavilyKey(savedTavily)
        else setTavilyKey(localStorage.getItem('agent_tavily_key') || '')
        if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') setTheme(savedTheme)
        if (typeof savedAutoLaunch === 'boolean') setAutoLaunch(savedAutoLaunch)
        if (typeof savedStartMinimized === 'boolean') setStartMinimized(savedStartMinimized)
        if (typeof savedCloseToTray === 'boolean') { setCloseToTray(savedCloseToTray); if (savedCloseToTray) window.electronAPI.setCloseToTray(true) }
        if (typeof savedNotifyComplete === 'boolean') setNotifyComplete(savedNotifyComplete)
        if (typeof savedAutoLaunch === 'boolean' && savedAutoLaunch) window.electronAPI.setAutoLaunch(true)
        if (typeof savedStartMinimized === 'boolean' && savedStartMinimized) window.electronAPI.setStartMinimized(true)
        const agModels = await loadAgentModels(); setAgentModels(agModels)
        // Select first configured provider, or first available
        const confIds = new Set(agModels.map((m: AgentModel) => m.providerId))
        if (confIds.size > 0) setAgProviderId([...confIds][0])
        else setAgProviderId(AGENT_PROVIDERS[0]?.id || '')
        setShortcuts(savedShortcuts && Object.keys(savedShortcuts).length > 0 ? savedShortcuts : { ...DEFAULT_SHORTCUTS })
      } else {
        setShortcuts({ ...DEFAULT_SHORTCUTS })
      }
    }
    load()
  }, [])

  // When switching agent provider, load stored API key
  useEffect(() => {
    const existing = agentModels.find(m => m.providerId === agProviderId)
    setAgApiKey(existing?.apiKey || '')
  }, [agProviderId])

  // Auto-fetch removed — now manual via "测试连接" button

  // ===== General helpers =====
  const saveGeneral = useCallback(async (key: string, value: any) => {
    if (window.electronAPI) await window.electronAPI.setStore(key, value)
  }, [])

  const onProvinceChange = (province: string) => {
    setCityProvince(province); setCity(''); setDistrict(''); setDistrictList([])
    const cities = getCities(province); setCityList(cities)
    if (province) {
      saveGeneral('preferredProvince', province)
      if (!city && !district) saveGeneral('preferredCityCombined', province)
    }
    clearCityCache()
  }
  const onCityChange = (c: string) => {
    setCity(c); setDistrict('')
    const districts = getDistricts(cityProvince, c); setDistrictList(districts)
    if (c) {
      saveGeneral('preferredCity', cityProvince + ',' + c)
      saveGeneral('preferredProvince', cityProvince)
      window.electronAPI?.setStore('preferredDistrict', '')
      if (districts.length === 0) saveGeneral('preferredCityCombined', cityProvince + ',' + c)
    }
    clearCityCache()
  }
  const onDistrictChange = (d: string) => {
    setDistrict(d)
    if (d) {
      saveGeneral('preferredDistrict', d)
      saveGeneral('preferredCityCombined', cityProvince + ',' + city + ',' + d)
    }
    clearCityCache()
  }

  const pickFolder = async () => {
    if (window.electronAPI) {
      const p = await window.electronAPI.selectFolder(downloadPath)
      if (p) { setDownloadPath(p); saveGeneral('downloadPath', p) }
    }
  }

  // ===== Image Model CRUD =====
  const imgSelectModel = (idx: number) => {
    setImgSelectedIdx(idx)
    setImgShowAdd(false)
    setImgDraft({ ...emptyModel })
    setImgDraftIdx(null)
  }
  const imgNewModel = () => {
    setImgSelectedIdx(-1)
    setImgShowAdd(true)
    setImgDraft({ ...emptyModel })
    setImgDraftIdx(null)
  }
  const imgEditExisting = () => {
    if (imgSelectedIdx < 0 || imgSelectedIdx >= imgModels.length) return
    setImgShowAdd(false)
    setImgDraft({ ...imgModels[imgSelectedIdx] })
    setImgDraftIdx(imgSelectedIdx)
  }
  const imgSaveDraft = () => {
    if (!imgDraft.name.trim() || !imgDraft.modelName.trim()) return
    let updated: CustomModel[]
    if (imgDraftIdx !== null) {
      updated = [...imgModels]
      updated[imgDraftIdx] = { ...imgDraft }
      setImgSelectedIdx(imgDraftIdx)
    } else {
      updated = [...imgModels, { ...imgDraft }]
      setImgSelectedIdx(updated.length - 1)
    }
    setImgModels(updated)
    setImgDraft({ ...emptyModel })
    setImgDraftIdx(null)
    setImgShowAdd(false)
    onSave(updated)
  }
  const imgRemove = (idx: number) => {
    const updated = imgModels.filter((_, i) => i !== idx)
    setImgModels(updated)
    if (imgSelectedIdx === idx) {
      if (updated.length > 0) setImgSelectedIdx(Math.min(idx, updated.length - 1))
      else { setImgSelectedIdx(-1); setImgShowAdd(false) }
    } else if (imgSelectedIdx > idx) {
      setImgSelectedIdx(imgSelectedIdx - 1)
    }
    onSave(updated)
  }
  const imgCancelEdit = () => {
    setImgDraft({ ...emptyModel })
    setImgDraftIdx(null)
    if (imgShowAdd) {
      setImgShowAdd(false)
      if (imgModels.length > 0) setImgSelectedIdx(0)
    } else {
      // revert to viewing mode
    }
  }

  // ===== Agent Model CRUD (per provider) =====
  const agToggleModel = (name: string) => {
    setAgCheckedModels(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const agAddCheckedModels = () => {
    if (agCheckedModels.size === 0) return
    const existingNames = new Set(providerAgentModels.map(m => m.modelName))
    const newModels: AgentModel[] = [...agCheckedModels]
      .filter(name => !existingNames.has(name))
      .map(name => ({
        id: generateId(),
        providerId: agProviderId,
        apiKey: agApiKey.trim(),
        modelName: name,
        displayName: undefined,
      }))
    if (newModels.length === 0) return
    setAgentModels([...agentModels, ...newModels])
    setAgCheckedModels(new Set())
  }

  const agRemoveModel = (modelId: string) => {
    setAgentModels(agentModels.filter(m => m.id !== modelId))
  }

  const agTestConnection = async () => {
    if (!agProviderId || !agApiKey.trim()) return
    setAgProbeMode('test'); setAgProbeResult(null)
    try {
      const provider = AGENT_PROVIDERS.find(p => p.id === agProviderId)
      if (!provider || !provider.endpoint) throw new Error('未知提供商端点')
      const baseUrl = provider.endpoint.replace(/\/chat\/completions\/?$/, '')
      const resp = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${agApiKey.trim()}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setAgProbeResult('✅ 连接成功')
      setTimeout(() => setAgProbeResult(null), 3000)
    } catch (err: any) {
      setAgProbeResult(`⚠ ${err.message}`)
    } finally { setAgProbeMode(null) }
  }

  const agFetchModels = async () => {
    if (!agProviderId || !agApiKey.trim()) return
    setAgProbeMode('fetch'); setAgProbeResult(null)
    try {
      const list = await fetchProviderModels(agProviderId, agApiKey.trim())
      setAgFetchedModels(list)
      // Pre-check already configured models for this provider
      const existingNames = new Set(agentModels.filter(m => m.providerId === agProviderId).map(m => m.modelName))
      setAgCheckedModels(new Set(list.filter(name => existingNames.has(name))))
      setAgProbeResult(`✅ 拉取成功，${list.length} 个模型可用`)
      setTimeout(() => setAgProbeResult(null), 3000)
    } catch (err: any) {
      setAgProbeResult(`⚠ ${err.message}`)
    } finally { setAgProbeMode(null) }
  }

  const agSaveAll = async () => {
    await saveAgentModels(agentModels)
    window.dispatchEvent(new CustomEvent('agent-models-changed'))
    setAgSavedText('已保存')
    setTimeout(() => setAgSavedText(''), 2000)
  }

  // Custom model: add single
  const [agCustomModelName, setAgCustomModelName] = useState('')
  const agAddCustomModel = () => {
    if (!agCustomModelName.trim()) return
    const exists = agentModels.find(m => m.providerId === agProviderId && m.modelName === agCustomModelName.trim())
    if (exists) return
    setAgentModels([...agentModels, {
      id: generateId(),
      providerId: agProviderId,
      apiKey: agApiKey.trim(),
      modelName: agCustomModelName.trim(),
      displayName: undefined,
    }])
    setAgCustomModelName('')
  }

  // ===== Shortcuts =====
  useEffect(() => {
    if (!recordingTarget) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      const combo = eventToCombo(e)
      if (combo) {
        recordingComboRef.current = combo
        const existing = Object.entries(shortcuts).find(([k, v]) => k === combo && v !== recordingTarget)
        if (existing) {
          setShortcuts(prev => { const next = { ...prev }; delete next[combo]; next[combo] = recordingTarget; return next })
        } else {
          setShortcuts(prev => ({ ...prev, [combo]: recordingTarget }))
        }
        setRecordingTarget(null)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recordingTarget, shortcuts])

  const saveShortcuts = useCallback(async (bindings: ShortcutBindings) => {
    if (window.electronAPI) await window.electronAPI.setStore(STORAGE_KEY, bindings)
  }, [])

  // ===== Tab definitions =====
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: '通用', icon: <Settings2 size={16} /> },
    { id: 'image-models', label: '生图模型', icon: <Image size={16} /> },
    { id: 'agent-models', label: '智能体模型', icon: <Bot size={16} /> },
    { id: 'tavily', label: 'Tavily', icon: <Search size={16} /> },
    { id: 'shortcuts', label: '快捷键', icon: <Command size={16} /> },
    { id: 'about', label: '关于', icon: <Info size={16} /> },
  ]

  // ===== Render helpers =====
  const isEditingImg = imgDraftIdx !== null || imgShowAdd

  // currently viewing (not editing) image model
  const viewingImg = (!isEditingImg && imgSelectedIdx >= 0 && imgSelectedIdx < imgModels.length)
    ? imgModels[imgSelectedIdx] : null

  return (
      <div className="settings-panel">
        <div className="settings-panel-body">
          {/* ---- Sidebar ---- */}
          <div className="settings-tabs">
            <button className="settings-back-btn" onClick={onClose}>
              <ArrowLeft size={16} />
              <span>返回</span>
            </button>
            <div className="settings-tabs-divider" />
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </div>
            ))}
          </div>

          {/* ---- Content ---- */}
          <div className="settings-content">
            {/* ========== 通用 ========== */}
            {activeTab === 'general' && (
              <>
                <div className="settings-section-card">
                  <div className="settings-section-title">基础设置</div>
                  <div className="setting-row">
                    <div>
                      <div className="setting-row-label">启动时显示主页</div>
                      <div className="setting-row-desc">打开软件时直接显示主页</div>
                    </div>
                    <div
                      className={`settings-toggle${showHome ? ' on' : ''}`}
                      onClick={() => { setShowHome(!showHome); saveGeneral('showHomeOnStartup', !showHome) }}
                    />
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="setting-row-label">启动时检查更新</div>
                      <div className="setting-row-desc">自动从 Gitee 检测是否有新版本</div>
                    </div>
                    <div
                      className={`settings-toggle${checkUpdate ? ' on' : ''}`}
                      onClick={() => { setCheckUpdate(!checkUpdate); saveGeneral('checkUpdate', !checkUpdate) }}
                    />
                  </div>
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '10px 0' }} />
                  <div className="setting-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div className="setting-row-label">默认下载路径</div>
                      <div className="setting-row-desc">图片、文件等资源将下载到此目录</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="input-base"
                        style={{ width: 200, fontSize: 12, cursor: 'default' }}
                        value={downloadPath}
                        readOnly
                      />
                      <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }} onClick={pickFolder}>
                        <FolderOpen size={14} /> 选择
                      </button>
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '10px 0' }} />
                  <div className="setting-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 80 }}>
                      <div className="setting-row-label">地区</div>
                      <div className="setting-row-desc">用于天气查询，自动保存</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, flex: 1 }}>
                      <div>
                        <select className="input-base" value={cityProvince} onChange={e => onProvinceChange(e.target.value)} style={{ fontSize: 11 }}>
                          <option value="">省份</option>
                          {getSortedProvinces().map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <select className="input-base" value={city} onChange={e => onCityChange(e.target.value)} disabled={!cityProvince} style={{ fontSize: 11 }}>
                          <option value="">城市</option>
                          {cityList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <select className="input-base" value={district} onChange={e => onDistrictChange(e.target.value)} disabled={!city || districtList.length === 0} style={{ fontSize: 11 }}>
                          <option value="">区县</option>
                          {districtList.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-section-card">
                  <div className="settings-section-title">桌面行为</div>
                  <div className="setting-row">
                    <div>
                      <div className="setting-row-label">开机自动启动</div>
                      <div className="setting-row-desc">登录系统时自动启动 AI Web Tools</div>
                    </div>
                    <div
                      className={`settings-toggle${autoLaunch ? ' on' : ''}`}
                      onClick={async () => {
                        const next = !autoLaunch
                        setAutoLaunch(next)
                        saveGeneral('autoLaunch', next)
                        await window.electronAPI?.setAutoLaunch(next)
                        if (!next) { setStartMinimized(false); saveGeneral('startMinimized', false); await window.electronAPI?.setStartMinimized(false) }
                      }}
                    />
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="setting-row-label">启动后最小化</div>
                      <div className="setting-row-desc">{autoLaunch ? '开机自启后最小化到托盘，不弹出窗口' : '需先开启「开机自动启动」'}</div>
                    </div>
                    <div
                      className={`settings-toggle${startMinimized ? ' on' : ''}`}
                      style={!autoLaunch ? { opacity: .4 } : undefined}
                      onClick={async () => {
                        if (!autoLaunch) return
                        const next = !startMinimized
                        setStartMinimized(next)
                        saveGeneral('startMinimized', next)
                        await window.electronAPI?.setStartMinimized(next)
                      }}
                    />
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="setting-row-label">关闭时最小化到托盘</div>
                      <div className="setting-row-desc">点击关闭按钮时不退出，最小化到系统托盘</div>
                    </div>
                    <div
                      className={`settings-toggle${closeToTray ? ' on' : ''}`}
                      onClick={async () => {
                        const next = !closeToTray
                        setCloseToTray(next)
                        saveGeneral('closeToTray', next)
                        await window.electronAPI?.setCloseToTray(next)
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ========== 生图模型（双栏）========== */}
            {activeTab === 'image-models' && (
              <div className="model-layout">
                {/* Left: model provider list */}
                <div className="model-list">
                  {imgModels.map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`model-item${imgSelectedIdx === i && !imgShowAdd ? ' active' : ''}`}
                      onClick={() => imgSelectModel(i)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.modelName}</div>
                      </div>
                      {m.apiKey ? <Key size={12} style={{ color: 'var(--success)', flexShrink: 0 }} /> : null}
                    </button>
                  ))}
                  <button type="button" className="model-add-btn" onClick={imgNewModel}>
                    <Plus size={14} />
                    <span>添加生图模型</span>
                  </button>
                </div>

                {/* Right: detail / edit form */}
                <div className="model-detail">
                  {!isEditingImg && viewingImg ? (
                    /* View mode */
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{viewingImg.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{viewingImg.modelName}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={imgEditExisting}><Pencil size={14} /> 编辑</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => imgRemove(imgSelectedIdx)} style={{ color: '#f87171' }}><Trash2 size={14} /> 删除</button>
                      </div>
                      <div className="model-field">
                        <div className="model-field-label">接口地址</div>
                        <div className="model-field-value">{viewingImg.endpoint || '(未设置)'}</div>
                      </div>
                      <div className="model-field">
                        <div className="model-field-label">API Key</div>
                        <div className="model-field-value">{viewingImg.apiKey ? '••••••••' + viewingImg.apiKey.slice(-4) : '(未设置)'}</div>
                      </div>
                    </div>
                  ) : (
                    /* Edit / Add mode */
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {imgDraftIdx !== null ? '编辑模型' : '添加生图模型'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label className="label">名称</label>
                          <input className="input-base" value={imgDraft.name} onChange={e => setImgDraft({ ...imgDraft, name: e.target.value })} placeholder="例: SiliconFlow 生图" />
                        </div>
                        <div>
                          <label className="label">模型名称</label>
                          <input className="input-base" value={imgDraft.modelName} onChange={e => setImgDraft({ ...imgDraft, modelName: e.target.value })} placeholder="stabilityai/stable-diffusion-3-5-large" style={{ fontFamily: 'var(--font-mono)' }} />
                        </div>
                        <div>
                          <label className="label">接口地址</label>
                          <input className="input-base" value={imgDraft.endpoint} onChange={e => setImgDraft({ ...imgDraft, endpoint: e.target.value })} placeholder="https://api.siliconflow.cn/v1/images/generations" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                        </div>
                        <div>
                          <label className="label">API Key</label>
                          <input className="input-base" type="password" value={imgDraft.apiKey} onChange={e => setImgDraft({ ...imgDraft, apiKey: e.target.value })} placeholder="sk-..." />
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>密钥仅本地存储</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button className="btn btn-primary btn-sm" onClick={imgSaveDraft} disabled={!imgDraft.name.trim() || !imgDraft.modelName.trim()}>
                          {imgDraftIdx !== null ? '更新' : '添加'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={imgCancelEdit}>取消</button>
                      </div>
                    </div>
                  )}

                  {!isEditingImg && imgModels.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 13 }}>
                      选择左侧模型查看详情，或点击「添加生图模型」创建
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========== 智能体模型（双栏）========== */}
            {activeTab === 'agent-models' && (
              <div className="model-layout">
                {/* Left: configured provider list */}
                <div className="model-list">
                  {configuredProviders.map(p => {
                    const count = agentModels.filter(m => m.providerId === p.id).length
                    const active = agProviderId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`model-item${active ? ' active' : ''}`}
                        onClick={() => setAgProviderId(p.id)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name.split(' ')[0]}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{count} 个模型</div>
                        </div>
                      </button>
                    )
                  })}
                  {configuredProviders.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 12 }}>
                      暂无已配置的供应商
                    </div>
                  )}

                  {/* Add provider dropdown */}
                  {unconfiguredProviders.length > 0 && (
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <button
                        type="button"
                        className="model-add-btn"
                        onClick={() => setAgAddMenuOpen(v => !v)}
                      >
                        <Plus size={14} />
                        <span>添加供应商</span>
                        <ChevronDown size={12} />
                      </button>
                      {agAddMenuOpen && (
                        <>
                          <div
                            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                            onClick={() => setAgAddMenuOpen(false)}
                          />
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20,
                            border: '1px solid var(--border-color)', borderRadius: 10,
                            background: 'var(--bg-primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            padding: 4, maxHeight: 260, overflowY: 'auto',
                          }}>
                            {unconfiguredProviders.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                className="model-item"
                                onClick={() => {
                                  setAgProviderId(p.id)
                                  setAgAddMenuOpen(false)
                                }}
                                style={{ width: '100%' }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: provider config */}
                <div className="model-detail">
                  {agProviderId ? (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                        {AGENT_PROVIDERS.find(p => p.id === agProviderId)?.name || agProviderId}
                      </div>

                      {/* Endpoint / Base URL */}
                      {!isAgCustom && (() => {
                        const ep = AGENT_PROVIDERS.find(p => p.id === agProviderId)?.endpoint || ''
                        const baseUrl = ep.replace(/\/chat\/completions\/?$/, '')
                        return (
                          <div style={{ marginBottom: 14 }}>
                            <div className="model-field-label">接口地址</div>
                            <div className="endpoint-display">{baseUrl || '(未设置)'}</div>
                          </div>
                        )
                      })()}

                      {/* API Key + buttons */}
                      <div style={{ marginBottom: 12 }}>
                        <label className="label">API 密钥</label>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input
                            className="input-base"
                            type="password"
                            value={agApiKey}
                            onChange={e => setAgApiKey(e.target.value)}
                            placeholder="输入 API Key..."
                            style={{ flex: 1 }}
                          />
                          <button
                            className="probe-btn"
                            onClick={agTestConnection}
                            disabled={agProbeMode !== null || !agProviderId || !agApiKey.trim()}
                          >
                            {agProbeMode === 'test' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <PlugZap size={12} />}
                            测试连接
                          </button>
                          {!isAgCustom && (
                            <button
                              className="probe-btn"
                              onClick={agFetchModels}
                              disabled={agProbeMode !== null || !agProviderId || !agApiKey.trim()}
                            >
                              {agProbeMode === 'fetch' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
                              拉取模型
                            </button>
                          )}
                        </div>
                        {agProbeResult && (
                          <div style={{
                            fontSize: 10, marginTop: 4,
                            color: agProbeResult.startsWith('✅') ? 'var(--success)' : '#f87171',
                          }}>
                            {agProbeResult}
                          </div>
                        )}
                      </div>

                      {/* Fetched models (non-custom providers) */}
                      {!isAgCustom && agFetchedModels.length > 0 && (
                        <div style={{ marginBottom: 14, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>可用模型 ({agFetchedModels.length})</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>勾选后点击下方按钮添加已配置模型</span>
                          </div>
                          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, padding: 6, background: 'var(--bg-page)', marginBottom: 8 }}>
                            {agFetchedModels.map(name => (
                              <label
                                key={name}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <input type="checkbox" checked={agCheckedModels.has(name)} onChange={() => agToggleModel(name)} />
                                <span style={{ color: agCheckedModels.has(name) ? 'var(--success)' : 'var(--text-primary)' }}>{name}</span>
                              </label>
                            ))}
                          </div>
                          {agCheckedModels.size > 0 && (
                            <button className="btn btn-primary btn-sm" onClick={agAddCheckedModels}>
                              <Plus size={12} /> 添加选中模型 ({agCheckedModels.size})
                            </button>
                          )}
                        </div>
                      )}

                      {/* Custom model input */}
                      {isAgCustom && (
                        <div style={{ marginBottom: 14, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>添加模型</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              className="input-base"
                              value={agCustomModelName}
                              onChange={e => setAgCustomModelName(e.target.value)}
                              placeholder="模型 ID，如 gpt-3.5-turbo"
                              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                              onKeyDown={e => { if (e.key === 'Enter') agAddCustomModel() }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={agAddCustomModel} disabled={!agCustomModelName.trim()}>
                              <Plus size={12} /> 添加
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Configured models for this provider */}
                      {providerAgentModels.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                            已配置模型 ({providerAgentModels.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {providerAgentModels.map(m => (
                              <span key={m.id} className="model-chip">
                                {m.modelName}
                                <button className="model-chip-del" onClick={() => agRemoveModel(m.id)} title={`删除 ${m.modelName}`}>
                                  <X size={10} strokeWidth={2.5} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Save all */}
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="btn btn-primary" onClick={agSaveAll}>
                          保存智能体模型
                        </button>
                        {agSavedText && <span style={{ fontSize: 11, color: 'var(--success)' }}>{agSavedText}</span>}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 13 }}>
                      {configuredProviders.length > 0 ? '请从左侧选择一个供应商' : '请点击下方「添加供应商」开始配置'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========== Tavily ========== */}
            {activeTab === 'tavily' && (
              <div className="glass-card" style={{ padding: 16, maxWidth: 500 }}>
                <div>
                  <label className="label">Tavily API Key（可选）</label>
                  <input
                    className="input-base"
                    type="password"
                    value={tavilyKey}
                    onChange={e => setTavilyKey(e.target.value)}
                    placeholder="tvly-xxxxxxxxxx"
                    style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    用于提升联网搜索质量。不填则使用内置免费搜索源。密钥仅本地存储。
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      localStorage.setItem('agent_tavily_key', tavilyKey.trim())
                      if (window.electronAPI) window.electronAPI.setStore('agent_tavily_key', tavilyKey.trim())
                      setTavilySaved(true); setTimeout(() => setTavilySaved(false), 2000)
                    }}
                  >保存</button>
                  {tavilySaved && <span style={{ fontSize: 11, color: 'var(--success)' }}>✅ 已保存</span>}
                </div>
              </div>
            )}

            {/* ========== 快捷键 ========== */}
            {activeTab === 'shortcuts' && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  点击快捷键区域，然后按下键盘组合键来录制。支持 Alt、Ctrl、Shift、Meta 修饰键。
                </div>
                {recordingTarget && (
                  <div style={{
                    marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius)',
                    background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span>🎹 正在录制 {SHORTCUT_TARGETS.find(t => t.id === recordingTarget)?.label || recordingTarget} 的快捷键... 请按下组合键</span>
                    <button className="btn btn-sm" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }} onClick={() => setRecordingTarget(null)}>取消</button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {SHORTCUT_TARGETS.map(target => {
                    const entry = Object.entries(shortcuts).find(([, v]) => v === target.id)
                    const currentCombo = entry ? entry[0] : null
                    const isRecording = recordingTarget === target.id
                    return (
                      <div key={target.id} className="glass-card" style={{
                        padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderColor: isRecording ? 'var(--accent)' : undefined,
                      }}>
                        <span style={{ fontSize: 13 }}>{target.label}</span>
                        <div
                          onClick={() => {
                            if (isRecording) { setRecordingTarget(null); return }
                            if (currentCombo) { setShortcuts(prev => { const n = { ...prev }; delete n[currentCombo]; return n }) }
                            setRecordingTarget(target.id)
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px',
                            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            background: isRecording ? 'var(--accent)' : 'var(--bg-primary)',
                            color: isRecording ? '#fff' : currentCombo ? 'var(--accent)' : 'var(--text-muted)',
                            border: `1px solid ${isRecording ? 'var(--accent)' : 'var(--border-color)'}`,
                            fontSize: 12, fontWeight: isRecording ? 600 : 500,
                            minWidth: 100, justifyContent: 'center', transition: 'all 0.15s',
                          }}
                        >
                          {isRecording ? '按下按键...' : currentCombo ? comboSegments(currentCombo).map((seg, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {i > 0 && <span style={{ opacity: 0.5 }}>+</span>}
                              <span style={{ background: 'rgba(99,102,241,0.15)', padding: '2px 6px', borderRadius: 3, fontWeight: 600, fontSize: 11 }}>{seg}</span>
                            </span>
                          )) : '未设置'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={() => { saveShortcuts(shortcuts); setShortcutSaved(true); setTimeout(() => setShortcutSaved(false), 2000) }}>保存快捷键</button>
                  <button className="btn btn-ghost" onClick={() => { setShortcuts({ ...DEFAULT_SHORTCUTS }); saveShortcuts(DEFAULT_SHORTCUTS) }}>恢复默认</button>
                  {shortcutSaved && <span style={{ fontSize: 11, color: 'var(--success)' }}>✅ 已保存</span>}
                </div>
              </>
            )}

            {/* ========== 关于 ========== */}
            {activeTab === 'about' && (
              <div className="about-section">
                <div className="about-version">v{__APP_VERSION__}</div>
                <div className="about-desc">AI Web Tools — 多平台 AI 工具聚合客户端</div>
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <div className="setting-row" style={{ width: '100%', maxWidth: 400 }}>
                    <div>
                      <div className="setting-row-label">当前版本</div>
                      <div className="setting-row-desc">已是最新版本</div>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--success)' }}>v{__APP_VERSION__}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-ghost" onClick={() => {
                      if (window.electronAPI) window.electronAPI.openExternal('https://github.com/ydd070622/AI-Web-Tools')
                      else window.open('https://github.com/ydd070622/AI-Web-Tools', '_blank')
                    }}>查看 GitHub</button>
                    <button className="btn btn-ghost" onClick={() => {
                      if (window.electronAPI) window.electronAPI.openExternal('https://gitee.com/ydd070622/ai-web-tools')
                      else window.open('https://gitee.com/ydd070622/ai-web-tools', '_blank')
                    }}>查看 Gitee</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}
