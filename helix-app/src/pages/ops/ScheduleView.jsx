import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const DAYS = [
  { label: 'Day 1', value: 1 },
  { label: 'Day 2', value: 2 },
  { label: 'Day 3', value: 3 },
]

export default function ScheduleView() {
  const [day, setDay] = useState(1)
  const [view, setView] = useState('suballiance')
  const [schedule, setSchedule] = useState([])
  const [movements, setMovements] = useState([])
  const [suballiances, setSuballiances] = useState([])
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  // ── LOAD FUNCTIONS (must be above useEffects) ──────────
  async function loadSchedule() {
    const { data } = await supabase
      .from('schedule')
      .select('*, schedule_versions!inner(is_active)')
      .eq('day', day)
      .eq('schedule_versions.is_active', true)
      .order('slot_number')
    setSchedule(data || [])
  }

  async function loadMovements() {
    const { data } = await supabase
      .from('movements')
      .select('*')
    setMovements(data || [])
  }

  async function loadSuballiances() {
    const { data } = await supabase
      .from('suballiances')
      .select('*')
      .order('suballiance_id')
    setSuballiances(data || [])
  }

  async function loadStations() {
    const { data } = await supabase
      .from('stations')
      .select('*')
      .order('station_id')
    setStations(data || [])
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadSchedule(), loadMovements(), loadSuballiances(), loadStations()])
    setLoading(false)
  }

  // ── USE EFFECTS ────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [day])

  useEffect(() => {
    const channel = supabase
      .channel('movements-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'movements',
      }, () => {
        loadMovements()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // Get movement for a suballiance at a station
  function getMovement(suballianceId, stationId) {
    return movements.find(
      m => m.suballiance_id === suballianceId && m.station_id === stationId
    )
  }

  // Get current slot happening right now based on time
  function getCurrentSlots() {
    const nowTime = now.getHours() * 60 + now.getMinutes()
    return schedule.filter(slot => {
      if (!slot.expected_arrival || !slot.expected_departure) return false
      const [ah, am] = slot.expected_arrival.split(':').map(Number)
      const [dh, dm] = slot.expected_departure.split(':').map(Number)
      const arrival = ah * 60 + am
      const departure = dh * 60 + dm
      return nowTime >= arrival && nowTime <= departure
    })
  }

  // Check if a slot is overdue (arrival passed by >10 min, no check-in)
  function isStraggler(slot) {
    if (!slot.expected_arrival) return false
    const movement = getMovement(slot.suballiance_id, slot.station_id)
    if (movement?.checked_in_at) return false
    const nowTime = now.getHours() * 60 + now.getMinutes()
    const [ah, am] = slot.expected_arrival.split(':').map(Number)
    const arrival = ah * 60 + am
    return nowTime > arrival + 10
  }

  function isCurrentSlot(slot) {
    return getCurrentSlots().some(
      s => s.suballiance_id === slot.suballiance_id && s.slot_number === slot.slot_number
    )
  }

  // Get all unique slot numbers for this day
  const slotNumbers = [...new Set(schedule.map(s => s.slot_number))].sort((a, b) => a - b)

  // Get slots for a specific suballiance
  function getSlotsForSuballiance(suballianceId) {
    return slotNumbers.map(slot => schedule.find(
      s => s.suballiance_id === suballianceId && s.slot_number === slot
    ))
  }

  // Get slots for a specific station
  function getSlotsForStation(stationId) {
    return slotNumbers.map(slot => schedule.find(
      s => s.station_id === stationId && s.slot_number === slot
    ))
  }

  // Status badge for a slot cell
  function SlotCell({ slot, highlight }) {
    if (!slot) return (
      <td style={{
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #1f1f1f',
        borderRight: '1px solid #1f1f1f',
        color: '#333',
        fontSize: '0.8rem',
        textAlign: 'center',
        backgroundColor: highlight ? 'rgba(74,144,217,0.04)' : 'transparent',
      }}>—</td>
    )

    const movement = getMovement(slot.suballiance_id, slot.station_id)
    const checkedIn = !!movement?.checked_in_at
    const checkedOut = !!movement?.checked_out_at
    const straggler = isStraggler(slot)
    const current = isCurrentSlot(slot)

    let bgColor = 'transparent'
    if (straggler) bgColor = 'rgba(217,64,64,0.12)'
    else if (current && !checkedIn) bgColor = 'rgba(232,160,32,0.1)'
    else if (checkedOut) bgColor = 'rgba(46,204,154,0.08)'
    else if (checkedIn) bgColor = 'rgba(46,204,154,0.15)'
    if (highlight) bgColor = bgColor === 'transparent' ? 'rgba(74,144,217,0.04)' : bgColor

    const statusColor = straggler
      ? 'var(--color-danger)'
      : checkedOut
      ? 'var(--color-success)'
      : checkedIn
      ? 'var(--color-success)'
      : current
      ? 'var(--color-warning)'
      : '#444'

    const statusLabel = checkedOut
      ? 'OUT'
      : checkedIn
      ? 'IN'
      : straggler
      ? 'LATE'
      : current
      ? 'DUE'
      : ''

    return (
      <td style={{
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #1f1f1f',
        borderRight: '1px solid #1f1f1f',
        backgroundColor: bgColor,
        transition: 'background-color 0.3s',
        minWidth: '130px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {/* Station or suballiance name */}
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text)', fontWeight: 500 }}>
            {view === 'suballiance'
              ? stations.find(s => s.station_id === slot.station_id)?.station_name || slot.station_id
              : suballiances.find(s => s.suballiance_id === slot.suballiance_id)?.suballiance_name || slot.suballiance_id
            }
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {/* Time */}
            {slot.expected_arrival && (
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                {slot.expected_arrival.slice(0, 5)}–{slot.expected_departure?.slice(0, 5) || '?'}
              </span>
            )}

            {/* Status badge */}
            {statusLabel && (
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: statusColor,
                backgroundColor: `${statusColor}20`,
                padding: '0.1rem 0.35rem',
                borderRadius: '3px',
                letterSpacing: '0.05em',
              }}>
                {statusLabel}
              </span>
            )}
          </div>
        </div>
      </td>
    )
  }

  if (loading) return (
    <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading schedule...</div>
  )

  // Which suballiances/stations appear in today's schedule
  const activeSuballianceIds = [...new Set(schedule.map(s => s.suballiance_id))]
  const activeStationIds = [...new Set(schedule.map(s => s.station_id))]
  const activeSuballiances = suballiances.filter(s => activeSuballianceIds.includes(s.suballiance_id))
  const activeStations = stations.filter(s => activeStationIds.includes(s.station_id))

  const stragglerCount = schedule.filter(isStraggler).length
  const checkedInCount = schedule.filter(s => getMovement(s.suballiance_id, s.station_id)?.checked_in_at).length

  return (
    <div style={{ padding: '2rem', maxWidth: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--color-primary)', marginBottom: '0.25rem' }}>Schedule</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
            {now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })} · Live view
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <StatBadge label="Checked In" value={checkedInCount} color="var(--color-success)" />
          <StatBadge label="Stragglers" value={stragglerCount} color={stragglerCount > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'} />
          <StatBadge label="Total Slots" value={schedule.length} color="var(--color-text-muted)" />
        </div>
      </div>

      {/* Day tabs + View toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>

        {/* Day tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #2a2a2a' }}>
          {DAYS.map(d => (
            <button
              key={d.value}
              onClick={() => setDay(d.value)}
              style={{
                padding: '0.5rem 1.1rem',
                border: 'none',
                borderBottom: day === d.value ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: '-2px',
                backgroundColor: 'transparent',
                color: day === d.value ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: day === d.value ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--border-radius)',
          padding: '0.2rem',
          border: '1px solid #2a2a2a',
        }}>
          {['suballiance', 'station'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '0.4rem 0.9rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: view === v ? 'var(--color-primary)' : 'transparent',
                color: view === v ? '#fff' : 'var(--color-text-muted)',
                fontWeight: view === v ? 600 : 400,
                fontSize: '0.83rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              By {v}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { color: 'var(--color-success)', label: 'Checked in' },
          { color: 'var(--color-warning)', label: 'Due now' },
          { color: 'var(--color-danger)', label: 'Overdue (>10 min)' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: l.color, opacity: 0.8 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      {schedule.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid #2a2a2a',
        }}>
          <p style={{ color: 'var(--color-text-muted)' }}>No schedule data for Day {day}.</p>
          <p style={{ color: '#444', fontSize: '0.82rem', marginTop: '0.5rem' }}>Upload a schedule CSV first.</p>
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          borderRadius: 'var(--border-radius)',
          border: '1px solid #2a2a2a',
        }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.83rem', width: '100%' }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a1a' }}>
                {/* Row header */}
                <th style={{
                  padding: '0.65rem 1rem',
                  textAlign: 'left',
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                  borderBottom: '1px solid #2a2a2a',
                  borderRight: '1px solid #2a2a2a',
                  whiteSpace: 'nowrap',
                  minWidth: '140px',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: '#1a1a1a',
                  zIndex: 1,
                }}>
                  {view === 'suballiance' ? 'Suballiance' : 'Station'}
                </th>

                {/* Slot columns */}
                {slotNumbers.map(slot => {
                  // Find a sample slot to get time
                  const sample = schedule.find(s => s.slot_number === slot)
                  const currentSlots = getCurrentSlots()
                  const isNowSlot = currentSlots.some(s => s.slot_number === slot)

                  return (
                    <th key={slot} style={{
                      padding: '0.65rem 0.75rem',
                      textAlign: 'left',
                      color: isNowSlot ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontWeight: isNowSlot ? 700 : 600,
                      borderBottom: '1px solid #2a2a2a',
                      borderRight: '1px solid #2a2a2a',
                      whiteSpace: 'nowrap',
                      backgroundColor: isNowSlot ? 'rgba(74,144,217,0.06)' : 'transparent',
                    }}>
                      <div>Slot {slot}</div>
                      {sample?.expected_arrival && (
                        <div style={{ fontSize: '0.72rem', fontWeight: 400, color: isNowSlot ? 'var(--color-primary)' : '#555' }}>
                          {sample.expected_arrival.slice(0, 5)}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {view === 'suballiance'
                ? activeSuballiances.map((sub, i) => (
                  <tr key={sub.suballiance_id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{
                      padding: '0.5rem 1rem',
                      borderBottom: '1px solid #1f1f1f',
                      borderRight: '1px solid #2a2a2a',
                      color: 'var(--color-text)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      backgroundColor: i % 2 === 0 ? 'var(--color-background)' : '#111',
                      zIndex: 1,
                    }}>
                      <div style={{ fontSize: '0.85rem' }}>{sub.suballiance_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{sub.alliance_name}</div>
                    </td>
                    {getSlotsForSuballiance(sub.suballiance_id).map((slot, j) => {
                      const isNowCol = getCurrentSlots().some(s => s.slot_number === slotNumbers[j])
                      return <SlotCell key={j} slot={slot} highlight={isNowCol} />
                    })}
                  </tr>
                ))
                : activeStations.map((station, i) => (
                  <tr key={station.station_id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{
                      padding: '0.5rem 1rem',
                      borderBottom: '1px solid #1f1f1f',
                      borderRight: '1px solid #2a2a2a',
                      color: 'var(--color-text)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      backgroundColor: i % 2 === 0 ? 'var(--color-background)' : '#111',
                      zIndex: 1,
                    }}>
                      <div style={{ fontSize: '0.85rem' }}>{station.station_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{station.station_id}</div>
                    </td>
                    {getSlotsForStation(station.station_id).map((slot, j) => {
                      const isNowCol = getCurrentSlots().some(s => s.slot_number === slotNumbers[j])
                      return <SlotCell key={j} slot={slot} highlight={isNowCol} />
                    })}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      border: '1px solid #2a2a2a',
      borderRadius: 'var(--border-radius)',
      padding: '0.5rem 0.9rem',
      textAlign: 'center',
      minWidth: '80px',
    }}>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>{label}</div>
    </div>
  )
}