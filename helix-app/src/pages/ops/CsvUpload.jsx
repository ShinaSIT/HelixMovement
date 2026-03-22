import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'

const UPLOAD_STEPS = [
  {
    key: 'alliances',
    label: 'Alliances',
    description: 'alliance_name',
    table: 'alliances',
    requiredColumns: ['alliance_name'],
    displayColumns: ['alliance_name'],
  },
  {
    key: 'suballiances',
    label: 'Suballiances',
    description: 'suballiance_id, suballiance_name, alliance_name',
    table: 'suballiances',
    requiredColumns: ['suballiance_id', 'suballiance_name', 'alliance_name'],
    displayColumns: ['suballiance_id', 'suballiance_name', 'alliance_name'],
  },
  {
    key: 'stations',
    label: 'Stations',
    description: 'station_id, station_name',
    table: 'stations',
    requiredColumns: ['station_id', 'station_name'],
    displayColumns: ['station_id', 'station_name'],
  },
  {
    key: 'activities',
    label: 'Activities',
    description: 'activity_id, activity_name, station_id, day, max_score',
    table: 'activities',
    requiredColumns: ['activity_id', 'activity_name', 'station_id', 'day', 'max_score'],
    displayColumns: ['activity_id', 'activity_name', 'station_id', 'day', 'max_score'],
  },
  {
    key: 'schedule',
    label: 'Schedule',
    description: 'suballiance_id, slot_number, station_id, day, expected_arrival, expected_departure',
    table: 'schedule',
    requiredColumns: ['suballiance_id', 'slot_number', 'station_id', 'day'],
    displayColumns: ['suballiance_id', 'slot_number', 'station_id', 'day', 'expected_arrival', 'expected_departure'],
    needsVersionId: true,
  },
  {
    key: 'manpower',
    label: 'Manpower',
    description: 'name, team, role, telehandle, alliance_name, suballiance_id, station_ids',
    table: 'users',
    requiredColumns: ['name', 'role', 'telehandle'],
    displayColumns: ['name', 'team', 'role', 'telehandle', 'alliance_name', 'suballiance_id'],
  },
]

export default function CsvUpload() {
  const [currentStep, setCurrentStep] = useState(0)
  const [status, setStatus] = useState({})
  const [versionLabel, setVersionLabel] = useState('')
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [existingData, setExistingData] = useState({})
  const [loadingData, setLoadingData] = useState(false)

  const step = UPLOAD_STEPS[currentStep]

  // Load existing data when tab changes
  useEffect(() => {
    loadExistingData(step)
  }, [currentStep])

  async function loadExistingData(step) {
    if (existingData[step.key] !== undefined) return // already loaded
    setLoadingData(true)
    try {
      const { data, error } = await supabase
        .from(step.table)
        .select(step.displayColumns.join(', '))
        .limit(200)
      if (error) throw error
      setExistingData(prev => ({ ...prev, [step.key]: data || [] }))
    } catch {
      setExistingData(prev => ({ ...prev, [step.key]: [] }))
    }
    setLoadingData(false)
  }

  function parseCSV(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(err),
      })
    })
  }

  function validateColumns(data, requiredColumns) {
    if (data.length === 0) return 'CSV is empty.'
    const cols = Object.keys(data[0])
    const missing = requiredColumns.filter(c => !cols.includes(c))
    if (missing.length > 0) return `Missing columns: ${missing.join(', ')}`
    return null
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const data = await parseCSV(file)
      const validationError = validateColumns(data, step.requiredColumns)
      if (validationError) {
        setStatus(prev => ({ ...prev, [step.key]: { state: 'error', message: validationError } }))
        setPreview(null)
        return
      }
      const columns = Object.keys(data[0])
      setPreview({ data, columns, file })
      setStatus(prev => ({ ...prev, [step.key]: null }))
    } catch {
      setStatus(prev => ({ ...prev, [step.key]: { state: 'error', message: 'Failed to parse CSV.' } }))
    }
    e.target.value = ''
  }

  async function handleConfirmUpload() {
    if (!preview) return
    const { data } = preview
    setUploading(true)
    setStatus(prev => ({ ...prev, [step.key]: { state: 'loading', message: 'Uploading...' } }))

    try {
      if (step.key === 'manpower') {
        const userRows = data.map(row => ({
          id: crypto.randomUUID(),
          name: row.name,
          team: row.team || null,
          role: row.role,
          system_role: mapSystemRole(row.role),
          telehandle: row.telehandle.replace('@', '').toLowerCase(),
          alliance_name: row.alliance_name || null,
          suballiance_id: row.suballiance_id || null,
          passkey_hash: '0000',
          is_active: true,
        }))

        const { data: insertedUsers, error: userError } = await supabase
          .from('users')
          .upsert(userRows, { onConflict: 'telehandle' })
          .select('id, telehandle')
        if (userError) throw userError

        const stationRows = []
        for (const row of data) {
          if (!row.station_ids) continue
          const matchedUser = insertedUsers.find(
            u => u.telehandle === row.telehandle.replace('@', '').toLowerCase()
          )
          if (!matchedUser) continue
          const stations = row.station_ids.split('|').map(s => s.trim()).filter(Boolean)
          for (const sid of stations) {
            stationRows.push({ user_id: matchedUser.id, station_id: sid })
          }
        }
        if (stationRows.length > 0) {
          const { error: stationError } = await supabase
            .from('user_stations')
            .upsert(stationRows, { onConflict: 'user_id,station_id' })
          if (stationError) throw stationError
        }

        setStatus(prev => ({ ...prev, [step.key]: { state: 'success', message: `${userRows.length} users uploaded.` } }))
        setPreview(null)
        setExistingData(prev => ({ ...prev, [step.key]: undefined }))
        setTimeout(() => loadExistingData(step), 500)
        setUploading(false)
        return
      }

      let rows = data
      if (step.needsVersionId) {
        const { data: version, error: vErr } = await supabase
          .from('schedule_versions')
          .insert({
            version_number: Date.now(),
            label: versionLabel || 'Uploaded version',
            is_active: true,
            year: new Date().getFullYear(),
          })
          .select()
          .single()
        if (vErr) throw vErr

        rows = data.map(row => ({
          version_id: version.id,
          suballiance_id: row.suballiance_id,
          slot_number: parseInt(row.slot_number),
          station_id: row.station_id,
          day: parseInt(row.day),
          expected_arrival: row.expected_arrival || null,
          expected_departure: row.expected_departure || null,
        }))
      }

      const { error } = await supabase
        .from(step.table)
        .upsert(rows, { onConflict: getConflictColumn(step.key) })
      if (error) throw error

      setStatus(prev => ({ ...prev, [step.key]: { state: 'success', message: `${rows.length} rows uploaded.` } }))
      setPreview(null)
      setExistingData(prev => ({ ...prev, [step.key]: undefined }))
      setTimeout(() => loadExistingData(step), 500)

    } catch (err) {
      setStatus(prev => ({ ...prev, [step.key]: { state: 'error', message: err.message || 'Upload failed.' } }))
    }

    setUploading(false)
  }

  function mapSystemRole(role) {
    const r = role.toLowerCase()
    if (r.includes('pvp') || r.includes('programmes')) return 'ops_admin'
    if (r.includes('alliance head') || r.includes('asst head')) return 'alliance_head'
    if (r.includes('facilitator')) return 'facilitator'
    if (r.includes('gm head') || r.includes('game master head')) return 'gm_head'
    if (r.includes('game master') || r.includes('gm')) return 'game_master'
    return 'ops_viewer'
  }

  function getConflictColumn(key) {
    const map = {
      alliances: 'alliance_name',
      suballiances: 'suballiance_id',
      stations: 'station_id',
      activities: 'activity_id',
      schedule: 'id',
      manpower: 'telehandle',
    }
    return map[key]
  }

  const stepStatus = status[step.key]
  const tableData = preview ? preview.data : (existingData[step.key] || [])
  const tableColumns = preview ? preview.columns : step.displayColumns
  const isShowingPreview = !!preview
  const isShowingExisting = !preview && (existingData[step.key] || []).length > 0

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: 'var(--color-primary)', marginBottom: '0.25rem' }}>CSV Upload</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          View existing data or upload a new CSV to update each table.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid #2a2a2a',
        marginBottom: '1.5rem',
        gap: 0,
      }}>
        {UPLOAD_STEPS.map((s, i) => {
          const st = status[s.key]
          const isActive = i === currentStep
          const isDone = st?.state === 'success'
          const hasData = (existingData[s.key] || []).length > 0

          return (
            <button
              key={s.key}
              onClick={() => { setCurrentStep(i); setPreview(null) }}
              style={{
                padding: '0.65rem 1.1rem',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: '-2px',
                backgroundColor: 'transparent',
                color: isActive
                  ? 'var(--color-primary)'
                  : hasData || isDone
                  ? 'var(--color-text)'
                  : 'var(--color-text-muted)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {isDone && <span style={{ color: 'var(--color-success)' }}>✓</span>}
              {hasData && !isDone && (
                <span style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-success)',
                  display: 'inline-block',
                }} />
              )}
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--border-radius)',
        border: '1px solid #2a2a2a',
        overflow: 'hidden',
      }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #2a2a2a',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Required columns
            </p>
            <code style={{ fontSize: '0.82rem', color: 'var(--color-accent)' }}>
              {step.description}
            </code>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isShowingPreview && (
              <button
                onClick={() => setPreview(null)}
                style={{
                  padding: '0.5rem 0.9rem',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-muted)',
                  border: '1px solid #3a3a3a',
                  borderRadius: 'var(--border-radius)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ✕ Cancel
              </button>
            )}

            {/* Version label inline for schedule */}
            {step.needsVersionId && isShowingPreview && (
              <input
                type="text"
                placeholder="Version label (optional)"
                value={versionLabel}
                onChange={e => setVersionLabel(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid #2a2a2a',
                  borderRadius: 'var(--border-radius)',
                  color: 'var(--color-text)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  width: '200px',
                }}
              />
            )}

            <label style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              backgroundColor: isShowingPreview ? 'var(--color-surface)' : 'var(--color-primary)',
              color: isShowingPreview ? 'var(--color-text-muted)' : '#fff',
              border: isShowingPreview ? '1px solid #3a3a3a' : 'none',
              borderRadius: 'var(--border-radius)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}>
              {isShowingPreview ? '↺ Choose different file' : '↑ Upload CSV'}
              <input type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
            </label>

            {isShowingPreview && (
              <button
                onClick={handleConfirmUpload}
                disabled={uploading}
                style={{
                  padding: '0.5rem 1.1rem',
                  backgroundColor: uploading ? '#2a2a2a' : 'var(--color-success)',
                  color: uploading ? 'var(--color-text-muted)' : '#fff',
                  border: 'none',
                  borderRadius: 'var(--border-radius)',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                {uploading ? 'Uploading...' : `✓ Confirm (${preview.data.length} rows)`}
              </button>
            )}
          </div>
        </div>

        {/* Status bar */}
        {stepStatus && (
          <div style={{
            padding: '0.6rem 1.25rem',
            backgroundColor: stepStatus.state === 'success'
              ? 'rgba(46,204,154,0.1)'
              : stepStatus.state === 'error'
              ? 'rgba(217,64,64,0.1)'
              : 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid #2a2a2a',
            fontSize: '0.85rem',
            color: stepStatus.state === 'success'
              ? 'var(--color-success)'
              : stepStatus.state === 'error'
              ? 'var(--color-danger)'
              : 'var(--color-text-muted)',
          }}>
            {stepStatus.state === 'loading' && '⏳ '}
            {stepStatus.state === 'success' && '✓ '}
            {stepStatus.state === 'error' && '✗ '}
            {stepStatus.message}
          </div>
        )}

        {/* Table area */}
        {loadingData ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Loading...
          </div>
        ) : tableData.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
              No data yet for {step.label}
            </p>
            <p style={{ color: '#444', fontSize: '0.82rem' }}>
              Upload a CSV to populate this table
            </p>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '0.6rem 1.25rem',
              borderBottom: '1px solid #222',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {isShowingPreview
                  ? `Preview — ${tableData.length} rows from CSV${tableData.length > 10 ? ' (showing first 10)' : ''}`
                  : `${tableData.length} rows in database`
                }
              </span>
              {isShowingPreview && (
                <span style={{
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(232,160,32,0.15)',
                  color: 'var(--color-warning)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                }}>
                  PREVIEW — not yet saved
                </span>
              )}
              {isShowingExisting && (
                <span style={{
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(46,204,154,0.1)',
                  color: 'var(--color-success)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                }}>
                  LIVE DATA
                </span>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1a1a1a' }}>
                    <th style={{
                      padding: '0.6rem 1rem',
                      textAlign: 'left',
                      color: '#555',
                      fontWeight: 600,
                      borderBottom: '1px solid #2a2a2a',
                      width: '40px',
                    }}>#</th>
                    {tableColumns.map(col => (
                      <th key={col} style={{
                        padding: '0.6rem 1rem',
                        textAlign: 'left',
                        color: step.requiredColumns.includes(col)
                          ? 'var(--color-accent)'
                          : 'var(--color-text-muted)',
                        fontWeight: 600,
                        borderBottom: '1px solid #2a2a2a',
                        whiteSpace: 'nowrap',
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(isShowingPreview ? tableData.slice(0, 10) : tableData).map((row, i) => (
                    <tr
                      key={i}
                      style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                    >
                      <td style={{
                        padding: '0.5rem 1rem',
                        color: '#444',
                        borderBottom: '1px solid #1f1f1f',
                        fontSize: '0.75rem',
                      }}>{i + 1}</td>
                      {tableColumns.map(col => (
                        <td key={col} style={{
                          padding: '0.5rem 1rem',
                          color: 'var(--color-text)',
                          borderBottom: '1px solid #1f1f1f',
                          whiteSpace: 'nowrap',
                          maxWidth: '220px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {row[col] ?? <span style={{ color: '#333' }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isShowingPreview && tableData.length > 10 && (
              <p style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.78rem',
                color: '#444',
                borderTop: '1px solid #1f1f1f',
              }}>
                + {tableData.length - 10} more rows not shown in preview
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}