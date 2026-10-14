import { describe, expect, it } from 'vitest'
import type { Item, Promo, SalesWeek, WeekDays } from '../types'
import { adWeekStart, createPromoLookup, DEFAULT_PROMO_LIFT, learnPromoLift } from './promos'
import { createPlanner } from './planner'

const item = { id: 'a', size: '4L', name: 'Beatr.2% milk 4L' } as Item
const week = (weekStart: string, days: WeekDays): SalesWeek => ({ weekStart, fileName: '', uploadedAt: '', rows: [{ itemId: 'a', days, total: 0 }] })
// Six normal weeks of 10 a day, then a flyer week (Thu Oct 1 – Wed Oct 7, 2026) selling 16 a day.
const normal = ['2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20'].map(start => week(start, [10, 10, 10, 10, 10, 10, 10]))
const weeks = [...normal, week('2026-09-27', [10, 10, 10, 10, 16, 16, 16]), week('2026-10-04', [16, 16, 16, 16, 10, 10, 10])]
const promo: Promo = { weekStart: '2026-10-01', items: { a: {} } }

describe('ad weeks', () => {
  it('start on Thursday', () => {
    expect(adWeekStart('2026-10-14')).toBe('2026-10-08') // Wed → previous Thu
    expect(adWeekStart('2026-10-15')).toBe('2026-10-15') // Thu
    expect(adWeekStart('2026-10-18')).toBe('2026-10-15') // Sun
  })
})

describe('promo lift', () => {
  it('uses the default until there is history, and a set lift beats everything', () => {
    expect(createPromoLookup([promo]).promoOn('a', '2026-10-03')).toEqual({ lift: DEFAULT_PROMO_LIFT, source: 'default' })
    expect(createPromoLookup([promo]).promoOn('a', '2026-10-08')).toBeNull()
    expect(createPromoLookup([{ weekStart: '2026-10-01', items: { a: { lift: 80 } } }]).promoOn('a', '2026-10-01')).toEqual({ lift: 80, source: 'set' })
  })

  it('learns +60% from a past flyer week', () => {
    const ctx = { weeks, isAffected: () => false, wasOutOfStock: () => false, isPromo: createPromoLookup([promo]).isPromo }
    const learned = learnPromoLift([item], [promo], ctx, () => 1, () => false)
    expect(learned.perItem.a).toEqual({ lift: 60, samples: 1 })
    expect(learned.overall).toEqual({ lift: 60, samples: 1 })
  })

  it('planner: promo days are boosted and kept out of normal averages', () => {
    const next: Promo = { weekStart: '2026-10-15', items: { a: {} } }
    const planner = createPlanner({ items: [item], weeks, counts: [], changes: [], holidaySettings: [], events: [], promos: [promo, next] })
    // Wed Oct 14 is a normal day: 10 (the flyer-week Wednesdays/Sundays are left out of the average).
    expect(planner.forecast(item, '2026-10-14')).toBeCloseTo(10)
    // Thu Oct 15 starts the next flyer: 10 × 1.6 learned lift.
    expect(planner.forecast(item, '2026-10-15')).toBeCloseTo(16)
    expect(planner.promos.promoOn('a', '2026-10-15')?.source).toBe('item')
  })
})
