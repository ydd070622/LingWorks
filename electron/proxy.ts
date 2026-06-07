import * as http from 'http'
import * as https from 'https'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

let server: http.Server | null = null
const PORT = 19384

interface ProviderConfig {
  id: string
  apiKey: string
  endpoint: string
  models: { id: string; enabled: boolean }[]
}

function loadProviders(): ProviderConfig[] {
  try {
    const p = path.join(app.getPath('userData'), 'config.json')
    if (!fs.existsSync(p)) return []
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return data.apiProviders || []
  } catch { return [] }
}

function loadMasterKey(): string {
  try {
    const p = path.join(app.getPath('userData'), 'config.json')
    if (!fs.existsSync(p)) return ''
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return data.apiMasterKey || ''
  } catch { return '' }
}

function parseUrl(raw: string): { host: string; port: number; path: string; https: boolean } {
  const u = new URL(raw)
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port) : (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    https: u.protocol === 'https:',
  }
}

export function startProxy() {
  if (server) return

  server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', providers: loadProviders().filter(p => p.apiKey).map(p => p.id) }))
      return
    }

    // Auth check
    const masterKey = loadMasterKey()
    if (masterKey && req.headers.authorization !== `Bearer ${masterKey}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
      return
    }

    // Proxy API calls
    if (req.method === 'POST' && req.url?.startsWith('/v1/')) {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        let model = ''
        try { model = JSON.parse(body).model || '' } catch {}

        const providers = loadProviders()
        if (!model) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'model field is required' } }))
          return
        }

        // Find provider
        let target: { key: string; url: string } | null = null
        for (const p of providers) {
          if (!p.apiKey) continue
          const match = p.models.find(m => m.id === model && m.enabled !== false)
          if (match) {
            target = { key: p.apiKey, url: p.endpoint + req.url! }
            break
          }
        }

        if (!target) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: `model "${model}" not found in any configured provider` } }))
          return
        }

        const upstream = parseUrl(target.url)
        const proxyReq = (upstream.https ? https : http).request({
          host: upstream.host,
          port: upstream.port,
          path: upstream.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${target.key}`,
            'Content-Length': Buffer.byteLength(body),
          },
          rejectUnauthorized: false,
        }, proxyRes => {
          res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json' })
          proxyRes.pipe(res)
        })

        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'upstream connection failed' } }))
        })

        proxyReq.write(body)
        proxyReq.end()
      })
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Proxy] API proxy running on http://127.0.0.1:${PORT}`)
  })
}

export function stopProxy() {
  if (server) {
    server.close()
    server = null
  }
}
