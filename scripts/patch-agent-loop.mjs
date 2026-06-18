import * as fs from 'fs';

const f = 'e:/04-AI_tools/03-projects/AI_Web_Tools/src/services/agent-loop.ts';
let c = fs.readFileSync(f, 'utf8');

const oldCode = `const [customModels, platformToken] = await Promise.all([
        api.getStore('customModels') as Promise<any>,
        api.getStore('dsPlatformToken') as Promise<any>,
      ])

      // Extract DeepSeek API key from customModels
      let apiKey = ''
      if (Array.isArray(customModels)) {
        const ds = customModels.find((m: any) => m.name?.toLowerCase().includes('deepseek') || m.modelName?.toLowerCase().includes('deepseek'))
        if (ds?.apiKey) apiKey = ds.apiKey
      }`;

const newCode = `const [dsApiKey, platformToken] = await Promise.all([
        api.getStore('dsApiKey') as Promise<any>,
        api.getStore('dsPlatformToken') as Promise<any>,
      ])

      // Use dedicated dsApiKey store
      const apiKey = typeof dsApiKey === 'string' ? dsApiKey : ''`;

if (!c.includes(oldCode)) {
  console.log('ERROR: old code not found');
  process.exit(1);
}

c = c.replace(oldCode, newCode);
fs.writeFileSync(f, c);
console.log('done');
