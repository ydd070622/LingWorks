import Platforms from './Platforms'
import Recharge from './Recharge'

interface PlatformCenterProps {
  autoOpenPlatform?: string | null
  onPlatformOpened?: () => void
}

export default function PlatformCenter({ autoOpenPlatform, onPlatformOpened }: PlatformCenterProps) {
  return (
    <div className="platform-center">
      <div className="platform-center-zone">
        <Platforms autoOpenPlatform={autoOpenPlatform} onPlatformOpened={onPlatformOpened} />
      </div>
      <div className="platform-center-zone">
        <Recharge />
      </div>
    </div>
  )
}
