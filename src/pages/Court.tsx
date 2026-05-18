import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { Modal } from '../components/Modal'
import type { Account } from '../types'
import { formatCountdown, formatClockTime, SESSION_DURATION } from '../utils'

export function CourtPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useStore()
  const [now, setNow] = useState(Date.now())

  // Modals
  const [modal, setModal] = useState<
    | { type: 'join-session' }
    | { type: 'replace'; oldId: string }
    | { type: 'add-queue' }
    | { type: 'join-queue'; sessionId: string; currentCount: number; capacity: number }
    | null
  >(null)

  const [pickedAccounts, setPickedAccounts] = useState<string[]>([])
  const [scheduledTime, setScheduledTime] = useState('')

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [])

  const court = store.courts.find(c => c.id === id)

  useEffect(() => {
    if (!court) navigate('/', { replace: true })
  }, [court, navigate])

  if (!court) return null

  const { accounts } = store
  const currentSession = court.current
  const isScheduled = currentSession ? currentSession.startTime > now : false
  const expiry = currentSession ? currentSession.startTime + SESSION_DURATION : 0
  const remaining = expiry - now
  const display = currentSession
    ? isScheduled
      ? `Starts ${formatClockTime(currentSession.startTime)}`
      : formatCountdown(remaining)
    : ''

  const timerClass = !currentSession ? 'timer-idle'
    : isScheduled ? 'timer-scheduled'
    : remaining <= 5 * 60 * 1000 ? 'timer-urgent'
    : remaining <= 15 * 60 * 1000 ? 'timer-warning'
    : 'timer-ok'

  const getAccount = (aid: string) => accounts.find(a => a.id === aid)

  // Accounts not currently in any session/queue for picking
  const busyIds = new Set<string>()
  for (const c of store.courts) {
    c.current?.accountIds.forEach(id => busyIds.add(id))
    c.queue.forEach(s => s.accountIds.forEach(id => busyIds.add(id)))
  }
  const freeAccounts = accounts.filter(a => !busyIds.has(a.id))

  const openPickModal = (m: typeof modal) => {
    setPickedAccounts([])
    setScheduledTime('')
    setModal(m)
  }

  const togglePick = (aid: string, max: number) => {
    setPickedAccounts(prev =>
      prev.includes(aid) ? prev.filter(x => x !== aid) : prev.length < max ? [...prev, aid] : prev
    )
  }

  const handleEndSession = () => {
    if (!confirm('End current session?')) return
    store.endSession(court.id)
    if (court.queue.length === 0) navigate('/courts', { replace: true })
  }

  const handleJoinSession = () => {
    if (!currentSession || pickedAccounts.length === 0) return
    store.joinSession(court.id, pickedAccounts)
    setModal(null)
  }

  const handleReplace = () => {
    if (modal?.type !== 'replace' || pickedAccounts.length !== 1) return
    store.replacePlayerInSession(court.id, modal.oldId, pickedAccounts[0])
    setModal(null)
  }

  const handleAddQueue = () => {
    const startTime = scheduledTime ? new Date(scheduledTime).getTime() : 0
    if (pickedAccounts.length < 2) { alert('Select at least 2 accounts'); return }
    store.addToQueue(court.id, pickedAccounts, startTime)
    setModal(null)
  }

  const handleJoinQueue = () => {
    if (modal?.type !== 'join-queue' || pickedAccounts.length === 0) return
    store.joinQueue(court.id, modal.sessionId, pickedAccounts)
    setModal(null)
  }

  const handleRemoveQueue = (sessionId: string) => {
    if (!confirm('Remove this queue?')) return
    store.removeQueue(court.id, sessionId)
  }

  const slotsAvailable = currentSession ? currentSession.capacity - currentSession.accountIds.length : 0

  return (
    <div className="app-shell">
      <div className="nav-bar">
        <button className="nav-bar__back" onClick={() => navigate('/courts')}>←</button>
        <span className="nav-bar__title">🏸 {court.name}</span>
        {currentSession && (
          <span className={`timer-pill ${timerClass}`}>{display}</span>
        )}
      </div>
      <div className="page-content">

        {/* Current session */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Current Session</span>
          </div>

          {currentSession ? (
            <div className="session-block">
              <div className="session-header">
                <span className="session-header__title">
                  {isScheduled ? '⏰ Scheduled' : '▶ Playing'}
                </span>
                <span className="session-header__time">
                  {isScheduled
                    ? `Starts at ${formatClockTime(currentSession.startTime)}`
                    : `${formatClockTime(currentSession.startTime)} → ${formatClockTime(expiry)}`
                  }
                </span>
              </div>
              <div className="session-body">
                {currentSession.accountIds.map(aid => {
                  const a = getAccount(aid)
                  if (!a) return null
                  return (
                    <div className="account-item" key={aid}>
                      <div className="account-avatar">{a.displayName[0]?.toUpperCase()}</div>
                      <div className="account-info">
                        <div className="account-name">{a.displayName}</div>
                        <div className="account-status">{a.username}</div>
                      </div>
                      <button className="btn btn-secondary btn-xs" onClick={() => openPickModal({ type: 'replace', oldId: aid })}>
                        Replace
                      </button>
                    </div>
                  )
                })}
                <div className="flex gap-2 mt-3">
                  {slotsAvailable > 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openPickModal({ type: 'join-session' })}>
                      + Join ({slotsAvailable} slot{slotsAvailable > 1 ? 's' : ''})
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={handleEndSession}>End Session</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state__icon">💤</div>
              <div className="empty-state__text">Court is idle</div>
            </div>
          )}
        </div>

        {/* Queue */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Queue</span>
            {currentSession && (
              <button className="btn btn-primary btn-sm" onClick={() => openPickModal({ type: 'add-queue' })}>
                + Add Queue
              </button>
            )}
          </div>

          {court.queue.length === 0 ? (
            <div className="empty-state" style={{ padding: '16px 0' }}>
              <div className="empty-state__text">No one in queue</div>
            </div>
          ) : (
            court.queue.map((session, idx) => {
              const isUpNext = idx === 0
              const qScheduled = session.startTime > now
              return (
                <div className="queue-item" key={session.id}>
                  <div className="queue-header">
                    <div className="flex items-center gap-2">
                      <span className="queue-title">Queue {idx + 1}</span>
                      {isUpNext && <span className="badge badge-success">Up Next</span>}
                      {qScheduled && (
                        <span className="badge badge-purple">
                          {formatClockTime(session.startTime)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {session.accountIds.length < session.capacity && (
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => openPickModal({
                            type: 'join-queue',
                            sessionId: session.id,
                            currentCount: session.accountIds.length,
                            capacity: session.capacity,
                          })}
                        >
                          Join
                        </button>
                      )}
                      <button className="btn btn-danger btn-xs" onClick={() => handleRemoveQueue(session.id)}>Remove</button>
                    </div>
                  </div>
                  <div className="queue-body">
                    {session.accountIds.map(aid => {
                      const a = getAccount(aid)
                      if (!a) return null
                      return (
                        <div className="account-item" key={aid} style={{ padding: '6px 0' }}>
                          <div className="account-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                            {a.displayName[0]?.toUpperCase()}
                          </div>
                          <div className="account-info">
                            <div className="account-name" style={{ fontSize: 13 }}>{a.displayName}</div>
                            <div className="account-status">{a.username}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Modals */}
      {modal?.type === 'join-session' && (
        <Modal title={`Join Session (${slotsAvailable} slot${slotsAvailable > 1 ? 's' : ''})`} onClose={() => setModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={pickedAccounts.length === 0} onClick={handleJoinSession}>Join</button>
          </>
        }>
          <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={slotsAvailable} onToggle={togglePick} />
        </Modal>
      )}

      {modal?.type === 'replace' && (
        <Modal title="Replace Player" onClose={() => setModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={pickedAccounts.length !== 1} onClick={handleReplace}>Replace</button>
          </>
        }>
          <p className="text-sm text-muted mb-2">Select replacement player:</p>
          <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={1} onToggle={togglePick} />
        </Modal>
      )}

      {modal?.type === 'add-queue' && (
        <Modal title="Add to Queue" onClose={() => setModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={pickedAccounts.length < 2} onClick={handleAddQueue}>Add Queue</button>
          </>
        }>
          <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={4} onToggle={togglePick} />
          <div className="input-group mt-3">
            <label className="input-label">Scheduled Start (optional)</label>
            <input className="input" type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
          </div>
        </Modal>
      )}

      {modal?.type === 'join-queue' && (
        <Modal
          title={`Join Queue (${modal.capacity - modal.currentCount} slot${modal.capacity - modal.currentCount > 1 ? 's' : ''})`}
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={pickedAccounts.length === 0} onClick={handleJoinQueue}>Join</button>
            </>
          }
        >
          <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={modal.capacity - modal.currentCount} onToggle={togglePick} />
        </Modal>
      )}
    </div>
  )
}

function AccountPicker({ accounts, picked, max, onToggle }: {
  accounts: Account[]
  picked: string[]
  max: number
  onToggle: (id: string, max: number) => void
}) {
  if (accounts.length === 0) {
    return <div className="empty-state" style={{ padding: 16 }}><div className="empty-state__text">No available accounts</div></div>
  }
  return (
    <>
      {accounts.map(a => (
        <div className="select-item" key={a.id} onClick={() => onToggle(a.id, max)}>
          <div className={`checkbox-circle${picked.includes(a.id) ? ' checked' : ''}`}>
            {picked.includes(a.id) && '✓'}
          </div>
          <div className="account-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{a.displayName[0]?.toUpperCase()}</div>
          <div>
            <div className="font-bold text-sm">{a.displayName}</div>
            <div className="text-xs text-muted">{a.username}</div>
          </div>
        </div>
      ))}
    </>
  )
}
