import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function FacilitatorView() {
  const user = JSON.parse(localStorage.getItem('helix_user'))
  const isAllianceHead = user?.system_role === 'alliance_head'

  const [suballiances, setSuballiances] = useState([])
  const [selectedSuballiance, setSelectedSuballiance] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [day, setDay] = useState(1)
  const [now, setNow] = useState(new Date())
  const [recentCheckIn, setRecentCheckIn] = useState(null)
  const [undoTimer, setUndoTimer] = useState(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadSuballiances()
  }, [])

  useEffect(() => {
    if (selectedSuballiance) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadScheduleAndMovements()
    }
  }, [selectedSuballiance, day])

  useEffect(() => {
    const channel = supabase
      .channel('facilitator-movements')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'movements',
      }, () => loadMovements())
      .subscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadSuballiances() {
    setLoading(true)
    try {
      if (isAllianceHead) {
        const { data: userData } = await supabase
          .from('users')
          .select('alliance_name')
          .eq('id', user.id)
          .single()

        const { data } = await supabase
          .from('suballiances')
          .select('*')
          .eq('alliance_name', userData.alliance_name)
          .order('suballiance_id')

        setSuballiances(data || [])
        if (data?.length > 0) setSelectedSuballiance(data[0])
      } else {
        const { data: userData } = await supabase
          .from('users')
          .select('suballiance_id')
          .eq('id', user.id)
          .single()

        if (userData?.suballiance_id) {
          const { data } = await supabase
            .from('suballiances')
            .select('*')
            .eq('suballiance_id', userData.suballiance_id)
            .single()

          setSuballiances(data ? [data] : [])
          setSelectedSuballiance(data)
        }
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function loadScheduleAndMovements() {
    await Promise.all([loadSchedule(), loadMovements()])
  }

  async function loadSchedule() {
    const { data } = await supabase
      .from('schedule')
      .select('*, schedule_versions!inner(is_active), stations(station_name)')
      .eq('suballiance_id', selectedSuballiance.suballiance_id)
      .eq('day', day)
      .eq('schedule_versions.is_active', true)
      .order('slot_number')
    setSchedule(data || [])
  }

  async function loadMovements() {
    if (!selectedSuballiance) return
    const { data } = await supabase
      .from('movements')
      .select('*')
      .eq('suballiance_id', selectedSuballiance.suballiance_id)
    setMovements(data || [])
  }

  function getMovement(stationId) {
    return movements.find(
      m => m.suballiance_id === selectedSuballiance?.suballiance_id
        && m.station_id === stationId
    )
  }

  function getSlotStatus(slot) {
    const movement = getMovement(slot.station_id)
    if (movement?.checked_out_at) return 'done'
    if (movement?.checked_in_at) return 'checked_in'
    const nowTime = now.getHours() * 60 + now.getMinutes()
    if (!slot.expected_arrival) return 'upcoming'
    const [ah, am] = slot.expected_arrival.split(':').map(Number)
    const [dh, dm] = slot.expected_departure?.split(':').map(Number) || [0, 0]
    const arrival = ah * 60 + am
    const departure = dh * 60 + dm
    if (nowTime > arrival + 10 && nowTime < departure) return 'late'
    if (nowTime >= arrival && nowTime <= departure) return 'due'
    if (nowTime > departure) return 'missed'
    return 'upcoming'
  }

  async function handleCheckIn(slot) {
    setActionLoading(`in-${slot.id}`)
    try {
      const { data, error } = await supabase
        .from('movements')
        .upsert({
          suballiance_id: slot.suballiance_id,
          station_id: slot.station_id,
          checked_in_at: new Date().toISOString(),
          facilitator_id: user.id,
        }, { onConflict: 'suballiance_id,station_id' })
        .select()
        .single()

      if (error) throw error
      await loadMovements()

      const expiresAt = Date.now() + 30000
      setRecentCheckIn({ slotId: slot.id, movementId: data.id, expiresAt })

      if (undoTimer) clearTimeout(undoTimer)
      const timer = setTimeout(() => setRecentCheckIn(null), 30000)
      setUndoTimer(timer)

    } catch (err) {
      alert('Check-in failed: ' + err.message)
    }
    setActionLoading(null)
  }

  async function handleCheckOut(slot) {
    setActionLoading(`out-${slot.id}`)
    try {
      const movement = getMovement(slot.station_id)
      if (!movement) return

      const { error } = await supabase
        .from('movements')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('id', movement.id)

      if (error) throw error
      await loadMovements()
    } catch (err) {
      alert('Check-out failed: ' + err.message)
    }
    setActionLoading(null)
  }

  async function handleUndo() {
    if (!recentCheckIn) return
    setActionLoading('undo')
    try {
      const { error } = await supabase
        .from('movements')
        .delete()
        .eq('id', recentCheckIn.movementId)

      if (error) throw error
      setRecentCheckIn(null)
      if (undoTimer) clearTimeout(undoTimer)
      await loadMovements()
    } catch (err) {
      alert('Undo failed: ' + err.message)
    }
    setActionLoading(null)
  }

  const DAYS = [1, 2, 3]

  const statusConfig = {
    upcoming:   { label: 'Upcoming',    color: 'var(--color-text-muted)', bg: 'transparent' },
    due:        { label: 'Due Now',     color: 'var(--color-warning)',    bg: 'rgba(232,160,32,0.1)' },
    late:       { label: 'Late',        color: 'var(--color-danger)',     bg: 'rgba(217,64,64,0.1)' },
    checked_in: { label: 'Checked In',  color: 'var(--color-success)',    bg: 'rgba(46,204,154,0.1)' },
    done:       { label: 'Done',        color: 'var(--color-success)',    bg: 'rgba(46,204,154,0.05)' },
    missed:     { label: 'Missed',      color: 'var(--color-danger)',     bg: 'rgba(217,64,64,0.05)' },
  }

  if (loading) return (
    <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading...</div>
  )

  return (
    <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ color: 'var(--color-primary)', marginBottom: '0.2rem' }}>
          Check In / Out
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
          {now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })} · {user?.name}
        </p>
      </div>

      {/* Undo banner */}
      {recentCheckIn && (
        <div style={{
          backgroundColor: 'rgba(74,144,217,0.15)',
          border: '1px solid rgba(74,144,217,0.3)',
          borderRadius: 'var(--border-radius)',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', margin: 0 }}>
            ✓ Checked in successfully
          </p>
          <button
            onClick={handleUndo}
            disabled={actionLoading === 'undo'}
            style={{
              padding: '0.4rem 0.9rem',
              backgroundColor: 'transparent',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--border-radius)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {actionLoading === 'undo' ? 'Undoing...' : 'Undo'}
          </button>
        </div>
      )}

      {/* Suballiance selector (alliance head only) */}
      {isAllianceHead && suballiances.length > 1 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted)',
            marginBottom: '0.4rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Suballiance
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {suballiances.map(sub => (
              <button
                key={sub.suballiance_id}
                onClick={() => setSelectedSuballiance(sub)}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '999px',
                  backgroundColor: selectedSuballiance?.suballiance_id === sub.suballiance_id
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
                  color: selectedSuballiance?.suballiance_id === sub.suballiance_id
                    ? '#fff'
                    : 'var(--color-text-muted)',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid #2a2a2a',
                }}
              >
                {sub.suballiance_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected suballiance info */}
      {selectedSuballiance && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--border-radius)',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          border: '1px solid #2a2a2a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              {selectedSuballiance.suballiance_name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              {selectedSuballiance.alliance_name}
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            {movements.filter(m => m.checked_in_at).length}/{schedule.length} checked in
          </div>
        </div>
      )}

      {/* Day tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #2a2a2a', marginBottom: '1.25rem' }}>
        {DAYS.map(d => (
          <button
            key={d}
            onClick={() => setDay(d)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom: day === d ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px',
              backgroundColor: 'transparent',
              color: day === d ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: day === d ? 700 : 500,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            Day {d}
          </button>
        ))}
      </div>

      {/* Schedule slots */}
      {schedule.length === 0 ? (
        <div style={{
          padding: '2.5rem',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid #2a2a2a',
        }}>
          <p style={{ color: 'var(--color-text-muted)' }}>No schedule for Day {day}.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {schedule.map(slot => {
            const status = getSlotStatus(slot)
            const config = statusConfig[status]
            const movement = getMovement(slot.station_id)
            const isCheckedIn = !!movement?.checked_in_at
            const isCheckedOut = !!movement?.checked_out_at
            const isLoadingIn = actionLoading === `in-${slot.id}`
            const isLoadingOut = actionLoading === `out-${slot.id}`

            return (
              <div
                key={slot.id}
                style={{
                  backgroundColor: config.bg || 'var(--color-surface)',
                  border: `1px solid ${status === 'late' ? 'rgba(217,64,64,0.3)' : status === 'due' ? 'rgba(232,160,32,0.3)' : '#2a2a2a'}`,
                  borderRadius: 'var(--border-radius)',
                  padding: '1rem 1.25rem',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.95rem' }}>
                        Slot {slot.slot_number}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: config.color,
                        backgroundColor: `${config.color}25`,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        letterSpacing: '0.05em',
                      }}>
                        {config.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text)', fontWeight: 500 }}>
                      {slot.stations?.station_name || slot.station_id}
                    </div>
                    {slot.expected_arrival && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                        {slot.expected_arrival.slice(0, 5)} – {slot.expected_departure?.slice(0, 5) || '?'}
                      </div>
                    )}
                  </div>

                  {/* Check in/out times */}
                  {(isCheckedIn || isCheckedOut) && (
                    <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {isCheckedIn && (
                        <div style={{ color: 'var(--color-success)' }}>
                          IN {new Date(movement.checked_in_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                      {isCheckedOut && (
                        <div style={{ color: 'var(--color-text-muted)' }}>
                          OUT {new Date(movement.checked_out_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isCheckedIn && !isCheckedOut && (
                    <button
                      onClick={() => handleCheckIn(slot)}
                      disabled={isLoadingIn}
                      style={{
                        flex: 1,
                        padding: '0.65rem',
                        backgroundColor: isLoadingIn ? 'var(--color-surface)' : 'var(--color-primary)',
                        color: isLoadingIn ? 'var(--color-text-muted)' : '#fff',
                        border: 'none',
                        borderRadius: 'var(--border-radius)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: isLoadingIn ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isLoadingIn ? 'Checking in...' : '✓ Check In'}
                    </button>
                  )}

                  {isCheckedIn && !isCheckedOut && (
                    <>
                      <div style={{
                        flex: 1,
                        padding: '0.65rem',
                        backgroundColor: 'rgba(46,204,154,0.1)',
                        border: '1px solid rgba(46,204,154,0.3)',
                        borderRadius: 'var(--border-radius)',
                        color: 'var(--color-success)',
                        fontWeight: 600,
                        fontSize: '0.88rem',
                        textAlign: 'center',
                      }}>
                        ✓ Checked In
                      </div>
                      <button
                        onClick={() => handleCheckOut(slot)}
                        disabled={isLoadingOut}
                        style={{
                          flex: 1,
                          padding: '0.65rem',
                          backgroundColor: 'var(--color-surface)',
                          color: isLoadingOut ? 'var(--color-text-muted)' : 'var(--color-text)',
                          border: '1px solid #3a3a3a',
                          borderRadius: 'var(--border-radius)',
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          cursor: isLoadingOut ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isLoadingOut ? 'Checking out...' : 'Check Out →'}
                      </button>
                    </>
                  )}

                  {isCheckedOut && (
                    <div style={{
                      flex: 1,
                      padding: '0.65rem',
                      backgroundColor: 'transparent',
                      border: '1px solid #2a2a2a',
                      borderRadius: 'var(--border-radius)',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.88rem',
                      textAlign: 'center',
                    }}>
                      Completed
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}