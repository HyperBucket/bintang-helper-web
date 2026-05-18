import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { Modal } from '../components/Modal'
import { TimePicker } from '../components/SessionForm'
import type { Account } from '../types'
import { formatCountdown, formatClockTime, SESSION_DURATION } from '../utils'

export function CourtPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useStore()
  const [now, setNow] = useState(Date.now())

  const [modal, setModal] = useState<
    | { type: 'join-session' }
    | { type: 'replace'; oldId: string }
    | { type: 'add-queue' }
    | { type: 'join-queue'; sessionId: string; currentCount: number; capacity: number }
    | { type: 'replace-queue-player'; sessionId: string; oldId: string }
    | null
  >(null)

  const [pickedAccounts, setPickedAccounts] = useState<string[]>([])
  const [timeMode, setTimeMode] = useState<'now' | 'schedule'>('now')
  const [scheduledTime, setScheduledTime] = useState('')
  // Which existing queue slot to join instead of creating new (in add-queue modal)
  const [joinTargetQueueId, setJoinTargetQueueId] = useState('')

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

  const busyIds = new Set<string>()
  for (const c of store.courts) {
    c.current?.accountIds.forEach(bid => busyIds.add(bid))
    c.queue.forEach(s => s.accountIds.forEach(bid => busyIds.add(bid)))
  }
  const freeAccounts = accounts.filter(a => !busyIds.has(a.id))

  const toHHMM = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const openPickModal = (m: typeof modal) => {
    setPickedAccounts([])
    setJoinTargetQueueId('')
    setTimeMode('now')
    if (m?.type === 'add-queue' && court.current) {
      setScheduledTime(toHHMM(court.current.startTime + SESSION_DURATION))
    } else {
      setScheduledTime(toHHMM(Date.now()))
    }
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
    const total = currentSession.accountIds.length + pickedAccounts.length
    if (total !== 2 && total !== 4) {
      alert(`Sessions must have exactly 2 or 4 players. Would be ${total}.`)
      return
    }
    store.joinSession(court.id, pickedAccounts)
    setModal(null)
  }

  const handleRemovePlayer = (accountId: string) => {
    if (!confirm('Remove this player from the session?')) return
    store.removePlayerFromSession(court.id, accountId)
  }

  const handleReplace = () => {
    if (modal?.type !== 'replace' || pickedAccounts.length !== 1) return
    store.replacePlayerInSession(court.id, modal.oldId, pickedAccounts[0])
    setModal(null)
  }

  const handleAddQueue = () => {
    const count = pickedAccounts.length
    if (count !== 2 && count !== 4) return

    if (joinTargetQueueId) {
      store.joinQueue(court.id, joinTargetQueueId, pickedAccounts)
    } else {
      let startTime = 0
      if (timeMode === 'schedule' && scheduledTime) {
        const [h, m] = scheduledTime.split(':').map(Number)
        const d = new Date()
        d.setHours(h, m, 0, 0)
        startTime = d.getTime()
      }
      store.addToQueue(court.id, pickedAccounts, count as 2 | 4, startTime)
    }
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

  const handleRemoveFromQueue = (sessionId: string, accountId: string) => {
    store.removePlayerFromQueue(court.id, sessionId, accountId)
  }

  const handleReplaceQueuePlayer = () => {
    if (modal?.type !== 'replace-queue-player' || pickedAccounts.length !== 1) return
    store.replacePlayerInQueue(court.id, modal.sessionId, modal.oldId, pickedAccounts[0])
    setModal(null)
  }

  const currentCount = currentSession?.accountIds.length ?? 0
  const slotsAvailable = currentCount === 2 ? 2 : currentCount < 2 ? 2 - currentCount : 0

  return (
    <>
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
                <div className="session-header__left">
                  <span className="session-header__icon">{isScheduled ? '⏰' : '▶'}</span>
                  <span className="session-header__title">{isScheduled ? 'Scheduled' : 'Playing Now'}</span>
                </div>
                <span className="session-header__time">
                  {isScheduled
                    ? `Starts ${formatClockTime(currentSession.startTime)}`
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
                      <button className="btn btn-danger btn-xs" onClick={() => handleRemovePlayer(aid)}>
                        Remove
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
              <div className="empty-state__icon">🏸</div>
              <div className="empty-state__title">Court is idle</div>
              <div className="empty-state__text">Go back to Accounts to start a session.</div>
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
              const needsFix = session.accountIds.length === 1 || session.accountIds.length === 3
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
                      {needsFix && (
                        <span className="badge badge-warning">{session.accountIds.length} player{session.accountIds.length > 1 ? 's' : ''} — needs 2 or 4</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {session.accountIds.length < 4 && (
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
                          <button className="btn btn-secondary btn-xs" onClick={() => openPickModal({ type: 'replace-queue-player', sessionId: session.id, oldId: aid })}>
                            Replace
                          </button>
                          <button className="btn btn-danger btn-xs" onClick={() => handleRemoveFromQueue(session.id, aid)}>
                            ✕
                          </button>
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
        <Modal
          title={`Join Session · Need ${slotsAvailable} more player${slotsAvailable > 1 ? 's' : ''}`}
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={pickedAccounts.length !== slotsAvailable}
                onClick={handleJoinSession}
              >
                Join ({pickedAccounts.length}/{slotsAvailable} selected)
              </button>
            </>
          }
        >
          <p className="text-sm text-muted mb-2">
            Currently {currentCount} player{currentCount !== 1 ? 's' : ''}. Select exactly {slotsAvailable} to reach {currentCount + slotsAvailable}:
          </p>
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
          <p className="text-sm text-muted mb-2">Select a replacement player:</p>
          <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={1} onToggle={togglePick} />
        </Modal>
      )}

      {modal?.type === 'add-queue' && (() => {
        const qCount = pickedAccounts.length
        const qValid = qCount === 2 || qCount === 4
        const qHint = qCount === 1 || qCount === 3 ? `Select 2 or 4 players (currently ${qCount})` : null
        // Existing queues that could be joined: picked count + existing = 2 or 4
        const joinableQueues = court.queue.filter(s => {
          const total = s.accountIds.length + qCount
          return total === 2 || total === 4
        })
        return (
          <Modal title="Add to Queue" onClose={() => setModal(null)} actions={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!qValid} onClick={handleAddQueue}>
                {joinTargetQueueId ? `Join Queue (${qCount} player${qCount !== 1 ? 's' : ''})` : `New Queue (${qCount} player${qCount !== 1 ? 's' : ''})`}
              </button>
            </>
          }>
            <p className="text-sm text-muted mb-2">Select 2 or 4 players:</p>
            <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={4} onToggle={togglePick} />
            {qHint && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--c-warning)', fontWeight: 600 }}>⚠ {qHint}</p>
            )}

            {/* Join existing queue option — appears when selection makes a valid total */}
            {qValid && joinableQueues.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="group-label" style={{ color: 'var(--c-primary)', marginBottom: 6 }}>Join existing queue</div>
                {joinableQueues.map(s => {
                  const total = s.accountIds.length + qCount
                  const selected = joinTargetQueueId === s.id
                  return (
                    <div
                      key={s.id}
                      className={`select-item${selected ? ' selected' : ''}`}
                      onClick={() => setJoinTargetQueueId(selected ? '' : s.id)}
                    >
                      <div className={`checkbox-circle${selected ? ' checked' : ''}`}>{selected && '✓'}</div>
                      <div>
                        <div className="font-bold text-sm">
                          {court.queue.indexOf(s) + 1}. {s.accountIds.map(aid => getAccount(aid)?.displayName).join(', ')}
                        </div>
                        <div className="text-xs text-muted">
                          {s.accountIds.length} → {total} players
                        </div>
                      </div>
                    </div>
                  )
                })}
                <p className="text-xs text-muted mt-2" style={{ opacity: 0.7 }}>
                  Or leave unselected to create a new queue slot.
                </p>
              </div>
            )}

            {!joinTargetQueueId && (
              <div style={{ marginTop: 14 }}>
                <TimePicker mode={timeMode} scheduledTime={scheduledTime} onModeChange={setTimeMode} onTimeChange={setScheduledTime} nowLabel="Up Next" />
              </div>
            )}
          </Modal>
        )
      })()}

      {modal?.type === 'join-queue' && (() => {
        const slots = 4 - modal.currentCount
        return (
          <Modal
            title={`Join Queue · ${slots} slot${slots > 1 ? 's' : ''} open`}
            onClose={() => setModal(null)}
            actions={
              <>
                <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={pickedAccounts.length === 0} onClick={handleJoinQueue}>
                  Join ({pickedAccounts.length}/{slots})
                </button>
              </>
            }
          >
            <p className="text-sm text-muted mb-2">Select up to {slots} player{slots > 1 ? 's' : ''} to join this queue:</p>
            <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={slots} onToggle={togglePick} />
          </Modal>
        )
      })()}

      {modal?.type === 'replace-queue-player' && (
        <Modal title="Replace Queued Player" onClose={() => setModal(null)} actions={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={pickedAccounts.length !== 1} onClick={handleReplaceQueuePlayer}>Replace</button>
          </>
        }>
          <p className="text-sm text-muted mb-2">Select a replacement player:</p>
          <AccountPicker accounts={freeAccounts} picked={pickedAccounts} max={1} onToggle={togglePick} />
        </Modal>
      )}
    </>
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
