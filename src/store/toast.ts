import { create } from 'zustand'

interface ToastState {
  message: string
  type: 'success' | 'error' | null
  timerId: ReturnType<typeof setTimeout> | null
  show: (message: string, type: 'success' | 'error', duration?: number) => void
  hide: () => void
}

export const useToast = create<ToastState>((set, get) => ({
  message: '',
  type: null,
  timerId: null,

  show(message, type, duration = 3000) {
    // Clear any existing timer before starting a new one
    const prev = get().timerId
    if (prev) clearTimeout(prev)
    const timerId = setTimeout(() => set({ type: null, timerId: null }), duration)
    set({ message, type, timerId })
  },

  hide() {
    const prev = get().timerId
    if (prev) clearTimeout(prev)
    set({ type: null, timerId: null })
  },
}))
