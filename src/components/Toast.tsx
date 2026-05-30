import { useToast } from '../store/toast'

export function Toast() {
  const { message, type, hide } = useToast()
  if (!type) return null

  return (
    <div
      className={`toast toast--${type}`}
      onClick={hide}
      role="status"
      aria-live="polite"
    >
      <span className="toast__icon">{type === 'success' ? '✓' : '✕'}</span>
      <span className="toast__message">{message}</span>
    </div>
  )
}
