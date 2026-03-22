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
      <button
        onClick={() => navigate('/ops/schedule')}
        style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid #2a2a2a',
            borderRadius: 'var(--border-radius)',
            cursor: 'pointer',
            fontWeight: 600,
            marginLeft: '0.75rem',
        }}
        >
        View Schedule
        </button>
        <button
        onClick={() => navigate('/ops/movements')}
        style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: 'rgba(217,64,64,0.1)',
            color: 'var(--color-danger)',
            border: '1px solid rgba(217,64,64,0.3)',
            borderRadius: 'var(--border-radius)',
            cursor: 'pointer',
            fontWeight: 600,
            marginLeft: '0.75rem',
        }}
        >
        Movement Control
        </button>
    </div>
  )
}