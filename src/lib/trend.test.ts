import { describe, expect, it } from 'vitest'
import type { Count, Item, SavedOrder } from '../types'
import { lastOrderedOnWeekday, learnTrends } from './trend'

const item = { id: 'a', size: '2L' } as Item
const count = (date: string, total: number): Count => ({ date, entries: { a: { crates: 0, units: total, total, noStock: total === 0, countedAt: '' } } })
const placed = (orderDate: string, deliveryDate: string, qty: number): SavedOrder =>
  ({ id: `${orderDate}_${deliveryDate}`, orderDate, deliveryDate, lines: {}, savedAt: '', placed: { at: '', quantities: { a: qty } } })
// Regular schedule: deliveries Wed, Fri, Sat, Mon.
const deliveryOn = (date: string) => ([1, 3, 5, 6].includes(new Date(`${date}T12:00:00`).getDay()) ? { deliveryDate: date } : null)

describe('learnTrends', () => {
  it('works out what left the cooler between counts and compares it with the forecast', () => {
    // Tue 20 on hand, Wed delivery 18, Thu count 8 → 30 gone over Tue+Wed; forecast 10/day = 20.
    const counts = [count('2026-09-29', 20), count('2026-10-01', 8)]
    const trends = learnTrends([item], counts, [placed('2026-09-29', '2026-09-30', 18)], deliveryOn, () => 10)
    // raw 1.5, one stretch → pulled toward 1: 1 + 0.5 × 1/3
    expect(trends.a).toMatchObject({ actual: 30, forecast: 20, intervals: 1 })
    expect(trends.a.factor).toBeCloseTo(1 + 0.5 / 3)
  })

  it('skips stretches where a delivery in between was never marked as ordered', () => {
    const counts = [count('2026-09-29', 20), count('2026-10-01', 8)]
    expect(learnTrends([item], counts, [], deliveryOn, () => 10)).toEqual({})
  })

  it('caps the factor and needs a meaningful forecast', () => {
    const counts = [count('2026-10-01', 50), count('2026-10-02', 0)] // Thu→Fri, Fri delivery
    const trends = learnTrends([item], counts, [placed('2026-10-01', '2026-10-02', 0)], deliveryOn, () => 10)
    expect(trends.a.factor).toBeCloseTo(1 + 0.6 / 3) // raw 5.0 capped to 1.6
    expect(learnTrends([item], counts, [placed('2026-10-01', '2026-10-02', 0)], deliveryOn, () => 1)).toEqual({})
  })
})

describe('lastOrderedOnWeekday', () => {
  it('finds the latest earlier order delivered on the same weekday', () => {
    const orders = [placed('2026-09-22', '2026-09-23', 18), placed('2026-09-29', '2026-09-30', 27), placed('2026-10-01', '2026-10-02', 9)]
    expect(lastOrderedOnWeekday(orders, 'a', '2026-10-07')).toEqual({ quantity: 27, deliveryDate: '2026-09-30' })
    expect(lastOrderedOnWeekday(orders, 'a', '2026-09-23')).toBeNull()
  })
})

describe('learnTrends with distros', () => {
  it('counts distro stock as delivered', () => {
    // Tue 20, Wed delivery 18 ordered + 12 distro, Thu 20 → 30 gone; forecast 30 → no trend.
    const counts = [count('2026-09-29', 20), count('2026-10-01', 20)]
    const trends = learnTrends([item], counts, [placed('2026-09-29', '2026-09-30', 18)], deliveryOn, () => 15, (_, date) => (date === '2026-09-30' ? 12 : 0))
    expect(trends.a).toMatchObject({ actual: 30, forecast: 30, factor: 1 })
  })
})
