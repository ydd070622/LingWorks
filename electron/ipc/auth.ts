/**
 * Auth IPC — DeepSeek login via embedded BrowserWindow + token extraction
 */
import { ipcMain, BrowserWindow } from 'electron'

export function registerAuth() {
  ipcMain.handle('ds-login', async () => {
    return new Promise<string | null>((resolve) => {
      const loginWin = new BrowserWindow({
        width: 480, height: 720,
        title: 'DeepSeek 登录 - 登录成功后自动关闭',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })

      let resolved = false

      // Inject JS to hook fetch/XHR and capture Bearer token
      const injectHook = () => {
        if (resolved) return
        loginWin.webContents.executeJavaScript(`
          (function(){
            if (window.__dsm_hook__) return;
            window.__dsm_hook__ = true;
            function deliver(token) {
              if (!token || typeof token !== 'string' || token.length < 20) return;
              document.title = 'DSM_TOKEN:' + token;
            }
            function fromAuth(val) {
              var m = /Bearer\\s+(\\S+)/i.exec(String(val));
              if (m && m[1]) deliver(m[1]);
            }
            var origFetch = window.fetch;
            if (typeof origFetch === 'function') {
              window.fetch = function(input, init) {
                try {
                  var h = (init && init.headers) || (input && input.headers);
                  if (h) {
                    if (h instanceof Headers) fromAuth(h.get('authorization'));
                    else if (typeof h === 'object') {
                      for (var k in h) if (k.toLowerCase()==='authorization') fromAuth(h[k]);
                    }
                  }
                } catch(e){}
                return origFetch.apply(this, arguments);
              };
            }
            var orig = XMLHttpRequest.prototype.setRequestHeader;
            XMLHttpRequest.prototype.setRequestHeader = function(name, val) {
              if (name && String(name).toLowerCase()==='authorization') fromAuth(val);
              return orig.apply(this, arguments);
            };
          })();
        `).catch(() => {})
      }

      // Poll for token via localStorage (primary) and document.title (injected hook)
      let attempts = 0
      const tryExtract = () => {
        if (resolved) return
        attempts++
        loginWin.webContents.executeJavaScript(`
          (function(){
            try { var t = JSON.parse(localStorage.userToken || '{}').value; if (t) return t; } catch(e){}
            var title = document.title;
            if (title.startsWith('DSM_TOKEN:')) return title.slice(10);
            return null;
          })()
        `).then((token: string | null) => {
          if (token && token.length > 20) {
            resolved = true
            loginWin.close()
            resolve(token)
          } else if (attempts < 90 && !resolved) {
            setTimeout(tryExtract, 2000)
          }
        }).catch(() => {
          if (attempts < 90 && !resolved) setTimeout(tryExtract, 2000)
        })
      }

      loginWin.webContents.on('did-finish-load', () => {
        injectHook()
        setTimeout(tryExtract, 2000)
      })

      loginWin.webContents.on('did-navigate', (_e: any, url: string) => {
        if (url.includes('platform.deepseek.com')) {
          injectHook()
        }
      })

      loginWin.on('closed', () => { if (!resolved) resolve(null) })
      loginWin.loadURL('https://platform.deepseek.com/usage')
    })
  })
}
