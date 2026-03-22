import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [telehandle, setTelehandle] = useState('')
  const [passkey, setPasskey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')

    if (!telehandle.trim()) return setError('Enter your Telegram handle.')
    if (passkey.length !== 4) return setError('Passkey must be 4 digits.')

    setLoading(true)

    const cleanHandle = telehandle.replace('@', '').trim().toLowerCase()
    console.log('Attempting login for:', cleanHandle)

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, name, system_role, passkey_hash, is_active')
      .eq('telehandle', cleanHandle)
      .single()

    console.log('User data:', user)
    console.log('Fetch error:', fetchError)

    if (fetchError || !user) {
      setLoading(false)
      return setError('Account not found. Check your Telegram handle.')
    }

    if (!user.is_active) {
      setLoading(false)
      return setError('Your account has been deactivated. Contact your OC.')
    }

    console.log('Passkey entered:', passkey)
    console.log('Passkey stored:', user.passkey_hash)
    console.log('Match:', user.passkey_hash === passkey)

    if (user.passkey_hash !== passkey) {
      setLoading(false)
      return setError('Wrong passkey. Try again.')
    }

    localStorage.setItem('helix_user', JSON.stringify({
      id: user.id,
      name: user.name,
      system_role: user.system_role,
    }))

    const roleRoutes = {
      ops_admin:     '/ops',
      ops_viewer:    '/ops',
      alliance_head: '/alliance',
      facilitator:   '/facilitator',
      game_master:   '/gamemaster',
      gm_head:       '/gamemaster',
      public:        '/leaderboard',
    }

    window.location.href = roleRoutes[user.system_role] ?? '/login'
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      padding: '1.5rem',
      backgroundColor: 'var(--color-background)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            letterSpacing: '-0.02em',
            marginBottom: '0.25rem',
          }}>
            Helix
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            SIT First Year Experience
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Telehandle */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Telegram Handle
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
                fontSize: '0.95rem',
              }}>@</span>
              <input
                type="text"
                placeholder="yourusername"
                value={telehandle}
                autoComplete="off"
                onChange={e => setTelehandle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 1.75rem',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid #2a2a2a',
                  borderRadius: 'var(--border-radius)',
                  color: 'var(--color-text)',
                  fontSize: '1rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Passkey */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              4-Digit Passkey
            </label>
            <input
              type="password"
              placeholder="••••"
              maxLength={4}
              value={passkey}
              autoComplete="new-password"
              onChange={e => setPasskey(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid #2a2a2a',
                borderRadius: 'var(--border-radius)',
                color: 'var(--color-text)',
                fontSize: '1.5rem',
                letterSpacing: '0.5rem',
                textAlign: 'center',
                outline: 'none',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <p style={{
              color: 'var(--color-danger)',
              fontSize: '0.85rem',
              textAlign: 'center',
            }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              backgroundColor: loading ? 'var(--color-surface)' : 'var(--color-primary)',
              color: loading ? 'var(--color-text-muted)' : '#fff',
              border: 'none',
              borderRadius: 'var(--border-radius)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Checking...' : 'Log In'}
          </button>

          {/* Forgot passkey */}
          <p style={{
            textAlign: 'center',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
          }}>
            Forgot your passkey?{' '}
            <span style={{
              color: 'var(--color-primary)',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}>
              Reset via Telegram
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}