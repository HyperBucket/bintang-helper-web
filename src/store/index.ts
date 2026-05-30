import { create } from 'zustand'
import type { Account, Court, Session } from '../types'
import { generateId, SESSION_DURATION } from '../utils'
import { supabase } from '../lib/supabase'

const STORAGE_MY_IDS = 'bintang_my_ids'
const STORAGE_LOGS   = 'bintang_logs'
const CLUB_ROW_ID    = 'default'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

// Debounced cloud write — avoids hammering Supabase on rapid changes
let cloudTimer: ReturnType<typeof setTimeout> | null = null
let applyingRemote = false

function scheduleCloudSync(accounts: Account[], courts: Court[]) {
  if (applyingRemote) return
  if (cloudTimer) clearTimeout(cloudTimer)
  cloudTimer = setTimeout(() => {
    supabase
      .from('club_data')
      .upsert({ id: CLUB_ROW_ID, accounts, courts, updated_at: new Date().toISOString() })
      .then(() => {})
  }, 400)
}

interface AppStore {
  accounts: Account[]
  courts: Court[]
  myIds: string[]
  logs: number[]
  synced: boolean   // true once first Supabase load completes

  addAccount: (displayName: string, username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  updateAccount: (id: string, displayName: string, username: string, password: string) => void
  deleteAccount: (id: string) => void

  addCourt: (name: string) => Court
  deleteCourt: (courtId: string) => void

  startSession: (courtId: string, accountIds: string[], capacity: 2 | 4, startTime?: number) => void
  endSession: (courtId: string) => void
  replacePlayerInSession: (courtId: string, oldAccountId: string, newAccountId: string) => void
  removePlayerFromSession: (courtId: string, accountId: string) => void
  joinSession: (courtId: string, accountIds: string[]) => void

  addToQueue: (courtId: string, accountIds: string[], capacity: 2 | 4, startTime?: number) => void
  removeQueue: (courtId: string, sessionId: string) => void
  joinQueue: (courtId: string, sessionId: string, accountIds: string[]) => void
  replacePlayerInQueue: (courtId: string, sessionId: string, oldAccountId: string, newAccountId: string) => void
  removePlayerFromQueue: (courtId: string, sessionId: string, accountId: string) => void
  promoteQueue: (courtId: string) => void

  tick: () => void
  hydrate: () => void
  addLog: () => void
}

export const useStore = create<AppStore>((set, get) => ({
  accounts: [],
  courts: [],
  myIds: [],
  logs: [],
  synced: false,

  // ── Hydrate ──────────────────────────────────────────────
  hydrate() {
    // 1. Load myIds / logs from localStorage (always local)
    set({
      myIds: load<string[]>(STORAGE_MY_IDS, []),
      logs:  load<number[]>(STORAGE_LOGS, []),
    })

    // 2a. Fetch accounts from dedicated accounts table
    supabase
      .from('accounts')
      .select('id, display_name, username, password')
      .then(({ data, error }) => {
        if (!error && data) {
          const accounts = data.map(r => ({
            id: r.id,
            displayName: r.display_name,
            username: r.username,
            password: r.password,
          })) as Account[]
          set({ accounts })
        }
      })

    // 2b. Fetch courts from club_data blob
    supabase
      .from('club_data')
      .select('courts')
      .eq('id', CLUB_ROW_ID)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const courts = (data.courts as Court[]) ?? []
          set({ courts, synced: true })
        } else {
          set({ synced: true })
        }
      })

    // 3. Real-time: accounts table (INSERT / UPDATE / DELETE)
    const existingAcc = supabase.getChannels().find(c => c.topic === 'realtime:accounts_sync')
    if (existingAcc) supabase.removeChannel(existingAcc)

    supabase
      .channel('accounts_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const r = payload.new as { id: string; display_name: string; username: string; password: string }
            const acc: Account = { id: r.id, displayName: r.display_name, username: r.username, password: r.password }
            // Deduplicate — optimistic update may have already added it locally
            if (!get().accounts.some(a => a.id === acc.id)) {
              set({ accounts: [...get().accounts, acc] })
            }
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
        }
      )
      .subscribe()

    // 4. Real-time: courts via club_data blob
    const existingCourts = supabase.getChannels().find(c => c.topic === 'realtime:club_sync')
    if (existingCourts) supabase.removeChannel(existingCourts)

    supabase
      .channel('club_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'club_data', filter: `id=eq.${CLUB_ROW_ID}` },
        (payload) => {
          const { courts } = payload.new as { courts: Court[] }
          applyingRemote = true
          set({ courts })
          setTimeout(() => { applyingRemote = false }, 100)
        }
      )
      .subscribe()
  },

  // ── Logs ────────────────────────────────────────────────
  addLog() {
    const logs = [Date.now(), ...get().logs]
    saveLocal(STORAGE_LOGS, logs)
    set({ logs })
  },

  // ── Accounts ─────────────────────────────────────────────
  // Each operation targets its own row — no full-blob overwrite, no race conditions.
  async addAccount(displayName, username, password) {
    const account: Account = { id: generateId(), displayName, username, password }
    const myIds = [...get().myIds, account.id]
    saveLocal(STORAGE_MY_IDS, myIds)
    // Optimistic local update so UI feels instant
    set({ accounts: [...get().accounts, account], myIds })

    const { error } = await supabase
      .from('accounts')
      .insert({ id: account.id, display_name: displayName, username, password })

    if (error) {
      // Roll back optimistic update
      set({
        accounts: get().accounts.filter(a => a.id !== account.id),
        myIds: get().myIds.filter(id => id !== account.id),
      })
      saveLocal(STORAGE_MY_IDS, get().myIds.filter(id => id !== account.id))
      return { ok: false, error: error.message }
    }
    return { ok: true }
  },

  updateAccount(id, displayName, username, password) {
    const accounts = get().accounts.map(a => a.id === id ? { ...a, displayName, username, password } : a)
    set({ accounts })
    supabase
      .from('accounts')
      .update({ display_name: displayName, username, password })
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('updateAccount:', error.message) })
  },

  deleteAccount(id) {
    const accounts = get().accounts.filter(a => a.id !== id)
    const myIds = get().myIds.filter(mid => mid !== id)
    saveLocal(STORAGE_MY_IDS, myIds)
    set({ accounts, myIds })
    supabase
      .from('accounts')
      .delete()
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('deleteAccount:', error.message) })
  },

  // ── Courts ───────────────────────────────────────────────
  addCourt(name) {
    const court: Court = { id: generateId(), name, current: null, queue: [] }
    const courts = [...get().courts, court]
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
    return court
  },

  deleteCourt(courtId) {
    const courts = get().courts.filter(c => c.id !== courtId)
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  // ── Sessions ─────────────────────────────────────────────
  startSession(courtId, accountIds, capacity, startTime) {
    const session: Session = { id: generateId(), accountIds, capacity, startTime: startTime ?? Date.now() }
    const courts = get().courts.map(c => c.id === courtId ? { ...c, current: session } : c)
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  endSession(courtId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId) return c
      if (c.queue.length > 0) {
        const [next, ...rest] = c.queue
        return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
      }
      return { ...c, current: null }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  replacePlayerInSession(courtId, oldAccountId, newAccountId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || !c.current) return c
      const accountIds = c.current.accountIds.map(id => id === oldAccountId ? newAccountId : id)
      return { ...c, current: { ...c.current, accountIds } }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  removePlayerFromSession(courtId, accountId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || !c.current) return c
      const accountIds = c.current.accountIds.filter(id => id !== accountId)
      if (accountIds.length === 0) {
        if (c.queue.length > 0) {
          const [next, ...rest] = c.queue
          return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
        }
        return { ...c, current: null }
      }
      const newCapacity = (accountIds.length <= 2 ? 2 : 4) as 2 | 4
      return { ...c, current: { ...c.current, accountIds, capacity: newCapacity } }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  joinSession(courtId, accountIds) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || !c.current) return c
      const newIds = [...c.current.accountIds, ...accountIds]
      const newCapacity = (newIds.length <= 2 ? 2 : 4) as 2 | 4
      return { ...c, current: { ...c.current, accountIds: newIds, capacity: newCapacity } }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  // ── Queue ─────────────────────────────────────────────────
  addToQueue(courtId, accountIds, capacity, startTime) {
    const session: Session = { id: generateId(), accountIds, capacity, startTime: startTime ?? 0 }
    const courts = get().courts.map(c => c.id === courtId ? { ...c, queue: [...c.queue, session] } : c)
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  removeQueue(courtId, sessionId) {
    const courts = get().courts.map(c =>
      c.id === courtId ? { ...c, queue: c.queue.filter(s => s.id !== sessionId) } : c
    )
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  joinQueue(courtId, sessionId, accountIds) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId) return c
      const queue = c.queue.map(s => {
        if (s.id !== sessionId) return s
        const newIds = [...s.accountIds, ...accountIds]
        return { ...s, accountIds: newIds, capacity: (newIds.length <= 2 ? 2 : 4) as 2 | 4 }
      })
      return { ...c, queue }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  replacePlayerInQueue(courtId, sessionId, oldAccountId, newAccountId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId) return c
      const queue = c.queue.map(s => {
        if (s.id !== sessionId) return s
        return { ...s, accountIds: s.accountIds.map(id => id === oldAccountId ? newAccountId : id) }
      })
      return { ...c, queue }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  removePlayerFromQueue(courtId, sessionId, accountId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId) return c
      const queue = c.queue.map(s => {
        if (s.id !== sessionId) return s
        const accountIds = s.accountIds.filter(id => id !== accountId)
        if (accountIds.length === 0) return null
        return { ...s, accountIds, capacity: (accountIds.length <= 2 ? 2 : 4) as 2 | 4 }
      }).filter((s): s is Session => s !== null)
      return { ...c, queue }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  promoteQueue(courtId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || c.queue.length === 0) return c
      const [next, ...rest] = c.queue
      return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
    })
    set({ courts })
    scheduleCloudSync(get().accounts, courts)
  },

  // ── Tick ──────────────────────────────────────────────────
  tick() {
    const now = Date.now()
    let changed = false
    const courts = get().courts.map(c => {
      if (!c.current) return c
      const expiry = c.current.startTime + SESSION_DURATION
      if (now < expiry) return c
      changed = true
      if (navigator.vibrate) navigator.vibrate(400)
      if (c.queue.length > 0) {
        const [next, ...rest] = c.queue
        return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
      }
      return { ...c, current: null }
    })
    if (changed) {
      set({ courts })
      scheduleCloudSync(get().accounts, courts)
    }
  },
}))
