export interface Platform {
  id: string
  name: string
  url: string
  color: string
}

export const platforms: Platform[] = [
  { id: 'bigmodel', name: '智谱AI', url: 'https://www.bigmodel.cn', color: '#1a73e8' },
  { id: 'kimi', name: 'Kimi', url: 'https://www.kimi.com/code', color: '#6c5ce7' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com', color: '#4f46e5' },
  { id: 'minimaxi', name: 'MiniMax', url: 'https://platform.minimaxi.com', color: '#0891b2' },
  { id: 'siliconflow', name: 'SiliconFlow', url: 'https://cloud.siliconflow.cn', color: '#0d9488' },
  { id: 'bailian', name: '阿里云百炼', url: 'https://bailian.console.aliyun.com/cn-beijing#/home', color: '#ff6a00' },
  { id: 'tavily', name: 'Tavily', url: 'https://auth.tavily.com/', color: '#10b981' },
  { id: 'volcengine', name: '火山引擎', url: 'https://signin.volcengine.com/auth/login?redirectURI=https%3A%2F%2Fconsole.volcengine.com%2Fark%2Fregion%3Aark%2Bcn-beijing%2FopenManagement%3FLLM%3D%257B%257D%26advancedActiveKey%3Dsubscribe', color: '#ee4823' },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai', color: '#6366f1' },
]
