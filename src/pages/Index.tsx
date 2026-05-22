import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Modal } from '../components/Modal'
import { TimePicker, ScheduleInput } from '../components/SessionForm'
import type { Account, Court, DisplayAccount } from '../types'
import { formatCountdown, SESSION_DURATION } from '../utils'

function getDisplayAccounts(
  accounts: Account[],
  courts: Court[],
  selected: string[],
  selectMode: boolean,
  now: number
): DisplayAccount[] {

  const inSessionMap = new Map<string, { court: Court; expiry: number }>()
  const queuedMap = new Map<string, { court: Court; queueIdx: number; session: Court['queue'][0] }>()

  for (const court of courts) {
    if (court.current) {
      const expiry = court.current.startTime + SESSION_DURATION
      for (const aid of court.current.accountIds) {
        inSessionMap.set(aid, { court, expiry })
      }
    }
    court.queue.forEach((s, qi) => {
      for (const aid of s.accountIds) {
        queuedMap.set(aid, { court, queueIdx: qi, session: s })
      }
    })
  }

  return accounts.map(a => {
    const session = inSessionMap.get(a.id)
    const queued = queuedMap.get(a.id)

    if (session) {
      const startTime = session.court.current!.startTime
      const isFuture = startTime > now
      const remaining = session.expiry - now
      const startsIn = startTime - now
      return {
        ...a,
        status: isFuture ? 'scheduled' : 'in_session',
        courtId: session.court.id,
        courtName: session.court.name,
        statusLabel: session.court.name,
        timerDisplay: isFuture
          ? `Starts in ${formatCountdown(startsIn)}`
          : formatCountdown(remaining),
        isScheduled: isFuture,
        canEdit: true,
        selectable: false,
        selected: false,
      }
    }

    if (queued) {
      const qLabel = `${queued.court.name} · Queue ${queued.queueIdx + 1}`
      const isScheduled = queued.session.startTime > now
      const startsIn = queued.session.startTime - now
      return {
        ...a,
        status: 'queued',
        courtId: queued.court.id,
        courtName: queued.court.name,
        statusLabel: qLabel,
        timerDisplay: isScheduled ? `Starts in ${formatCountdown(startsIn)}` : '',
        isScheduled,
        canEdit: true,
        selectable: false,
        selected: false,
      }
    }

    return {
      ...a,
      status: 'unused',
      courtId: '',
      courtName: '',
      statusLabel: 'Available',
      timerDisplay: '',
      isScheduled: false,
      canEdit: true,
      selectable: selectMode && !!a.password,
      selected: selected.includes(a.id),
    }
  })
}

export function IndexPage() {
  const navigate = useNavigate()
  const { accounts, courts, addAccount, updateAccount, deleteAccount, addCourt, startSession } = useStore()

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [pastOpen, setPastOpen] = useState(false)

  // Add account modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ displayName: '', username: '', password: '' })

  // Edit account modal
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [editForm, setEditForm] = useState({ displayName: '', username: '', password: '' })

  // Court action modal: 'new-court' | 'join-session' | 'add-queue'
  const [actionModal, setActionModal] = useState<'new-court' | 'join-session' | 'add-queue' | null>(null)
  const [newCourtName, setNewCourtName] = useState('')
  const [timeMode, setTimeMode] = useState<'now' | 'schedule'>('now')
  const [scheduledTime, setScheduledTime] = useState('')
  const [targetCourtId, setTargetCourtId] = useState('')
  const [targetQueueId, setTargetQueueId] = useState('')
  // "Already started" option for new-court modal
  const [newCourtTimeMode, setNewCourtTimeMode] = useState<'now' | 'elapsed' | 'schedule'>('now')
  const [elapsedMinutes, setElapsedMinutes] = useState(15)

  const currentHHMM = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const openActionModal = (m: 'new-court' | 'join-session' | 'add-queue') => {
    setTimeMode('now')
    setNewCourtTimeMode('now')
    setElapsedMinutes(15)
    setScheduledTime(currentHHMM())
    setTargetCourtId('')
    setTargetQueueId('')
    setActionModal(m)
  }

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const displayAccounts = getDisplayAccounts(accounts, courts, selected, selectMode, now)
  const unused = displayAccounts.filter(a => a.status === 'unused')
  const active = unused.filter(a => !!a.password)
  const past = unused.filter(a => !a.password).sort((a, b) => a.displayName.localeCompare(b.displayName))
  const inSession = displayAccounts.filter(a => a.status === 'in_session')
  const scheduled = displayAccounts.filter(a => a.status === 'scheduled')
  const queued = displayAccounts.filter(a => a.status === 'queued')

  const toggleSelect = (id: string) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  const cancelSelect = () => { setSelectMode(false); setSelected([]) }

  const handleAddAccount = () => {
    const { displayName, username, password } = addForm
    if (!username.trim() || !password.trim()) return
    const name = displayName.trim() || username.trim().slice(0, 2).toUpperCase()
    addAccount(name, username.trim(), password.trim())
    setAddForm({ displayName: '', username: '', password: '' })
    setShowAdd(false)
  }

  const openEdit = (a: Account) => {
    setEditTarget(a)
    setEditForm({ displayName: a.displayName, username: a.username, password: a.password })
  }

  const handleEdit = () => {
    if (!editTarget) return
    updateAccount(editTarget.id, editForm.displayName || editForm.username.slice(0, 2).toUpperCase(), editForm.username, editForm.password)
    setEditTarget(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this account?')) return
    deleteAccount(id)
  }

  const resolveTime = () => {
    if (timeMode === 'schedule' && scheduledTime) {
      const [h, m] = scheduledTime.split(':').map(Number)
      const d = new Date()
      d.setHours(h, m, 0, 0)
      return d.getTime()
    }
    return Date.now()
  }

  const resolveNewCourtTime = () => {
    if (newCourtTimeMode === 'elapsed') {
      return Date.now() - elapsedMinutes * 60 * 1000
    }
    if (newCourtTimeMode === 'schedule' && scheduledTime) {
      const [h, m] = scheduledTime.split(':').map(Number)
      const d = new Date()
      d.setHours(h, m, 0, 0)
      return d.getTime()
    }
    return Date.now()
  }

  const handleCreateCourt = () => {
    if (!newCourtName.trim()) return
    const court = addCourt(`Court ${newCourtName.trim()}`)
    startSession(court.id, selected, selected.length as 2 | 4, resolveNewCourtTime())
    setActionModal(null)
    setNewCourtName('')
    cancelSelect()
    navigate(`/court/${court.id}`)
  }

  const handleJoinSession = () => {
    if (!targetCourtId) return
    const court = courts.find(c => c.id === targetCourtId)
    if (!court || !court.current) return
    const total = court.current.accountIds.length + selected.length
    if (total !== 2 && total !== 4) {
      alert(`Sessions must have exactly 2 or 4 players. Current: ${court.current.accountIds.length}, adding: ${selected.length} = ${total}`)
      return
    }
    useStore.getState().joinSession(targetCourtId, selected)
    setActionModal(null)
    cancelSelect()
    navigate(`/court/${targetCourtId}`)
  }

  const handleAddQueue = () => {
    if (!targetCourtId) return
    if (targetQueueId) {
      useStore.getState().joinQueue(targetCourtId, targetQueueId, selected)
    } else {
      const startTime = timeMode === 'schedule' && scheduledTime ? resolveTime() : 0
      useStore.getState().addToQueue(targetCourtId, selected, selected.length as 2 | 4, startTime)
    }
    setActionModal(null)
    cancelSelect()
    navigate(`/court/${targetCourtId}`)
  }

  // Join is valid only when existing + selected = exactly 2 or 4
  const courtsWithSlots = courts.filter(c => {
    if (!c.current) return false
    const total = c.current.accountIds.length + selected.length
    return total === 2 || total === 4
  })
  // Courts for queue
  const courtsWithSession = courts.filter(c => c.current !== null)

  const canAct = selected.length === 2 || selected.length === 4

  return (
    <>
      <div className="nav-bar">
        <span className="nav-bar__title">🏸 Accounts</span>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/courts')}>Courts →</button>
      </div>
      <div className="page-content">

        {/* Hero summary */}
        <div className="hero-banner">
          <div>
            <div className="hero-banner__label">Player Pool</div>
            <div className="hero-banner__value">{accounts.filter(a => !!a.password).length} Players</div>
            <div className="hero-banner__sub">
              {inSession.length} playing · {scheduled.length} scheduled · {queued.length} queued
            </div>
          </div>
        </div>

        {/* Account card */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">All Accounts</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Player</button>
          </div>

          {/* Select mode bar */}
          {selectMode && (
            <div className="select-bar">
              <span className="select-bar__count">
                🏸 {selected.length} selected
                {selected.length > 0 && !canAct && (
                  <span style={{ marginLeft: 8, fontWeight: 500, opacity: 0.85, fontSize: 11 }}>
                    — need 2 or 4
                  </span>
                )}
              </span>
              <div className="select-bar__actions">
                {canAct && (
                  <>
                    <button className="btn btn-success btn-sm" onClick={() => openActionModal('new-court')}>New Court</button>
                    {courtsWithSlots.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openActionModal('join-session')}>Join</button>
                    )}
                    {courtsWithSession.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openActionModal('add-queue')}>Queue</button>
                    )}
                  </>
                )}
                <button className="btn btn-danger btn-sm" onClick={cancelSelect}>✕</button>
              </div>
            </div>
          )}

          {/* Active accounts (have password) */}
          {active.length > 0 && (
            <>
              <div className="group-label group-label--available">
                ✓ Available
                {!selectMode && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => setSelectMode(true)}
                  >
                    ☑ Select Players
                  </button>
                )}
              </div>
              {!selectMode && (
                <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 6px', textAlign: 'right' }}>
                  Tap "Select Players" to pick 2 or 4 for a court
                </p>
              )}
              {active.map(a => (
                <div className="account-item" key={a.id}>
                  {selectMode && a.selectable && (
                    <div className={`checkbox-circle${a.selected ? ' checked' : ''}`} onClick={() => toggleSelect(a.id)}>
                      {a.selected && '✓'}
                    </div>
                  )}
                  <div className="account-avatar">{a.displayName[0]?.toUpperCase()}</div>
                  <div className="account-info" onClick={selectMode && a.selectable ? () => toggleSelect(a.id) : undefined} style={selectMode && a.selectable ? { cursor: 'pointer' } : {}}>
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.username} · {a.password}</div>
                  </div>
                  {!selectMode && a.canEdit && (
                    <div className="account-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(a)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(a.id)}>Del</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Past accounts (no password) */}
          {past.length > 0 && (
            <>
              <div
                className="group-label"
                style={{ color: 'var(--c-text-muted)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setPastOpen(o => !o)}
              >
                {pastOpen ? '▾' : '▸'} Past Accounts ({past.length})
              </div>
              {pastOpen && past.map(a => (
                <div className="account-item" key={a.id}>
                  <div className="account-avatar" style={{ background: 'var(--c-border)', opacity: 0.6 }}>{a.displayName[0]?.toUpperCase()}</div>
                  <div className="account-info" style={{ opacity: 0.6 }}>
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.username} · <em>no password</em></div>
                  </div>
                  {a.canEdit && (
                    <div className="account-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(a)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(a.id)}>Del</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* In Session — sorted by time remaining ascending (least time first) */}
          {inSession.length > 0 && (
            <>
              <div className="group-label group-label--session">▶ In Session</div>
              {[...inSession].sort((a, b) => {
                const expA = courts.find(c => c.id === a.courtId)?.current?.startTime ?? 0
                const expB = courts.find(c => c.id === b.courtId)?.current?.startTime ?? 0
                return (expA + SESSION_DURATION) - (expB + SESSION_DURATION)
              }).map(a => (
                <div className="account-item" key={a.id} onClick={() => navigate(`/court/${a.courtId}`)} style={{ cursor: 'pointer' }}>
                  <div className="account-avatar account-avatar--session">{a.displayName[0]?.toUpperCase()}</div>
                  <div className="account-info">
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.username} · {a.password}</div>
                    <div className="account-status">{a.courtName}</div>
                  </div>
                  <span className={`timer-pill ${a.isScheduled ? 'timer-scheduled' : getTimerClass(a.timerDisplay)}`}>
                    {a.timerDisplay}
                  </span>
                  <span style={{ color: 'var(--c-text-muted)', fontSize: 16 }}>›</span>
                </div>
              ))}
            </>
          )}

          {/* Scheduled (future sessions) — sorted by start time ascending */}
          {scheduled.length > 0 && (
            <>
              <div className="group-label" style={{ color: 'var(--c-accent)' }}>⏰ Scheduled</div>
              {[...scheduled].sort((a, b) => {
                const tA = courts.find(c => c.id === a.courtId)?.current?.startTime ?? 0
                const tB = courts.find(c => c.id === b.courtId)?.current?.startTime ?? 0
                return tA - tB
              }).map(a => (
                <div className="account-item" key={a.id} onClick={() => navigate(`/court/${a.courtId}`)} style={{ cursor: 'pointer' }}>
                  <div className="account-avatar" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', boxShadow: '0 2px 8px rgba(245,158,11,0.28)' }}>
                    {a.displayName[0]?.toUpperCase()}
                  </div>
                  <div className="account-info">
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.username} · {a.password}</div>
                    <div className="account-status">{a.courtName}</div>
                  </div>
                  <span className="timer-pill timer-warning">{a.timerDisplay}</span>
                  <span style={{ color: 'var(--c-text-muted)', fontSize: 16 }}>›</span>
                </div>
              ))}
            </>
          )}

          {/* Queued — sorted by court expiry ascending so next-up courts appear first */}
          {queued.length > 0 && (
            <>
              <div className="group-label group-label--queue">⏳ In Queue</div>
              {[...queued].sort((a, b) => {
                const expA = courts.find(c => c.id === a.courtId)?.current?.startTime ?? 0
                const expB = courts.find(c => c.id === b.courtId)?.current?.startTime ?? 0
                return (expA + SESSION_DURATION) - (expB + SESSION_DURATION)
              }).map(a => (
                <div className="account-item" key={a.id} onClick={() => navigate(`/court/${a.courtId}`)} style={{ cursor: 'pointer' }}>
                  <div className="account-avatar account-avatar--queue">{a.displayName[0]?.toUpperCase()}</div>
                  <div className="account-info">
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.username} · {a.password}</div>
                    <div className="account-status">{a.courtName}</div>
                  </div>
                  {a.timerDisplay && (
                    <span className="timer-pill timer-scheduled">{a.timerDisplay}</span>
                  )}
                  <span style={{ color: 'var(--c-text-muted)', fontSize: 16 }}>›</span>
                </div>
              ))}
            </>
          )}

          {accounts.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon">🏸</div>
              <div className="empty-state__title">No players yet</div>
              <div className="empty-state__text">Add your first player to start managing courts and sessions.</div>
            </div>
          )}
        </div>
      </div>

      {/* Add account modal */}
      {showAdd && (
        <Modal title="Add Account" onClose={() => setShowAdd(false)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddAccount}>Add</button>
          </>
        }>
          <div className="input-group">
            <label className="input-label">Display Name <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.6 }}>(optional)</span></label>
            <input className="input" placeholder="Defaults to first 2 letters of username" value={addForm.displayName} onChange={e => setAddForm(f => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Username</label>
            <input className="input" placeholder="Username" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input className="input" type="text" placeholder="Password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* Edit account modal */}
      {editTarget && (
        <Modal title={`Edit · ${editTarget.displayName}`} onClose={() => setEditTarget(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEdit}>Save</button>
          </>
        }>
          <div className="input-group">
            <label className="input-label">Display Name</label>
            <input className="input" value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Leave blank to auto-generate" />
          </div>
          <div className="input-group">
            <label className="input-label">Username</label>
            <input className="input" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input className="input" type="text" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* New court modal */}
      {actionModal === 'new-court' && (
        <Modal title="🏸 Create New Court" onClose={() => setActionModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateCourt}>Create</button>
          </>
        }>
          <div className="input-group">
            <label className="input-label">Court Number</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{
                padding: '11px 12px', background: '#F0F7FF', border: '1.5px solid var(--c-border)',
                borderRight: 'none', borderRadius: '10px 0 0 10px', color: 'var(--c-text-muted)',
                fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap',
              }}>Court</span>
              <input
                className="input"
                style={{ borderRadius: '0 10px 10px 0' }}
                placeholder="1"
                value={newCourtName}
                onChange={e => setNewCourtName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          {/* 3-mode time selector */}
          {(() => {
            const btnBase: React.CSSProperties = {
              flex: 1, padding: '9px 0', borderRadius: 10, fontWeight: 700,
              fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
              border: '2px solid var(--c-border)', background: '#F5FBF8',
              color: 'var(--c-text-muted)',
            }
            const btnActive: React.CSSProperties = {
              ...btnBase, border: '2px solid var(--c-primary)',
              background: 'var(--c-primary-light)', color: 'var(--c-primary)',
            }
            return (
              <div className="input-group">
                <label className="input-label">Start Time</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={newCourtTimeMode === 'now' ? btnActive : btnBase} onClick={() => setNewCourtTimeMode('now')}>
                    ▶ Now
                  </button>
                  <button type="button" style={newCourtTimeMode === 'elapsed' ? btnActive : btnBase} onClick={() => setNewCourtTimeMode('elapsed')}>
                    ⏮ Already started
                  </button>
                  <button type="button" style={newCourtTimeMode === 'schedule' ? btnActive : btnBase} onClick={() => setNewCourtTimeMode('schedule')}>
                    ⏰ Later
                  </button>
                </div>

                {newCourtTimeMode === 'elapsed' && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className="input-label" style={{ margin: 0 }}>Started</span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-primary)' }}>
                        {elapsedMinutes} min ago
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={44}
                      step={1}
                      value={elapsedMinutes}
                      onChange={e => setElapsedMinutes(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--c-primary)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>
                      <span>0 min</span>
                      <span style={{ color: 'var(--c-text)', fontSize: 12 }}>≈ {45 - elapsedMinutes} min remaining</span>
                      <span>44 min</span>
                    </div>
                  </div>
                )}

                {newCourtTimeMode === 'schedule' && (
                  <ScheduleInput value={scheduledTime} onChange={setScheduledTime} />
                )}
              </div>
            )
          })()}

          <div className="text-sm text-muted mt-2">
            Players: {selected.map(id => accounts.find(a => a.id === id)?.displayName).join(', ')}
          </div>
        </Modal>
      )}

      {/* Join session modal */}
      {actionModal === 'join-session' && (
        <Modal title="Join Session" onClose={() => setActionModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!targetCourtId} onClick={handleJoinSession}>Join</button>
          </>
        }>
          <p className="text-sm text-muted mb-2">
            Adding {selected.length} player{selected.length > 1 ? 's' : ''} — only courts where total becomes 2 or 4:
          </p>
          {courtsWithSlots.map(c => {
            const total = c.current!.accountIds.length + selected.length
            return (
              <div key={c.id} className={`select-item${targetCourtId === c.id ? ' selected' : ''}`} onClick={() => setTargetCourtId(c.id)}>
                <div className={`checkbox-circle${targetCourtId === c.id ? ' checked' : ''}`}>{targetCourtId === c.id && '✓'}</div>
                <div>
                  <div className="font-bold">🏸 {c.name}</div>
                  <div className="text-xs text-muted">
                    {c.current?.accountIds.length} playing → {total} total
                  </div>
                </div>
              </div>
            )
          })}
          {courtsWithSlots.length === 0 && (
            <div className="empty-state" style={{ padding: 16 }}>
              <div className="empty-state__title">No valid courts</div>
              <div className="empty-state__text">No court where adding {selected.length} player{selected.length > 1 ? 's' : ''} gives exactly 2 or 4.</div>
            </div>
          )}
        </Modal>
      )}

      {/* Add to queue modal */}
      {actionModal === 'add-queue' && (() => {
        const activeCourt = courts.find(c => c.id === targetCourtId)
        const joinableQueues = activeCourt?.queue.filter(s => {
          const total = s.accountIds.length + selected.length
          return total === 2 || total === 4
        }) ?? []
        return (
          <Modal title="Add to Queue" onClose={() => setActionModal(null)} actions={
            <>
              <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!targetCourtId} onClick={handleAddQueue}>
                {targetQueueId ? 'Join Queue' : 'Queue Up'}
              </button>
            </>
          }>
            <p className="text-sm text-muted mb-2">Select court:</p>
            {courtsWithSession.map(c => (
              <div key={c.id} className={`select-item${targetCourtId === c.id && !targetQueueId ? ' selected' : ''}`}
                onClick={() => { setTargetCourtId(c.id); setTargetQueueId('') }}>
                <div className={`checkbox-circle${targetCourtId === c.id && !targetQueueId ? ' checked' : ''}`}>
                  {targetCourtId === c.id && !targetQueueId && '✓'}
                </div>
                <div>
                  <div className="font-bold">🏸 {c.name}</div>
                  <div className="text-xs text-muted">{c.queue.length} queue{c.queue.length !== 1 ? 's' : ''} waiting</div>
                </div>
              </div>
            ))}

            {joinableQueues.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="group-label" style={{ color: 'var(--c-primary)', marginBottom: 6 }}>Or join existing queue</div>
                {joinableQueues.map(s => {
                  const isSelected = targetQueueId === s.id
                  const qIdx = activeCourt!.queue.indexOf(s) + 1
                  const names = s.accountIds.map(aid => accounts.find(a => a.id === aid)?.displayName).filter(Boolean).join(', ')
                  const total = s.accountIds.length + selected.length
                  return (
                    <div key={s.id} className={`select-item${isSelected ? ' selected' : ''}`}
                      onClick={() => { setTargetCourtId(activeCourt!.id); setTargetQueueId(isSelected ? '' : s.id) }}>
                      <div className={`checkbox-circle${isSelected ? ' checked' : ''}`}>{isSelected && '✓'}</div>
                      <div>
                        <div className="font-bold text-sm">Queue {qIdx} · {names}</div>
                        <div className="text-xs text-muted">{s.accountIds.length} → {total} players</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!targetQueueId && (
              <div style={{ marginTop: 14 }}>
                <TimePicker mode={timeMode} scheduledTime={scheduledTime} onModeChange={setTimeMode} onTimeChange={setScheduledTime} nowLabel="Up Next" />
              </div>
            )}
          </Modal>
        )
      })()}
    </>
  )
}

function getTimerClass(display: string): string {
  if (!display) return 'timer-idle'
  const [min] = display.split(':').map(Number)
  if (min <= 5) return 'timer-urgent'
  if (min <= 15) return 'timer-warning'
  return 'timer-ok'
}
