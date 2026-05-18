export interface Account {
  id: string
  displayName: string
  username: string
  password: string
}

export interface Session {
  id: string
  accountIds: string[]
  capacity: number
  startTime: number // ms timestamp
}

export interface Court {
  id: string
  name: string
  current: Session | null
  queue: Session[]
}

export interface DisplayAccount extends Account {
  status: 'unused' | 'in_session' | 'scheduled' | 'queued'
  courtId: string
  courtName: string
  statusLabel: string
  timerDisplay: string
  isScheduled: boolean
  canEdit: boolean
  selectable: boolean
  selected: boolean
}

export interface DisplayCourt {
  id: string
  name: string
  hasSession: boolean
  isScheduled: boolean
  statusText: string
  statusClass: 'idle' | 'scheduled' | 'ok' | 'warning' | 'urgent'
  timerDisplay: string
  playerCount: number
  queueCount: number
}
