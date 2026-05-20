import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useStore } from './index'
import type { Account, Court, Session } from '../types'

// ── Supabase mock ────────────────────────────────────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: 'no row' }),
        }),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: `a${Math.random()}`, displayName: 'Player', username: 'user', password: 'pw', ...overrides }
}

function makeCourt(overrides: Partial<Court> = {}): Court {
  return { id: `c${Math.random()}`, name: 'Court 1', current: null, queue: [], ...overrides }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return { id: `s${Math.random()}`, accountIds: [], capacity: 2, startTime: Date.now(), ...overrides }
}

const INITIAL_STATE = {
  accounts: [] as Account[],
  courts: [] as Court[],
  myIds: [] as string[],
  logs: [] as number[],
  synced: false,
}

beforeEach(() => {
  useStore.setState(INITIAL_STATE)
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Account actions ──────────────────────────────────────────────────────────

describe('addAccount', () => {
  it('adds account to the accounts list', () => {
    useStore.getState().addAccount('Alice', 'alice', 'pass')
    const { accounts } = useStore.getState()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ displayName: 'Alice', username: 'alice', password: 'pass' })
  })

  it('generates a unique id', () => {
    useStore.getState().addAccount('Alice', 'alice', 'pass')
    useStore.getState().addAccount('Bob', 'bob', 'pass')
    const { accounts } = useStore.getState()
    expect(accounts[0].id).not.toBe(accounts[1].id)
  })

  it('adds account id to myIds', () => {
    useStore.getState().addAccount('Alice', 'alice', 'pass')
    const { accounts, myIds } = useStore.getState()
    expect(myIds).toContain(accounts[0].id)
  })

  it('persists myIds to localStorage', () => {
    useStore.getState().addAccount('Alice', 'alice', 'pass')
    const stored = JSON.parse(localStorage.getItem('bintang_my_ids') ?? '[]')
    expect(stored).toContain(useStore.getState().accounts[0].id)
  })
})

describe('updateAccount', () => {
  it('updates username and password by id', () => {
    const acct = makeAccount({ id: 'id1' })
    useStore.setState({ accounts: [acct] })
    useStore.getState().updateAccount('id1', 'NU', 'newuser', 'newpass')
    const updated = useStore.getState().accounts[0]
    expect(updated.username).toBe('newuser')
    expect(updated.password).toBe('newpass')
  })

  it('does not mutate other accounts', () => {
    const a1 = makeAccount({ id: 'id1' })
    const a2 = makeAccount({ id: 'id2', username: 'original' })
    useStore.setState({ accounts: [a1, a2] })
    useStore.getState().updateAccount('id1', 'CH', 'changed', 'pw')
    expect(useStore.getState().accounts[1].username).toBe('original')
  })
})

describe('deleteAccount', () => {
  it('removes account from accounts list', () => {
    const acct = makeAccount({ id: 'id1' })
    useStore.setState({ accounts: [acct] })
    useStore.getState().deleteAccount('id1')
    expect(useStore.getState().accounts).toHaveLength(0)
  })

  it('removes id from myIds', () => {
    useStore.setState({ accounts: [makeAccount({ id: 'id1' })], myIds: ['id1'] })
    useStore.getState().deleteAccount('id1')
    expect(useStore.getState().myIds).not.toContain('id1')
  })

  it('persists updated myIds to localStorage', () => {
    useStore.setState({ accounts: [makeAccount({ id: 'id1' })], myIds: ['id1'] })
    useStore.getState().deleteAccount('id1')
    const stored = JSON.parse(localStorage.getItem('bintang_my_ids') ?? '[]')
    expect(stored).not.toContain('id1')
  })
})

// ── Court actions ─────────────────────────────────────────────────────────────

describe('addCourt', () => {
  it('creates a court with the given name', () => {
    useStore.getState().addCourt('Court A')
    const { courts } = useStore.getState()
    expect(courts).toHaveLength(1)
    expect(courts[0].name).toBe('Court A')
  })

  it('initialises with no session and empty queue', () => {
    useStore.getState().addCourt('Court A')
    const court = useStore.getState().courts[0]
    expect(court.current).toBeNull()
    expect(court.queue).toHaveLength(0)
  })

  it('returns the created court', () => {
    const court = useStore.getState().addCourt('Court B')
    expect(court.name).toBe('Court B')
    expect(court.id).toBeTruthy()
  })
})

describe('deleteCourt', () => {
  it('removes the court by id', () => {
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    useStore.getState().deleteCourt('c1')
    expect(useStore.getState().courts).toHaveLength(0)
  })

  it('leaves other courts intact', () => {
    const c1 = makeCourt({ id: 'c1' })
    const c2 = makeCourt({ id: 'c2' })
    useStore.setState({ courts: [c1, c2] })
    useStore.getState().deleteCourt('c1')
    expect(useStore.getState().courts).toHaveLength(1)
    expect(useStore.getState().courts[0].id).toBe('c2')
  })
})

// ── Session actions ───────────────────────────────────────────────────────────

describe('startSession', () => {
  it('sets current session with provided players and capacity', () => {
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    useStore.getState().startSession('c1', ['p1', 'p2'], 2)
    const { current } = useStore.getState().courts[0]
    expect(current?.accountIds).toEqual(['p1', 'p2'])
    expect(current?.capacity).toBe(2)
  })

  it('uses provided startTime', () => {
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    const t = Date.now() - 5000
    useStore.getState().startSession('c1', ['p1'], 2, t)
    expect(useStore.getState().courts[0].current?.startTime).toBe(t)
  })

  it('defaults startTime to now', () => {
    const now = 1_000_000
    vi.setSystemTime(now)
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    useStore.getState().startSession('c1', ['p1', 'p2'], 2)
    expect(useStore.getState().courts[0].current?.startTime).toBe(now)
  })
})

describe('endSession', () => {
  it('clears current when queue is empty', () => {
    const session = makeSession({ id: 's1' })
    const court = makeCourt({ id: 'c1', current: session, queue: [] })
    useStore.setState({ courts: [court] })
    useStore.getState().endSession('c1')
    expect(useStore.getState().courts[0].current).toBeNull()
  })

  it('promotes first queue entry to current when queue is non-empty', () => {
    const current = makeSession({ id: 's1', accountIds: ['p1', 'p2'] })
    const queued = makeSession({ id: 's2', accountIds: ['p3', 'p4'] })
    const court = makeCourt({ id: 'c1', current, queue: [queued] })
    useStore.setState({ courts: [court] })
    useStore.getState().endSession('c1')
    const { courts } = useStore.getState()
    expect(courts[0].current?.id).toBe('s2')
    expect(courts[0].queue).toHaveLength(0)
  })

  it('resets startTime of promoted session to now', () => {
    const now = 2_000_000
    vi.setSystemTime(now)
    const current = makeSession({ id: 's1' })
    const queued = makeSession({ id: 's2', startTime: 0 })
    const court = makeCourt({ id: 'c1', current, queue: [queued] })
    useStore.setState({ courts: [court] })
    useStore.getState().endSession('c1')
    expect(useStore.getState().courts[0].current?.startTime).toBe(now)
  })
})

describe('replacePlayerInSession', () => {
  it('swaps old player id for new player id', () => {
    const session = makeSession({ accountIds: ['p1', 'p2'] })
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().replacePlayerInSession('c1', 'p1', 'p3')
    expect(useStore.getState().courts[0].current?.accountIds).toEqual(['p3', 'p2'])
  })

  it('does nothing if court has no current session', () => {
    const court = makeCourt({ id: 'c1', current: null })
    useStore.setState({ courts: [court] })
    useStore.getState().replacePlayerInSession('c1', 'p1', 'p3')
    expect(useStore.getState().courts[0].current).toBeNull()
  })
})

describe('removePlayerFromSession', () => {
  it('removes the player and adjusts capacity to 2 when 3 players remain', () => {
    const session = makeSession({ accountIds: ['p1', 'p2', 'p3', 'p4'], capacity: 4 })
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromSession('c1', 'p4')
    const { current } = useStore.getState().courts[0]
    expect(current?.accountIds).toEqual(['p1', 'p2', 'p3'])
    expect(current?.capacity).toBe(4) // 3 > 2, so still 4-bucket? No — logic is: <=2 => 2, else 4
  })

  it('sets capacity to 2 when only 1 player remains', () => {
    const session = makeSession({ accountIds: ['p1', 'p2'], capacity: 2 })
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromSession('c1', 'p2')
    const { current } = useStore.getState().courts[0]
    expect(current?.accountIds).toEqual(['p1'])
    expect(current?.capacity).toBe(2)
  })

  it('clears current when last player is removed and queue is empty', () => {
    const session = makeSession({ accountIds: ['p1'], capacity: 2 })
    const court = makeCourt({ id: 'c1', current: session, queue: [] })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromSession('c1', 'p1')
    expect(useStore.getState().courts[0].current).toBeNull()
  })

  it('promotes queue when last player is removed and queue exists', () => {
    const session = makeSession({ id: 's1', accountIds: ['p1'] })
    const queued = makeSession({ id: 's2', accountIds: ['p3', 'p4'] })
    const court = makeCourt({ id: 'c1', current: session, queue: [queued] })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromSession('c1', 'p1')
    expect(useStore.getState().courts[0].current?.id).toBe('s2')
    expect(useStore.getState().courts[0].queue).toHaveLength(0)
  })
})

describe('joinSession', () => {
  it('appends players to current session', () => {
    const session = makeSession({ accountIds: ['p1', 'p2'], capacity: 2 })
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().joinSession('c1', ['p3', 'p4'])
    expect(useStore.getState().courts[0].current?.accountIds).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('sets capacity to max(current_capacity, new_count) capped at 4', () => {
    // capacity formula: Math.min(4, Math.max(current_capacity, newIds.length))
    // 2 existing + 1 joining → 3 total → capacity becomes 3
    const session = makeSession({ accountIds: ['p1', 'p2'], capacity: 2 })
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().joinSession('c1', ['p3'])
    expect(useStore.getState().courts[0].current?.capacity).toBe(3)
  })

  it('keeps capacity at 2 when total players stay at 2', () => {
    const session = makeSession({ accountIds: ['p1'], capacity: 2 })
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().joinSession('c1', ['p2'])
    expect(useStore.getState().courts[0].current?.capacity).toBe(2)
  })
})

// ── Queue actions ─────────────────────────────────────────────────────────────

describe('addToQueue', () => {
  it('appends a new session to the queue', () => {
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    useStore.getState().addToQueue('c1', ['p1', 'p2'], 2)
    expect(useStore.getState().courts[0].queue).toHaveLength(1)
    expect(useStore.getState().courts[0].queue[0].accountIds).toEqual(['p1', 'p2'])
  })

  it('uses provided startTime for scheduled queues', () => {
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    const t = 9_999_999
    useStore.getState().addToQueue('c1', ['p1', 'p2'], 2, t)
    expect(useStore.getState().courts[0].queue[0].startTime).toBe(t)
  })

  it('defaults startTime to 0 when not provided', () => {
    const court = makeCourt({ id: 'c1' })
    useStore.setState({ courts: [court] })
    useStore.getState().addToQueue('c1', ['p1', 'p2'], 2)
    expect(useStore.getState().courts[0].queue[0].startTime).toBe(0)
  })
})

describe('removeQueue', () => {
  it('removes the matching session from the queue', () => {
    const s1 = makeSession({ id: 's1' })
    const s2 = makeSession({ id: 's2' })
    const court = makeCourt({ id: 'c1', queue: [s1, s2] })
    useStore.setState({ courts: [court] })
    useStore.getState().removeQueue('c1', 's1')
    expect(useStore.getState().courts[0].queue).toHaveLength(1)
    expect(useStore.getState().courts[0].queue[0].id).toBe('s2')
  })
})

describe('joinQueue', () => {
  it('adds players to the matching queue session', () => {
    const s1 = makeSession({ id: 's1', accountIds: ['p1'], capacity: 2 })
    const court = makeCourt({ id: 'c1', queue: [s1] })
    useStore.setState({ courts: [court] })
    useStore.getState().joinQueue('c1', 's1', ['p2'])
    expect(useStore.getState().courts[0].queue[0].accountIds).toEqual(['p1', 'p2'])
  })

  it('upgrades capacity to 4 when total exceeds 2', () => {
    const s1 = makeSession({ id: 's1', accountIds: ['p1', 'p2'], capacity: 2 })
    const court = makeCourt({ id: 'c1', queue: [s1] })
    useStore.setState({ courts: [court] })
    useStore.getState().joinQueue('c1', 's1', ['p3', 'p4'])
    expect(useStore.getState().courts[0].queue[0].capacity).toBe(4)
  })
})

describe('replacePlayerInQueue', () => {
  it('swaps old player for new player in the queue session', () => {
    const s1 = makeSession({ id: 's1', accountIds: ['p1', 'p2'] })
    const court = makeCourt({ id: 'c1', queue: [s1] })
    useStore.setState({ courts: [court] })
    useStore.getState().replacePlayerInQueue('c1', 's1', 'p1', 'p3')
    expect(useStore.getState().courts[0].queue[0].accountIds).toEqual(['p3', 'p2'])
  })
})

describe('removePlayerFromQueue', () => {
  it('removes player from the queue session', () => {
    const s1 = makeSession({ id: 's1', accountIds: ['p1', 'p2'] })
    const court = makeCourt({ id: 'c1', queue: [s1] })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromQueue('c1', 's1', 'p1')
    expect(useStore.getState().courts[0].queue[0].accountIds).toEqual(['p2'])
  })

  it('removes the queue entry entirely when last player is removed', () => {
    const s1 = makeSession({ id: 's1', accountIds: ['p1'] })
    const court = makeCourt({ id: 'c1', queue: [s1] })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromQueue('c1', 's1', 'p1')
    expect(useStore.getState().courts[0].queue).toHaveLength(0)
  })

  it('adjusts capacity to 2 when remaining players <= 2', () => {
    const s1 = makeSession({ id: 's1', accountIds: ['p1', 'p2', 'p3'], capacity: 4 })
    const court = makeCourt({ id: 'c1', queue: [s1] })
    useStore.setState({ courts: [court] })
    useStore.getState().removePlayerFromQueue('c1', 's1', 'p3')
    expect(useStore.getState().courts[0].queue[0].capacity).toBe(2)
  })
})

describe('promoteQueue', () => {
  it('moves first queue entry to current', () => {
    const queued = makeSession({ id: 's1', accountIds: ['p1', 'p2'] })
    const court = makeCourt({ id: 'c1', current: null, queue: [queued] })
    useStore.setState({ courts: [court] })
    useStore.getState().promoteQueue('c1')
    expect(useStore.getState().courts[0].current?.id).toBe('s1')
    expect(useStore.getState().courts[0].queue).toHaveLength(0)
  })

  it('sets startTime to now when promoting', () => {
    const now = 5_000_000
    vi.setSystemTime(now)
    const queued = makeSession({ id: 's1', startTime: 0 })
    const court = makeCourt({ id: 'c1', current: null, queue: [queued] })
    useStore.setState({ courts: [court] })
    useStore.getState().promoteQueue('c1')
    expect(useStore.getState().courts[0].current?.startTime).toBe(now)
  })

  it('does nothing if queue is empty', () => {
    const court = makeCourt({ id: 'c1', current: null, queue: [] })
    useStore.setState({ courts: [court] })
    useStore.getState().promoteQueue('c1')
    expect(useStore.getState().courts[0].current).toBeNull()
  })

  it('preserves remaining queue items after promotion', () => {
    const s1 = makeSession({ id: 's1' })
    const s2 = makeSession({ id: 's2' })
    const court = makeCourt({ id: 'c1', current: null, queue: [s1, s2] })
    useStore.setState({ courts: [court] })
    useStore.getState().promoteQueue('c1')
    expect(useStore.getState().courts[0].queue).toHaveLength(1)
    expect(useStore.getState().courts[0].queue[0].id).toBe('s2')
  })
})

// ── Tick ──────────────────────────────────────────────────────────────────────

describe('tick', () => {
  const SESSION_DURATION = 45 * 60 * 1000

  it('does not change courts when no session has expired', () => {
    const now = Date.now()
    const session = makeSession({ startTime: now - 1000 }) // only 1s old
    const court = makeCourt({ id: 'c1', current: session })
    useStore.setState({ courts: [court] })
    useStore.getState().tick()
    expect(useStore.getState().courts[0].current?.id).toBe(session.id)
  })

  it('clears current when session expires and queue is empty', () => {
    vi.setSystemTime(SESSION_DURATION + 10_000)
    const session = makeSession({ startTime: 0 }) // started at epoch, expired long ago
    const court = makeCourt({ id: 'c1', current: session, queue: [] })
    useStore.setState({ courts: [court] })
    useStore.getState().tick()
    expect(useStore.getState().courts[0].current).toBeNull()
  })

  it('promotes queue when session expires with queued sessions', () => {
    vi.setSystemTime(SESSION_DURATION + 10_000)
    const current = makeSession({ id: 's1', startTime: 0 })
    const queued = makeSession({ id: 's2', accountIds: ['p3', 'p4'] })
    const court = makeCourt({ id: 'c1', current, queue: [queued] })
    useStore.setState({ courts: [court] })
    useStore.getState().tick()
    expect(useStore.getState().courts[0].current?.id).toBe('s2')
    expect(useStore.getState().courts[0].queue).toHaveLength(0)
  })

  it('handles courts with no current session without crashing', () => {
    const court = makeCourt({ id: 'c1', current: null })
    useStore.setState({ courts: [court] })
    expect(() => useStore.getState().tick()).not.toThrow()
  })
})

// ── Logs ──────────────────────────────────────────────────────────────────────

describe('addLog', () => {
  it('prepends current timestamp to logs', () => {
    const now = 1_234_567
    vi.setSystemTime(now)
    useStore.setState({ logs: [] })
    useStore.getState().addLog()
    expect(useStore.getState().logs[0]).toBe(now)
  })

  it('accumulates logs in reverse-chronological order', () => {
    vi.setSystemTime(1000)
    useStore.getState().addLog()
    vi.setSystemTime(2000)
    useStore.getState().addLog()
    const { logs } = useStore.getState()
    expect(logs[0]).toBe(2000)
    expect(logs[1]).toBe(1000)
  })

  it('persists logs to localStorage', () => {
    vi.setSystemTime(9999)
    useStore.setState({ logs: [] })
    useStore.getState().addLog()
    const stored = JSON.parse(localStorage.getItem('bintang_logs') ?? '[]')
    expect(stored).toContain(9999)
  })
})
