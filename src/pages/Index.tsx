import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Modal } from '../components/Modal'
import type { Account, Court, DisplayAccount } from '../types'
import { formatCountdown, formatClockTime, SESSION_DURATION } from '../utils'

function getDisplayAccounts(
  accounts: Account[],
  courts: Court[],
  myIds: string[],
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
      const remaining = session.expiry - now
      const isScheduled = session.court.current!.startTime > now
      return {
        ...a,
        status: 'in_session',
        courtId: session.court.id,
        courtName: session.court.name,
        statusLabel: session.court.name,
        timerDisplay: isScheduled
          ? `Starts ${formatClockTime(session.court.current!.startTime)}`
          : formatCountdown(remaining),
        isScheduled,
        canEdit: myIds.includes(a.id),
        selectable: false,
        selected: false,
      }
    }

    if (queued) {
      const qLabel = `${queued.court.name} · Q${queued.queueIdx + 1}`
      const isScheduled = queued.session.startTime > now
      return {
        ...a,
        status: 'queued',
        courtId: queued.court.id,
        courtName: queued.court.name,
        statusLabel: qLabel,
        timerDisplay: isScheduled ? `Starts ${formatClockTime(queued.session.startTime)}` : '',
        isScheduled,
        canEdit: myIds.includes(a.id),
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
      canEdit: myIds.includes(a.id),
      selectable: selectMode,
      selected: selected.includes(a.id),
    }
  })
}

export function IndexPage() {
  const navigate = useNavigate()
  const { accounts, courts, myIds, addAccount, updateAccount, deleteAccount, addCourt, startSession } = useStore()

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  // Add account modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ displayName: '', username: '', password: '' })

  // Edit account modal
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [editForm, setEditForm] = useState({ username: '', password: '' })

  // Court action modal: 'new-court' | 'join-session' | 'add-queue'
  const [actionModal, setActionModal] = useState<'new-court' | 'join-session' | 'add-queue' | null>(null)
  const [newCourtName, setNewCourtName] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [targetCourtId, setTargetCourtId] = useState('')

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const displayAccounts = getDisplayAccounts(accounts, courts, myIds, selected, selectMode, now)
  const unused = displayAccounts.filter(a => a.status === 'unused')
  const inSession = displayAccounts.filter(a => a.status === 'in_session')
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
    if (!displayName.trim() || !username.trim() || !password.trim()) return
    addAccount(displayName.trim(), username.trim(), password.trim())
    setAddForm({ displayName: '', username: '', password: '' })
    setShowAdd(false)
  }

  const openEdit = (a: Account) => {
    setEditTarget(a)
    setEditForm({ username: a.username, password: a.password })
  }

  const handleEdit = () => {
    if (!editTarget) return
    updateAccount(editTarget.id, editForm.username, editForm.password)
    setEditTarget(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this account?')) return
    deleteAccount(id)
  }

  // Action handlers
  const handleCreateCourt = () => {
    if (!newCourtName.trim()) return
    const startTime = scheduledTime ? new Date(scheduledTime).getTime() : Date.now()
    const court = addCourt(newCourtName.trim())
    startSession(court.id, selected, startTime)
    setActionModal(null)
    setNewCourtName('')
    setScheduledTime('')
    cancelSelect()
    navigate(`/court/${court.id}`)
  }

  const handleJoinSession = () => {
    if (!targetCourtId) return
    const court = courts.find(c => c.id === targetCourtId)
    if (!court || !court.current) return
    const availableSlots = court.current.capacity - court.current.accountIds.length
    if (selected.length > availableSlots) {
      alert(`Only ${availableSlots} slot(s) available`)
      return
    }
    useStore.getState().joinSession(targetCourtId, selected)
    setActionModal(null)
    cancelSelect()
    navigate(`/court/${targetCourtId}`)
  }

  const handleAddQueue = () => {
    if (!targetCourtId) return
    const startTime = scheduledTime ? new Date(scheduledTime).getTime() : 0
    useStore.getState().addToQueue(targetCourtId, selected, startTime)
    setActionModal(null)
    setScheduledTime('')
    cancelSelect()
    navigate(`/court/${targetCourtId}`)
  }

  // Courts with open spots for join-session
  const courtsWithSlots = courts.filter(c => c.current && c.current.accountIds.length < c.current.capacity)
  // Courts for queue
  const courtsWithSession = courts.filter(c => c.current !== null)

  const canAct = selected.length === 2 || selected.length === 4

  return (
    <div className="app-shell">
      <div className="nav-bar">
        <span className="nav-bar__title">🏸 Accounts</span>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/courts')}>Courts →</button>
      </div>
      <div className="page-content">
        {/* Add account card */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Account Pool</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add</button>
          </div>

          {/* Select mode bar */}
          {selectMode && (
            <div className="select-bar" style={{ marginBottom: 10 }}>
              <span className="select-bar__count">{selected.length} selected (max 4)</span>
              <div className="select-bar__actions">
                {canAct && (
                  <>
                    <button className="btn btn-success btn-sm" onClick={() => setActionModal('new-court')}>New Court</button>
                    {courtsWithSlots.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => { setTargetCourtId(''); setActionModal('join-session') }}>Join</button>
                    )}
                    {courtsWithSession.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => { setTargetCourtId(''); setActionModal('add-queue') }}>Queue</button>
                    )}
                  </>
                )}
                <button className="btn btn-danger btn-sm" onClick={cancelSelect}>✕</button>
              </div>
            </div>
          )}

          {/* Unused accounts */}
          {unused.length > 0 && (
            <>
              <div className="section-header">
                <span className="section-title" style={{ color: '#6EE7B7' }}>Available</span>
                {!selectMode && (
                  <button className="btn btn-secondary btn-xs" onClick={() => setSelectMode(true)}>Select</button>
                )}
              </div>
              {unused.map(a => (
                <div className="account-item" key={a.id}>
                  {selectMode && (
                    <div
                      className={`checkbox-circle${a.selected ? ' checked' : ''}`}
                      onClick={() => toggleSelect(a.id)}
                    >
                      {a.selected && '✓'}
                    </div>
                  )}
                  <div className="account-avatar">{a.displayName[0]?.toUpperCase()}</div>
                  <div className="account-info" onClick={selectMode ? () => toggleSelect(a.id) : undefined} style={selectMode ? { cursor: 'pointer' } : {}}>
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.username}</div>
                  </div>
                  {!selectMode && a.canEdit && (
                    <div className="account-actions">
                      <button className="btn btn-secondary btn-xs" onClick={() => openEdit(a)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(a.id)}>Del</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* In Session */}
          {inSession.length > 0 && (
            <>
              <div className="divider" />
              <div className="section-title" style={{ marginBottom: 6, color: '#6EE7B7' }}>In Session</div>
              {inSession.map(a => (
                <div className="account-item" key={a.id}>
                  <div className="account-avatar" style={{ background: 'linear-gradient(135deg,#06D6A0,#059669)' }}>
                    {a.displayName[0]?.toUpperCase()}
                  </div>
                  <div className="account-info">
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.statusLabel}</div>
                  </div>
                  <span className={`timer-pill ${a.isScheduled ? 'timer-scheduled' : getTimerClass(a.timerDisplay)}`}>
                    {a.timerDisplay}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Queued */}
          {queued.length > 0 && (
            <>
              <div className="divider" />
              <div className="section-title" style={{ marginBottom: 6, color: '#C4B5FD' }}>In Queue</div>
              {queued.map(a => (
                <div className="account-item" key={a.id}>
                  <div className="account-avatar" style={{ background: 'linear-gradient(135deg,#7B68EE,#4361EE)' }}>
                    {a.displayName[0]?.toUpperCase()}
                  </div>
                  <div className="account-info">
                    <div className="account-name">{a.displayName}</div>
                    <div className="account-status">{a.statusLabel}</div>
                  </div>
                  {a.timerDisplay && (
                    <span className="timer-pill timer-scheduled">{a.timerDisplay}</span>
                  )}
                </div>
              ))}
            </>
          )}

          {accounts.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon">👤</div>
              <div className="empty-state__text">No accounts yet. Add one to get started!</div>
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
            <label className="input-label">Display Name</label>
            <input className="input" placeholder="e.g. Han" value={addForm.displayName} onChange={e => setAddForm(f => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Username</label>
            <input className="input" placeholder="Login username" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input className="input" type="password" placeholder="Login password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
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
            <label className="input-label">Username</label>
            <input className="input" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input className="input" type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* New court modal */}
      {actionModal === 'new-court' && (
        <Modal title="Create New Court" onClose={() => setActionModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateCourt}>Create</button>
          </>
        }>
          <div className="input-group">
            <label className="input-label">Court Name</label>
            <input className="input" placeholder="e.g. Court 1" value={newCourtName} onChange={e => setNewCourtName(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Start Time (optional — leave blank for now)</label>
            <input className="input" type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
          </div>
          <div className="text-sm text-muted mt-2">Playing: {selected.map(id => accounts.find(a => a.id === id)?.displayName).join(', ')}</div>
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
          <p className="text-sm text-muted mb-2">Select a court to join:</p>
          {courtsWithSlots.map(c => (
            <div
              key={c.id}
              className="select-item"
              onClick={() => setTargetCourtId(c.id)}
              style={{ background: targetCourtId === c.id ? '#EEF2FF' : undefined, padding: '10px 8px', borderRadius: 10 }}
            >
              <div className={`checkbox-circle${targetCourtId === c.id ? ' checked' : ''}`}>
                {targetCourtId === c.id && '✓'}
              </div>
              <div>
                <div className="font-bold">🏸 {c.name}</div>
                <div className="text-xs text-muted">
                  {c.current?.accountIds.length}/{c.current?.capacity} players · {c.current!.capacity - c.current!.accountIds.length} slot(s) open
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* Add to queue modal */}
      {actionModal === 'add-queue' && (
        <Modal title="Add to Queue" onClose={() => setActionModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!targetCourtId} onClick={handleAddQueue}>Queue Up</button>
          </>
        }>
          <p className="text-sm text-muted mb-2">Select court:</p>
          {courtsWithSession.map(c => (
            <div
              key={c.id}
              className="select-item"
              onClick={() => setTargetCourtId(c.id)}
              style={{ background: targetCourtId === c.id ? '#EEF2FF' : undefined, padding: '10px 8px', borderRadius: 10 }}
            >
              <div className={`checkbox-circle${targetCourtId === c.id ? ' checked' : ''}`}>
                {targetCourtId === c.id && '✓'}
              </div>
              <div className="font-bold">🏸 {c.name}</div>
            </div>
          ))}
          <div className="input-group mt-3">
            <label className="input-label">Scheduled Start (optional)</label>
            <input className="input" type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function getTimerClass(display: string): string {
  if (!display) return 'timer-idle'
  const [min] = display.split(':').map(Number)
  if (min <= 5) return 'timer-urgent'
  if (min <= 15) return 'timer-warning'
  return 'timer-ok'
}
