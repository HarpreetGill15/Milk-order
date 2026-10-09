import { describe, expect, it } from 'vitest'
import type { Item, SalesWeek, WeekDays } from '../types'
import { forecastBase, learnHolidayEffects, type ForecastContext } from './forecast'
import { createCalendar } from './holidays'
import { addDaysIso } from './dates'

const week = (weekStart: string, days: WeekDays, itemId = 'a', extra: Partial<SalesWeek> = {}): SalesWeek =>
  ({ weekStart, fileName: '', uploadedAt: '', rows: [{ itemId, days, total: 0 }], ...extra })
const ctx = (weeks: SalesWeek[], overrides: Partial<ForecastContext> = {}): ForecastContext =>
  ({ weeks, isAffected: () => false, wasOutOfStock: () => false, ...overrides })
const sundays = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDaysIso(from, -7 * i))

describe('forecastBase', () => {
  it('weights nearer weeks more', () => {
    // Sunday 2026-10-04: last week sold 20, the week before 10 → (20×2 + 10×1) / 3
    const weeks = [week('2026-09-27', [20, 0, 0, 0, 0, 0, 0]), week('2026-09-20', [10, 0, 0, 0, 0, 0, 0])]
    expect(forecastBase('a', '2026-10-04', ctx(weeks))).toBeCloseTo(50 / 3)
  })

  it('drops the highest and lowest once there are 5+ samples', () => {
    const values = [10, 10, 100, 10, 0, 10]
    const weeks = sundays('2026-09-27', 6).map((start, i) => week(start, [values[i], 0, 0, 0, 0, 0, 0]))
    expect(forecastBase('a', '2026-10-04', ctx(weeks))).toBe(10)
  })

  it('uses at most 8 weeks, all within 16 weeks', () => {
    const weeks = sundays('2026-09-27', 12).map((start, i) => week(start, [i < 8 ? 6 : 600, 0, 0, 0, 0, 0, 0]))
    expect(forecastBase('a', '2026-10-04', ctx(weeks))).toBe(6)
    expect(forecastBase('a', '2027-06-06', ctx(weeks))).toBe(0)
  })

  it('skips holiday days, sold-out days and days not over yet', () => {
    const weeks = [
      week('2026-09-27', [99, 0, 0, 0, 0, 0, 0], 'a', { completeDays: [false, true, true, true, true, true, true] }),
      week('2026-09-20', [50, 0, 0, 0, 0, 0, 0]),
      week('2026-09-13', [70, 0, 0, 0, 0, 0, 0]),
      week('2026-09-06', [12, 0, 0, 0, 0, 0, 0]),
    ]
    const context = ctx(weeks, { isAffected: date => date === '2026-09-20', wasOutOfStock: (_, date) => date === '2026-09-13' })
    expect(forecastBase('a', '2026-10-04', context)).toBe(12)
  })

  it('skips weeks the item is not in', () => {
    expect(forecastBase('a', '2026-10-04', ctx([week('2026-09-27', [9, 0, 0, 0, 0, 0, 0], 'other')]))).toBe(0)
  })
})

describe('learnHolidayEffects', () => {
  const items = [{ id: 'm', size: '2L' }, { id: 'c', size: 'Cream' }] as Item[]
  it('learns the boost on a holiday day from surrounding normal weeks', () => {
    const calendar = createCalendar([], [])
    // Thanksgiving 2025 = Mon Oct 13 → Sat Oct 11 is "−2 days". Normal Saturdays: milk 20, cream 10.
    const normal = (start: string): SalesWeek => ({ weekStart: start, fileName: '', uploadedAt: '', rows: [
      { itemId: 'm', days: [0, 0, 0, 0, 0, 0, 20], total: 20 }, { itemId: 'c', days: [0, 0, 0, 0, 0, 0, 10], total: 10 },
    ] })
    const holidayWeek: SalesWeek = { weekStart: '2025-10-05', fileName: '', uploadedAt: '', rows: [
      { itemId: 'm', days: [0, 0, 0, 0, 0, 0, 26], total: 26 }, { itemId: 'c', days: [0, 0, 0, 0, 0, 0, 18], total: 18 },
    ] }
    const weeks = [normal('2025-09-21'), normal('2025-09-28'), holidayWeek, normal('2025-10-19'), normal('2025-10-26')]
    const learned = learnHolidayEffects(items, { weeks, isAffected: calendar.isAffected, wasOutOfStock: () => false }, calendar.isClosed)
    expect(learned.thanksgiving['-2']).toEqual({ milk: { boost: 30, samples: 1 }, cream: { boost: 80, samples: 1 } })
  })
})
