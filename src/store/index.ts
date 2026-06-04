import { create } from 'zustand'
import type { Account, Court, Session } from '../types'
import { generateId, SESSION_DURATION } from '../utils'
import { supabase } from '../lib/supabase'

const STORAGE_MY_IDS = 'bintang_my_ids'
const STORAGE_LOGS   = 'bintang_logs'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function saveLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── Court DB helpers ──────────────────────────────────────────────────

type SessionRow = { id: string; court_id: string; status: string; capacity: number; start_time: number }
type PlayerRow  = { session_id: string; account_id: string }

async function fetchCourtsFromDB(): Promise<Court[]> {
  const [c, s, p] = await Promise.all([
    supabase.from('courts').select('id, name').order('created_at'),
    supabase.from('sessions').select('id, court_id, status, capacity, start_time').order('created_at'),
    supabase.from('session_players').select('session_id, account_id'),
  ])

  const playersBySess = new Map<string, string[]>()
  for (const row of (p.data ?? []) as PlayerRow[]) {
    if (!playersBySess.has(row.session_id)) playersBySess.set(row.session_id, [])
    playersBySess.get(row.session_id)!.push(row.account_id)
  }

  const toSession = (row: SessionRow): Session => ({
    id: row.id,
    accountIds: playersBySess.get(row.id) ?? [],
    capacity: row.capacity,
    startTime: row.start_time,
  })

  const byCourt = new Map<string, { current: Session | null; queue: Session[] }>()
  for (const row of (s.data ?? []) as SessionRow[]) {
    if (!byCourt.has(row.court_id)) byCourt.set(row.court_id, { current: null, queue: [] })
    const entry = byCourt.get(row.court_id)!
    if (row.status === 'current') entry.current = toSession(row)
    else entry.queue.push(toSession(row))
  }

  return ((c.data ?? []) as { id: string; name: string }[]).map(row => ({
    id:      row.id,
    name:    row.name,
    current: byCourt.get(row.id)?.current ?? null,
    queue:   byCourt.get(row.id)?.queue   ?? [],
  }))
}

// Debounced refresh — multiple real-time events collapse into one fetch
let courtRefreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleCourtRefresh(setState: (s: { courts: Court[] }) => void) {
  if (courtRefreshTimer) clearTimeout(courtRefreshTimer)
  courtRefreshTimer = setTimeout(async () => {
    const courts = await fetchCourtsFromDB()
    setState({ courts })
  }, 200)
}

// Prevent tick() from firing duplicate endSession calls while one is in-flight
const processingCourts = new Set<string>()

// ── Store interface ───────────────────────────────────────────────────

interface AppStore {
  accounts: Account[]
  courts:   Court[]
  myIds:    string[]
  logs:     number[]
  synced:   boolean

  addAccount:    (displayName: string, username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  updateAccount: (id: string, displayName: string, username: string, password: string) => void
  deleteAccount: (id: string) => void

  addCourt:    (name: string) => Court
  deleteCourt: (courtId: string) => void

  startSession:           (courtId: string, accountIds: string[], capacity: 2 | 4, startTime?: number) => void
  endSession:             (courtId: string) => void
  replacePlayerInSession: (courtId: string, oldAccountId: string, newAccountId: string) => void
  removePlayerFromSession:(courtId: string, accountId: string) => void
  joinSession:            (courtId: string, accountIds: string[]) => void

  addToQueue:          (courtId: string, accountIds: string[], capacity: 2 | 4, startTime?: number) => void
  removeQueue:         (courtId: string, sessionId: string) => void
  joinQueue:           (courtId: string, sessionId: string, accountIds: string[]) => void
  replacePlayerInQueue:(courtId: string, sessionId: string, oldAccountId: string, newAccountId: string) => void
  removePlayerFromQueue:(courtId: string, sessionId: string, accountId: string) => void
  promoteQueue:        (courtId: string) => void

  tick:     () => void
  hydrate:  () => void
  addLog:   () => void
}

// ── Store implementation ──────────────────────────────────────────────

export const useStore = create<AppStore>((set, get) => ({
  accounts: [],
  courts:   [],
  myIds:    [],
  logs:     [],
  synced:   false,

  // ── Hydrate ──────────────────────────────────────────────────────────
  hydrate() {
    set({
      myIds: load<string[]>(STORAGE_MY_IDS, []),
      logs:  load<number[]>(STORAGE_LOGS, []),
    })

    // Accounts: dedicated table
    supabase.from('accounts').select('id, display_name, username, password')
      .then(({ data, error }) => {
        if (!error && data) {
          set({
            accounts: data.map(r => ({
              id:          r.id,
              displayName: r.display_name,
              username:    r.username,
              password:    r.password,
            })),
          })
        }
      })

    // Courts: fetch from relational tables
    fetchCourtsFromDB().then(courts => set({ courts, synced: true }))

    // ── Real-time subscriptions ──────────────────────────────────────

    // Accounts
    const exAcc = supabase.getChannels().find(c => c.topic === 'realtime:accounts_sync')
    if (exAcc) supabase.removeChannel(exAcc)
    supabase.channel('accounts_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, payload => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as { id: string; display_name: string; username: string; password: string }
          const acc: Account = { id: r.id, displayName: r.display_name, username: r.username, password: r.password }
          if (!get().accounts.some(a => a.id === acc.id))
            set({ accounts: [...get().accounts, acc] })
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as { id: string; display_name: string; username: string; password: string }
          set({ accounts: get().accounts.map(a => a.id === r.id
            ? { id: r.id, displayName: r.display_name, username: r.username, password: r.password }
            : a
          )})
        } else if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id: string }).id
          set({ accounts: get().accounts.filter(a => a.id !== oldId) })
        }
      })
      .subscribe()

    // Courts + sessions + session_players — any change triggers a debounced re-fetch
    const exCourts = supabase.getChannels().find(c => c.topic === 'realtime:courts_sync')
    if (exCourts) supabase.removeChannel(exCourts)
    supabase.channel('courts_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courts' },          () => scheduleCourtRefresh(set))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' },        () => scheduleCourtRefresh(set))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_players' }, () => scheduleCourtRefresh(set))
      .subscribe()
  },

  // ── Logs ─────────────────────────────────────────────────────────────
  addLog() {
    const logs = [Date.now(), ...get().logs]
    saveLocal(STORAGE_LOGS, logs)
    set({ logs })
  },

  // ── Accounts ─────────────────────────────────────────────────────────
  async addAccount(displayName, username, password) {
    const account: Account = { id: generateId(), displayName, username, password }
    const myIds = [...get().myIds, account.id]
    saveLocal(STORAGE_MY_IDS, myIds)
    set({ accounts: [...get().accounts, account], myIds })

    const { error } = await supabase.from('accounts')
      .insert({ id: account.id, display_name: displayName, username, password })

    if (error) {
      set({
        accounts: get().accounts.filter(a => a.id !== account.id),
        myIds:    get().myIds.filter(id => id !== account.id),
      })
      saveLocal(STORAGE_MY_IDS, get().myIds.filter(id => id !== account.id))
      return { ok: false, error: error.message }
    }
    return { ok: true }
  },

  updateAccount(id, displayName, username, password) {
    set({ accounts: get().accounts.map(a => a.id === id ? { ...a, displayName, username, password } : a) })
    supabase.from('accounts')
      .update({ display_name: displayName, username, password })
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('updateAccount:', error.message) })
  },

  deleteAccount(id) {
    const myIds = get().myIds.filter(mid => mid !== id)
    saveLocal(STORAGE_MY_IDS, myIds)
    set({ accounts: get().accounts.filter(a => a.id !== id), myIds })
    supabase.from('accounts').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('deleteAccount:', error.message) })
  },

  // ── Courts ────────────────────────────────────────────────────────────
  addCourt(name) {
    const court: Court = { id: generateId(), name, current: null, queue: [] }
    set({ courts: [...get().courts, court] })
    supabase.from('courts').insert({ id: court.id, name })
      .then(({ error }) => { if (error) console.error('addCourt:', error.message) })
    return court
  },

  deleteCourt(courtId) {
    set({ courts: get().courts.filter(c => c.id !== courtId) })
    // CASCADE deletes sessions + session_players automatically
    supabase.from('courts').delete().eq('id', courtId)
      .then(({ error }) => { if (error) console.error('deleteCourt:', error.message) })
  },

  // ── Sessions ──────────────────────────────────────────────────────────
  startSession(courtId, accountIds, capacity, startTime) {
    const existingCurrent = get().courts.find(c => c.id === courtId)?.current
    const session: Session = { id: generateId(), accountIds, capacity, startTime: startTime ?? Date.now() }

    // Optimistic
    set({ courts: get().courts.map(c => c.id === courtId ? { ...c, current: session } : c) })

    // DB: delete existing current session if any, then insert new
    const doWrite = async () => {
      if (existingCurrent) {
        await supabase.from('sessions').delete().eq('id', existingCurrent.id)
      }
      const { error: se } = await supabase.from('sessions').insert({
        id: session.id, court_id: courtId, status: 'current',
        capacity, start_time: session.startTime,
      })
      if (se) { console.error('startSession (session):', se.message); return }
      if (accountIds.length > 0) {
        const { error: pe } = await supabase.from('session_players').insert(
          accountIds.map(aid => ({ session_id: session.id, account_id: aid }))
        )
        if (pe) console.error('startSession (players):', pe.message)
      }
    }
    doWrite()
  },

  endSession(courtId) {
    const court = get().courts.find(c => c.id === courtId)
    if (!court?.current) return

    const currentId = court.current.id
    const nextSession = court.queue[0] ?? null
    const newStartTime = Date.now()

    // Optimistic
    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId) return c
        if (nextSession) {
          const [, ...rest] = c.queue
          return { ...c, current: { ...nextSession, startTime: newStartTime }, queue: rest }
        }
        return { ...c, current: null }
      }),
    })

    // DB
    const doWrite = async () => {
      await supabase.from('sessions').delete().eq('id', currentId)
      if (nextSession) {
        await supabase.from('sessions')
          .update({ status: 'current', start_time: newStartTime })
          .eq('id', nextSession.id)
      }
    }
    doWrite()
  },

  replacePlayerInSession(courtId, oldAccountId, newAccountId) {
    const court = get().courts.find(c => c.id === courtId)
    if (!court?.current) return
    const sessionId = court.current.id

    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId || !c.current) return c
        return { ...c, current: { ...c.current, accountIds: c.current.accountIds.map(id => id === oldAccountId ? newAccountId : id) } }
      }),
    })

    const doWrite = async () => {
      await supabase.from('session_players').delete().eq('session_id', sessionId).eq('account_id', oldAccountId)
      await supabase.from('session_players').insert({ session_id: sessionId, account_id: newAccountId })
    }
    doWrite()
  },

  removePlayerFromSession(courtId, accountId) {
    const court = get().courts.find(c => c.id === courtId)
    if (!court?.current) return
    const session = court.current
    const remaining = session.accountIds.filter(id => id !== accountId)

    // Optimistic
    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId || !c.current) return c
        if (remaining.length === 0) {
          if (c.queue.length > 0) {
            const [next, ...rest] = c.queue
            return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
          }
          return { ...c, current: null }
        }
        const newCap = (remaining.length <= 2 ? 2 : 4) as 2 | 4
        return { ...c, current: { ...c.current, accountIds: remaining, capacity: newCap } }
      }),
    })

    // DB
    const doWrite = async () => {
      await supabase.from('session_players').delete().eq('session_id', session.id).eq('account_id', accountId)
      if (remaining.length === 0) {
        await supabase.from('sessions').delete().eq('id', session.id)
        if (court.queue[0]) {
          await supabase.from('sessions')
            .update({ status: 'current', start_time: Date.now() })
            .eq('id', court.queue[0].id)
        }
      } else {
        const newCap = remaining.length <= 2 ? 2 : 4
        await supabase.from('sessions').update({ capacity: newCap }).eq('id', session.id)
      }
    }
    doWrite()
  },

  joinSession(courtId, accountIds) {
    const court = get().courts.find(c => c.id === courtId)
    if (!court?.current) return
    const session = court.current
    const newIds = [...session.accountIds, ...accountIds]
    const newCap = (newIds.length <= 2 ? 2 : 4) as 2 | 4

    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId || !c.current) return c
        return { ...c, current: { ...c.current, accountIds: newIds, capacity: newCap } }
      }),
    })

    const doWrite = async () => {
      await supabase.from('session_players').insert(accountIds.map(aid => ({ session_id: session.id, account_id: aid })))
      await supabase.from('sessions').update({ capacity: newCap }).eq('id', session.id)
    }
    doWrite()
  },

  // ── Queue ─────────────────────────────────────────────────────────────
  addToQueue(courtId, accountIds, capacity, startTime) {
    const session: Session = { id: generateId(), accountIds, capacity, startTime: startTime ?? 0 }

    set({ courts: get().courts.map(c => c.id === courtId ? { ...c, queue: [...c.queue, session] } : c) })

    const doWrite = async () => {
      const { error: se } = await supabase.from('sessions').insert({
        id: session.id, court_id: courtId, status: 'queued',
        capacity, start_time: session.startTime,
      })
      if (se) { console.error('addToQueue (session):', se.message); return }
      if (accountIds.length > 0) {
        const { error: pe } = await supabase.from('session_players').insert(
          accountIds.map(aid => ({ session_id: session.id, account_id: aid }))
        )
        if (pe) console.error('addToQueue (players):', pe.message)
      }
    }
    doWrite()
  },

  removeQueue(courtId, sessionId) {
    set({ courts: get().courts.map(c => c.id !== courtId ? c : { ...c, queue: c.queue.filter(s => s.id !== sessionId) }) })
    // CASCADE handles session_players
    supabase.from('sessions').delete().eq('id', sessionId)
      .then(({ error }) => { if (error) console.error('removeQueue:', error.message) })
  },

  joinQueue(courtId, sessionId, accountIds) {
    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId) return c
        return {
          ...c, queue: c.queue.map(s => {
            if (s.id !== sessionId) return s
            const newIds = [...s.accountIds, ...accountIds]
            return { ...s, accountIds: newIds, capacity: (newIds.length <= 2 ? 2 : 4) as 2 | 4 }
          }),
        }
      }),
    })

    const session = get().courts.find(c => c.id === courtId)?.queue.find(s => s.id === sessionId)
    const newCap = session ? (session.accountIds.length <= 2 ? 2 : 4) : 2

    const doWrite = async () => {
      await supabase.from('session_players').insert(accountIds.map(aid => ({ session_id: sessionId, account_id: aid })))
      await supabase.from('sessions').update({ capacity: newCap }).eq('id', sessionId)
    }
    doWrite()
  },

  replacePlayerInQueue(courtId, sessionId, oldAccountId, newAccountId) {
    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId) return c
        return { ...c, queue: c.queue.map(s => s.id !== sessionId ? s : { ...s, accountIds: s.accountIds.map(id => id === oldAccountId ? newAccountId : id) }) }
      }),
    })

    const doWrite = async () => {
      await supabase.from('session_players').delete().eq('session_id', sessionId).eq('account_id', oldAccountId)
      await supabase.from('session_players').insert({ session_id: sessionId, account_id: newAccountId })
    }
    doWrite()
  },

  removePlayerFromQueue(courtId, sessionId, accountId) {
    set({
      courts: get().courts.map(c => {
        if (c.id !== courtId) return c
        const queue = c.queue.map(s => {
          if (s.id !== sessionId) return s
          const remaining = s.accountIds.filter(id => id !== accountId)
          if (remaining.length === 0) return null
          return { ...s, accountIds: remaining, capacity: (remaining.length <= 2 ? 2 : 4) as 2 | 4 }
        }).filter((s): s is Session => s !== null)
        return { ...c, queue }
      }),
    })

    const queueSession = get().courts.find(c => c.id === courtId)?.queue.find(s => s.id === sessionId)

    const doWrite = async () => {
      await supabase.from('session_players').delete().eq('session_id', sessionId).eq('account_id', accountId)
      // After deletion, check remaining count
      const { data } = await supabase.from('session_players').select('account_id').eq('session_id', sessionId)
      if (!data || data.length === 0) {
        await supabase.from('sessions').delete().eq('id', sessionId)
      } else {
        const newCap = data.length <= 2 ? 2 : 4
        await supabase.from('sessions').update({ capacity: newCap }).eq('id', sessionId)
      }
    }
    void queueSession  // suppress unused warning
    doWrite()
  },

  promoteQueue(courtId) {
    const court = get().courts.find(c => c.id === courtId)
    if (!court || court.queue.length === 0) return
    const [next, ...rest] = court.queue
    const newStartTime = Date.now()

    set({
      courts: get().courts.map(c => c.id !== courtId ? c
        : { ...c, current: { ...next, startTime: newStartTime }, queue: rest }
      ),
    })

    supabase.from('sessions')
      .update({ status: 'current', start_time: newStartTime })
      .eq('id', next.id)
      .then(({ error }) => { if (error) console.error('promoteQueue:', error.message) })
  },

  // ── Tick ──────────────────────────────────────────────────────────────
  tick() {
    const now = Date.now()
    for (const court of get().courts) {
      if (!court.current) continue
      const expiry = court.current.startTime + SESSION_DURATION
      if (now < expiry) continue
      if (processingCourts.has(court.id)) continue
      processingCourts.add(court.id)
      if (navigator.vibrate) navigator.vibrate(400)
      // endSession handles both optimistic update and DB writes
      get().endSession(court.id)
      // Remove from processing after a short delay to prevent re-entry
      setTimeout(() => processingCourts.delete(court.id), 2000)
    }
  },
}))
