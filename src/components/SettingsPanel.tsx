interface Props { onClose: () => void; }

export default function SettingsPanel({ onClose }: Props) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 20000,
    }}>
      <div style={{
        background: '#1e1e2e', borderRadius: 20, padding: 32,
        width: 420, position: 'relative',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', color: '#888',
          fontSize: 20, cursor: 'pointer',
        }}>x</button>
        <h2 style={{ color: '#e0e0e0', marginBottom: 16 }}>Settings</h2>
        <p style={{ color: '#888' }}>Settings panel coming soon.</p>
      </div>
    </div>
  );
}
