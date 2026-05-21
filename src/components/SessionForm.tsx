/** Time picker used in session / queue creation modals */
import { useRef } from 'react'

interface TimePickerProps {
  mode: 'now' | 'schedule'
  scheduledTime: string   // HH:MM
  onModeChange: (m: 'now' | 'schedule') => void
  onTimeChange: (t: string) => void
  nowLabel?: string
}

export function TimePicker({ mode, scheduledTime, onModeChange, onTimeChange, nowLabel = 'Now' }: TimePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const btnBase: React.CSSProperties = {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
    border: '2px solid var(--c-border)',
    background: '#F5FBF8',
    color: 'var(--c-text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',   // must be visible so the input can float above the button
  }

  const btnActive: React.CSSProperties = {
    ...btnBase,
    border: '2px solid var(--c-primary)',
    background: 'var(--c-primary-light)',
    color: 'var(--c-primary)',
  }

  return (
    <div className="input-group">
      <label className="input-label">Start Time</label>
      <div style={{ display: 'flex', gap: 8 }}>

        <button type="button" onClick={() => onModeChange('now')} style={mode === 'now' ? btnActive : btnBase}>
          ▶  {nowLabel}
        </button>

        {/* Label activates input on mobile tap; showPicker() handles desktop */}
        <label
          style={mode === 'schedule' ? btnActive : btnBase}
          onClick={() => {
            onModeChange('schedule')
            try { inputRef.current?.showPicker() } catch {}
          }}
        >
          ⏰  {mode === 'schedule' ? scheduledTime : 'Schedule'}
          {/*
            Input floats just above the top edge of the Schedule button.
            iOS anchors the picker popup to the input position, so placing it
            just above the button makes the picker appear right above it.
          */}
          <input
            ref={inputRef}
            type="time"
            value={scheduledTime}
            onChange={e => onTimeChange(e.target.value)}
            style={{
              position: 'absolute',
              top: -2,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '1px',
              height: '1px',
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
        </label>

      </div>
    </div>
  )
}
