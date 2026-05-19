import { describe, it, expect } from 'vitest'
import { SESSION_DURATION, formatTime, formatCountdown, formatClockTime, generateId } from './index'

describe('SESSION_DURATION', () => {
  it('is 45 minutes in milliseconds', () => {
    expect(SESSION_DURATION).toBe(45 * 60 * 1000)
  })
})

describe('formatCountdown', () => {
  it('returns 00:00 for zero', () => {
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('returns 00:00 for negative values', () => {
    expect(formatCountdown(-1000)).toBe('00:00')
    expect(formatCountdown(-999999)).toBe('00:00')
  })

  it('formats seconds correctly', () => {
    expect(formatCountdown(30_000)).toBe('00:30')
    expect(formatCountdown(9_000)).toBe('00:09')
    expect(formatCountdown(59_000)).toBe('00:59')
  })

  it('formats minutes and seconds correctly', () => {
    expect(formatCountdown(60_000)).toBe('01:00')
    expect(formatCountdown(90_000)).toBe('01:30')
    expect(formatCountdown(45 * 60_000)).toBe('45:00')
  })

  it('pads single-digit minutes and seconds with leading zero', () => {
    expect(formatCountdown(5 * 60_000 + 7_000)).toBe('05:07')
  })

  it('truncates sub-second remainder', () => {
    expect(formatCountdown(61_999)).toBe('01:01')
  })
})

describe('formatClockTime', () => {
  it('formats midnight as 00:00', () => {
    const midnight = new Date(2024, 0, 1, 0, 0, 0).getTime()
    expect(formatClockTime(midnight)).toBe('00:00')
  })

  it('formats noon as 12:00', () => {
    const noon = new Date(2024, 0, 1, 12, 0, 0).getTime()
    expect(formatClockTime(noon)).toBe('12:00')
  })

  it('pads single-digit hours and minutes', () => {
    const time = new Date(2024, 0, 1, 9, 5, 0).getTime()
    expect(formatClockTime(time)).toBe('09:05')
  })

  it('formats end of day correctly', () => {
    const time = new Date(2024, 0, 1, 23, 59, 0).getTime()
    expect(formatClockTime(time)).toBe('23:59')
  })
})

describe('formatTime', () => {
  it('formats a date with full timestamp', () => {
    const date = new Date(2024, 0, 5, 9, 3, 7) // Jan 5 2024, 09:03:07
    expect(formatTime(date)).toBe('2024/01/05 09:03:07')
  })

  it('pads all fields with leading zeros', () => {
    const date = new Date(2024, 0, 1, 1, 1, 1)
    expect(formatTime(date)).toBe('2024/01/01 01:01:01')
  })
})

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string')
    expect(generateId().length).toBeGreaterThan(0)
  })

  it('generates unique ids across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId))
    expect(ids.size).toBe(100)
  })
})
