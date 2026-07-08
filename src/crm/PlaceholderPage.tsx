export default function PlaceholderPage({ title, emoji }: { title: string; emoji: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 48 }}>{emoji}</div>
      <div style={{ fontSize: 16, color: '#9ca3af', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#4b5563' }}>功能开发中…</div>
    </div>
  )
}
