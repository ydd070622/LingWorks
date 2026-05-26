export interface RechargePlatform {
  id: string
  name: string
  url: string
  color: string
}

export const rechargePlatforms: RechargePlatform[] = [
  { id: 'bewild', name: 'Bewild', url: 'https://bewild.ai/', color: '#8b5cf6' },
  { id: 'juzixp', name: '桔子XP', url: 'https://juzixp.com/', color: '#f59e0b' },
  { id: 'store9981', name: '9981Store', url: 'https://www.9981store.com/', color: '#22c55e' },
]
