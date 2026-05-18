/** Time picker used in session / queue creation modals */

interface TimePickerProps {
  mode: 'now' | 'schedule'
  scheduledTime: string   // HH:MM
  onModeChange: (m: 'now' | 'schedule') => void
  onTimeChange: (t: string) => void
  nowLabel?: string
}

export function TimePicker({ mode, scheduledTime, onModeChange, onTimeChange, nowLabel = 'Now' }: TimePickerProps) {
  return (
    <div className="input-group">
      <label className="input-label">Start Time</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: mode === 'schedule' ? 8 : 0 }}>
        {(['now', 'schedule'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              border: mode === m ? '2px solid var(--c-primary)' : '2px solid var(--c-border)',
              background: mode === m ? 'var(--c-primary-light)' : '#F5FBF8',
              color: mode === m ? 'var(--c-primary)' : 'var(--c-text-muted)',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {m === 'now' ? `▶  ${nowLabel}` : '⏰  Schedule'}
          </button>
        ))}
      </div>
      {mode === 'schedule' && (
        <input
          className="input"
          type="time"
          value={scheduledTime}
          onChange={e => onTimeChange(e.target.value)}
        />
      )}
    </div>
  )
}
