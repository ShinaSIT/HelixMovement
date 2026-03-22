import { useNavigate } from 'react-router-dom'

export default function OpsDashboard() {
  const user = JSON.parse(localStorage.getItem('helix_user'))
  const navigate = useNavigate()

  return (
    <div style={{ padding: '2rem', color: 'var(--color-text)' }}>
      <h1 style={{ color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
        Ops Dashboard
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
        Welcome, {user?.name}
      </p>

      <button
        onClick={() => navigate('/ops/upload')}
        style={{
          padding: '0.75rem 1.25rem',
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--border-radius)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Upload CSV Data
      </button>
    </div>
  )
}