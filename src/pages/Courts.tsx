import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Modal } from '../components/Modal'
import type { Court, DisplayCourt } from '../types'
import { formatCountdown, formatClockTime, SESSION_DURATION } from '../utils'

function BadmintonCourtSVG() {
  return (
    <svg width="140" height="100" viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Court surface */}
      <rect x="4" y="4" width="132" height="92" rx="3" fill="#4CAF50" />
      {/* Outer boundary */}
      <rect x="10" y="10" width="120" height="80" rx="1" fill="none" stroke="white" strokeWidth="2" />
      {/* Net (centre line) */}
      <line x1="70" y1="10" x2="70" y2="90" stroke="white" strokeWidth="2.5" />
      {/* Short service lines */}
      <line x1="10" y1="30" x2="70" y2="30" stroke="white" strokeWidth="1.2" />
      <line x1="70" y1="70" x2="130" y2="70" stroke="white" strokeWidth="1.2" />
      {/* Long service / doubles side lines */}
      <line x1="20" y1="10" x2="20" y2="90" stroke="white" strokeWidth="1" opacity="0.6" />
      <line x1="120" y1="10" x2="120" y2="90" stroke="white" strokeWidth="1" opacity="0.6" />
      {/* Centre mark */}
      <line x1="10" y1="50" x2="70" y2="50" stroke="white" strokeWidth="1" opacity="0.5" />
      <line x1="70" y1="50" x2="130" y2="50" stroke="white" strokeWidth="1" opacity="0.5" />
      {/* Net posts */}
      <rect x="68" y="7" width="4" height="86" rx="2" fill="#795548" opacity="0.7" />
      {/* Shuttlecock hint */}
      <text x="70" y="58" textAnchor="middle" fontSize="18" opacity="0.25">🏸</text>
    </svg>
  )
}

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
    addCourt(`Court ${courtName.trim()}`)
    setCourtName('')
    setShowAdd(false)
  }

  const handleDelete = (e: React.MouseEvent, courtId: string) => {
    e.stopPropagation()
    if (!confirm('Delete this court?')) return
    deleteCourt(courtId)
  }

  return (
    <>
      <div className="nav-bar">
        <button className="nav-bar__back" onClick={() => navigate('/')}>←</button>
        <span className="nav-bar__title">🏸 Courts</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add</button>
      </div>
      <div className="page-content">
        {/* Stats */}
        <div className="card" style={{ display: 'flex', padding: '12px 0' }}>
          <div className="stat-box" style={{ borderRight: '1px solid var(--border)', borderRadius: 0, boxShadow: 'none' }}>
            <div className="stat-value">{courts.length}</div>
            <div className="stat-label">Total Courts</div>
          </div>
          <div className="stat-box" style={{ borderRight: '1px solid var(--border)', borderRadius: 0, boxShadow: 'none' }}>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{activeSessions}</div>
            <div className="stat-label">Active Sessions</div>
          </div>
          <div className="stat-box" style={{ borderRadius: 0, boxShadow: 'none' }}>
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
              <div className="court-card__icon">🏸</div>
              <div className="court-card__info">
                <div className="court-card__name">{dc.name}</div>
                <div className="court-card__meta">
                  <span>{dc.playerCount} player{dc.playerCount !== 1 ? 's' : ''}</span>
                  {dc.queueCount > 0 && (
                    <><div className="court-card__dot" /><span>{dc.queueCount} queued</span></>
                  )}
                </div>
              </div>
              <span className={`timer-pill timer-${dc.statusClass}`}>{dc.statusText || 'Idle'}</span>
              <button
                className="btn btn-danger btn-xs"
                onClick={e => handleDelete(e, dc.id)}
                style={{ marginLeft: 2 }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {courts.length === 0 && (
          <div className="empty-state">
            <BadmintonCourtSVG />
            <div className="empty-state__title" style={{ marginTop: 12 }}>No courts yet</div>
            <div className="empty-state__text">Tap "+ Add" to create your first court.</div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{
                padding: '11px 12px', background: '#F0F7FF', border: '1.5px solid var(--c-border)',
                borderRight: 'none', borderRadius: '10px 0 0 10px', color: 'var(--c-text-muted)',
                fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap',
              }}>Court</span>
              <input
                className="input"
                style={{ borderRadius: '0 10px 10px 0' }}
                placeholder="3"
                value={courtName}
                onChange={e => setCourtName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
