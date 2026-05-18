import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Modal } from '../components/Modal'
import type { Court, DisplayCourt } from '../types'
import { formatCountdown, formatClockTime, SESSION_DURATION } from '../utils'

function toDisplayCourt(c: Court, now: number): DisplayCourt {
  if (!c.current) {
    return {
      id: c.id, name: c.name, hasSession: false, isScheduled: false,
      statusText: 'Idle', statusClass: 'idle', timerDisplay: '', playerCount: 0, queueCount: c.queue.length,
    }
  }

  const isScheduled = c.current.startTime > now
  if (isScheduled) {
    return {
      id: c.id, name: c.name, hasSession: true, isScheduled: true,
      statusText: `Starts ${formatClockTime(c.current.startTime)}`, statusClass: 'scheduled',
      timerDisplay: `Starts ${formatClockTime(c.current.startTime)}`,
      playerCount: c.current.accountIds.length, queueCount: c.queue.length,
    }
  }

  const remaining = c.current.startTime + SESSION_DURATION - now
  const display = formatCountdown(remaining)
  const [min] = display.split(':').map(Number)
  const statusClass = remaining <= 0 ? 'urgent' : min <= 5 ? 'urgent' : min <= 15 ? 'warning' : 'ok'

  return {
    id: c.id, name: c.name, hasSession: true, isScheduled: false,
    statusText: display, statusClass,
    timerDisplay: display,
    playerCount: c.current.accountIds.length, queueCount: c.queue.length,
  }
}

export function CourtsPage() {
  const navigate = useNavigate()
  const { courts, addCourt, deleteCourt } = useStore()
  const [now, setNow] = useState(Date.now())
  const [showAdd, setShowAdd] = useState(false)
  const [courtName, setCourtName] = useState('')

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const displayCourts = courts.map(c => toDisplayCourt(c, now))
  const activeSessions = courts.filter(c => c.current && c.current.startTime <= now).length

  const handleAdd = () => {
    if (!courtName.trim()) return
    addCourt(courtName.trim())
    setCourtName('')
    setShowAdd(false)
  }

  const handleDelete = (e: React.MouseEvent, courtId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this court?')) return
    deleteCourt(courtId)
  }

  return (
    <div className="app-shell">
      <div className="nav-bar">
        <button className="nav-bar__back" onClick={() => navigate('/')}>←</button>
        <span className="nav-bar__title">🏸 Courts</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add</button>
      </div>
      <div className="page-content">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-value">{courts.length}</div>
            <div className="stat-label">Total Courts</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{activeSessions}</div>
            <div className="stat-label">Active Sessions</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--secondary)' }}>
              {courts.reduce((n, c) => n + c.queue.length, 0)}
            </div>
            <div className="stat-label">In Queue</div>
          </div>
        </div>

        {/* Court cards */}
        {displayCourts.map(dc => (
          <div className="court-card" key={dc.id} onClick={() => navigate(`/court/${dc.id}`)}>
            <div className={`court-card__strip strip-${dc.statusClass}`} />
            <div className="court-card__body">
              <div className="court-card__info">
                <div className="court-card__name">🏸 {dc.name}</div>
                <div className="court-card__meta">
                  <span>{dc.playerCount} player{dc.playerCount !== 1 ? 's' : ''}</span>
                  {dc.queueCount > 0 && <span>· {dc.queueCount} in queue</span>}
                </div>
              </div>
              <span className={`timer-pill timer-${dc.statusClass}`}>{dc.statusText || 'Idle'}</span>
              <button
                className="btn btn-danger btn-xs"
                onClick={e => handleDelete(e, dc.id)}
                style={{ marginLeft: 4 }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {courts.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">🏟️</div>
            <div className="empty-state__text">No courts yet. Add one above!</div>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Court" onClose={() => setShowAdd(false)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd}>Create</button>
          </>
        }>
          <div className="input-group">
            <label className="input-label">Court Name</label>
            <input className="input" placeholder="e.g. Court 3" value={courtName} onChange={e => setCourtName(e.target.value)} autoFocus />
          </div>
        </Modal>
      )}
    </div>
  )
}
