import { create } from 'zustand'
import type { Account, Court, Session } from '../types'
import { generateId, SESSION_DURATION } from '../utils'

const STORAGE_ACCOUNTS = 'bintang_v3_accounts'
const STORAGE_COURTS = 'bintang_v3_courts'
const STORAGE_MY_IDS = 'bintang_my_ids'
const STORAGE_LOGS = 'bintang_logs'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

interface AppStore {
  accounts: Account[]
  courts: Court[]
  myIds: string[]
  logs: number[]

  // Account actions
  addAccount: (displayName: string, username: string, password: string) => void
  updateAccount: (id: string, username: string, password: string) => void
  deleteAccount: (id: string) => void

  // Court actions
  addCourt: (name: string) => Court
  deleteCourt: (courtId: string) => void

  // Session actions
  startSession: (courtId: string, accountIds: string[], startTime?: number) => void
  endSession: (courtId: string) => void
  replacePlayerInSession: (courtId: string, oldAccountId: string, newAccountId: string) => void
  joinSession: (courtId: string, accountIds: string[]) => void

  // Queue actions
  addToQueue: (courtId: string, accountIds: string[], startTime?: number) => void
  removeQueue: (courtId: string, sessionId: string) => void
  joinQueue: (courtId: string, sessionId: string, accountIds: string[]) => void
  promoteQueue: (courtId: string) => void

  // Tick — call on interval to auto-promote expired sessions
  tick: () => void

  // Hydrate from localStorage
  hydrate: () => void
  addLog: () => void
}

export const useStore = create<AppStore>((set, get) => ({
  accounts: [],
  courts: [],
  myIds: [],
  logs: [],

  hydrate() {
    set({
      accounts: load<Account[]>(STORAGE_ACCOUNTS, []),
      courts: load<Court[]>(STORAGE_COURTS, []),
      myIds: load<string[]>(STORAGE_MY_IDS, []),
      logs: load<number[]>(STORAGE_LOGS, []),
    })
  },

  addLog() {
    const logs = [Date.now(), ...get().logs]
    save(STORAGE_LOGS, logs)
    set({ logs })
  },

  addAccount(displayName, username, password) {
    const account: Account = { id: generateId(), displayName, username, password }
    const accounts = [...get().accounts, account]
    const myIds = [...get().myIds, account.id]
    save(STORAGE_ACCOUNTS, accounts)
    save(STORAGE_MY_IDS, myIds)
    set({ accounts, myIds })
  },

  updateAccount(id, username, password) {
    const accounts = get().accounts.map(a => a.id === id ? { ...a, username, password } : a)
    save(STORAGE_ACCOUNTS, accounts)
    set({ accounts })
  },

  deleteAccount(id) {
    const accounts = get().accounts.filter(a => a.id !== id)
    const myIds = get().myIds.filter(mid => mid !== id)
    save(STORAGE_ACCOUNTS, accounts)
    save(STORAGE_MY_IDS, myIds)
    set({ accounts, myIds })
  },

  addCourt(name) {
    const court: Court = { id: generateId(), name, current: null, queue: [] }
    const courts = [...get().courts, court]
    save(STORAGE_COURTS, courts)
    set({ courts })
    return court
  },

  deleteCourt(courtId) {
    const courts = get().courts.filter(c => c.id !== courtId)
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  startSession(courtId, accountIds, startTime) {
    const session: Session = {
      id: generateId(),
      accountIds,
      capacity: accountIds.length,
      startTime: startTime ?? Date.now(),
    }
    const courts = get().courts.map(c =>
      c.id === courtId ? { ...c, current: session } : c
    )
    save(STORAGE_COURTS, courts)
    set({ courts })
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
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  replacePlayerInSession(courtId, oldAccountId, newAccountId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || !c.current) return c
      const accountIds = c.current.accountIds.map(id => id === oldAccountId ? newAccountId : id)
      return { ...c, current: { ...c.current, accountIds } }
    })
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  joinSession(courtId, accountIds) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || !c.current) return c
      const updated = { ...c.current, accountIds: [...c.current.accountIds, ...accountIds] }
      return { ...c, current: updated }
    })
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  addToQueue(courtId, accountIds, startTime) {
    const session: Session = {
      id: generateId(),
      accountIds,
      capacity: accountIds.length,
      startTime: startTime ?? 0,
    }
    const courts = get().courts.map(c =>
      c.id === courtId ? { ...c, queue: [...c.queue, session] } : c
    )
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  removeQueue(courtId, sessionId) {
    const courts = get().courts.map(c =>
      c.id === courtId ? { ...c, queue: c.queue.filter(s => s.id !== sessionId) } : c
    )
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  joinQueue(courtId, sessionId, accountIds) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId) return c
      const queue = c.queue.map(s =>
        s.id === sessionId ? { ...s, accountIds: [...s.accountIds, ...accountIds] } : s
      )
      return { ...c, queue }
    })
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  promoteQueue(courtId) {
    const courts = get().courts.map(c => {
      if (c.id !== courtId || c.queue.length === 0) return c
      const [next, ...rest] = c.queue
      return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
    })
    save(STORAGE_COURTS, courts)
    set({ courts })
  },

  tick() {
    const now = Date.now()
    let changed = false
    const courts = get().courts.map(c => {
      if (!c.current) return c
      const expiry = c.current.startTime + SESSION_DURATION
      if (now < expiry) return c
      // Session expired — promote or clear
      changed = true
      if (navigator.vibrate) navigator.vibrate(400)
      if (c.queue.length > 0) {
        const [next, ...rest] = c.queue
        return { ...c, current: { ...next, startTime: Date.now() }, queue: rest }
      }
      return { ...c, current: null }
    })
    if (changed) {
      save(STORAGE_COURTS, courts)
      set({ courts })
    }
  },
}))
