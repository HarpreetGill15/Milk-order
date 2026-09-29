import { describe, expect, it } from 'vitest'
import type { Item, SalesWeek, WeekDays } from '../types'
import { deliveriesFor, forecastForDay, nextOrderDay, roundUpToStep, suggestOrders } from './order-math'

const item: Item = { id: 'a', name: '2L 2%', aliases: [], brand: 'Lactantia', size: '2L', orderStep: 9, code: '', vendorCode: '', walkOrder: 0, safetyStock: 2, active: true }
const week = (weekStart: string, days: WeekDays, itemId = 'a'): SalesWeek => ({ weekStart, fileName: '', uploadedAt: '', rows: [{ itemId, days, total: days.reduce((a, b) => a + b, 0) }] })

// 2026-09-29 is a Tuesday, 2026-10-01 Thursday, 2026-10-02 Friday.
describe('deliveriesFor', () => {
  it('Tuesday orders Wednesday, covering Wed + Thu', () => {
    expect(deliveriesFor('2026-09-29')).toEqual([{ deliveryDate: '2026-09-30', coversDays: [3, 4] }])
  })
  it('Thursday orders Friday, covering Fri', () => {
    expect(deliveriesFor('2026-10-01')).toEqual([{ deliveryDate: '2026-10-02', coversDays: [5] }])
  })
  it('Friday orders Saturday and Monday', () => {
    expect(deliveriesFor('2026-10-02')).toEqual([
      { deliveryDate: '2026-10-03', coversDays: [6, 0] },
      { deliveryDate: '2026-10-05', coversDays: [1, 2] },
    ])
  })
  it('other days are not order days', () => {
    expect(deliveriesFor('2026-09-28')).toEqual([])
    expect(nextOrderDay('2026-09-28')).toBe('2026-09-29')
    expect(nextOrderDay('2026-10-03')).toBe('2026-10-06')
  })
})

describe('forecastForDay', () => {
  it('averages the same weekday over recent weeks, skipping weeks without the item', () => {
    const weeks = [
      week('2026-09-20', [10, 0, 12, 0, 0, 0, 20]),
      week('2026-09-13', [14, 0, 8, 0, 0, 0, 30]),
      week('2026-09-06', [99, 0, 99, 0, 0, 0, 99], 'other'),
    ]
    expect(forecastForDay('a', 0, weeks)).toBe(12)
    expect(forecastForDay('a', 6, weeks)).toBe(25)
  })
  it('uses only the most recent 4 weeks', () => {
    const weeks = ['2026-09-27', '2026-09-20', '2026-09-13', '2026-09-06', '2026-08-30']
      .map((start, i) => week(start, [i === 4 ? 100 : 4, 0, 0, 0, 0, 0, 0]))
    expect(forecastForDay('a', 0, weeks)).toBe(4)
  })
  it('is 0 with no data', () => expect(forecastForDay('a', 1, [])).toBe(0))

  it('skips days a report was pulled before they were over', () => {
    const partial = { ...week('2026-09-27', [23, 4, 0, 0, 0, 0, 0]), completeDays: [true, false, false, false, false, false, false] }
    const weeks = [partial, week('2026-09-20', [10, 8, 12, 10, 9, 5, 20])]
    expect(forecastForDay('a', 0, weeks)).toBe(16.5)
    expect(forecastForDay('a', 1, weeks)).toBe(8)
    expect(forecastForDay('a', 6, weeks)).toBe(20)
  })
})

describe('rounding', () => {
  it('always rounds up to the order step', () => {
    expect(roundUpToStep(15, 9)).toBe(18)
    expect(roundUpToStep(18, 9)).toBe(18)
    expect(roundUpToStep(0.2, 16)).toBe(16)
    expect(roundUpToStep(-3, 9)).toBe(0)
    expect(roundUpToStep(5, 0)).toBe(5)
  })
})

describe('suggestOrders', () => {
  // Tue 12, Wed 10, Thu 9 — the worked example from the plan.
  const weeks = [week('2026-09-20', [0, 0, 12, 10, 9, 0, 0])]

  it('Tuesday: count 20 − Tue 12 = 8 on hand; Wed+Thu 19 + safety 2 − 8 = 13 → 18', () => {
    const [result] = suggestOrders(item, '2026-09-29', 20, weeks)
    expect(result.stockAtDelivery).toBe(8)
    expect(result.forecast).toBe(19)
    expect(result.suggested).toBe(18)
  })

  it('orders nothing when stock already covers forecast + buffer', () => {
    expect(suggestOrders(item, '2026-09-29', 60, weeks)[0].suggested).toBe(0)
  })

  it('never treats negative stock as a credit', () => {
    const [result] = suggestOrders(item, '2026-09-29', 0, weeks)
    expect(result.stockAtDelivery).toBe(0)
    expect(result.suggested).toBe(27) // 19 + 2 = 21 → 27
  })

  it('Friday: Monday order is projected from the Saturday order', () => {
    // Fri 5, Sat 20, Sun 10, Mon 8, Tue 6
    const fridayWeeks = [week('2026-09-20', [10, 8, 6, 0, 0, 5, 20])]
    const [sat, mon] = suggestOrders(item, '2026-10-02', 12, fridayWeeks)
    // Sat: stock 12 − 5 = 7; need 30 + 2 − 7 = 25 → 27
    expect(sat).toMatchObject({ deliveryDate: '2026-10-03', stockAtDelivery: 7, forecast: 30, safetyStock: 2, suggested: 27, projected: false })
    // Mon: projected stock 7 + 27 − 30 = 4; need 14 + 2 − 4 = 12 → 18
    expect(mon).toMatchObject({ deliveryDate: '2026-10-05', stockAtDelivery: 4, forecast: 14, safetyStock: 2, suggested: 18, projected: true })
  })

  it('Friday: a hand-edited Saturday order feeds the Monday projection', () => {
    const fridayWeeks = [week('2026-09-20', [10, 8, 6, 0, 0, 5, 20])]
    const [, mon] = suggestOrders(item, '2026-10-02', 12, fridayWeeks, [36])
    // projected stock 7 + 36 − 30 = 13; need 14 + 2 − 13 = 3 → 9
    expect(mon).toMatchObject({ stockAtDelivery: 13, suggested: 9 })
  })

  it('keeps safety stock in the cooler even for an item with no sales', () => {
    const [result] = suggestOrders({ ...item, safetyStock: 5, orderStep: 4 }, '2026-09-29', 2, [])
    expect(result.suggested).toBe(4) // 0 + 5 − 2 = 3 → 4
  })

  it('treats items saved before safety stock existed as 0', () => {
    const legacy = { id: 'a', orderStep: 9 } as Item
    expect(suggestOrders(legacy, '2026-09-29', 20, weeks)[0].suggested).toBe(18) // 19 + 0 − 8 = 11 → 18
  })

  it('returns nothing on a non-order day', () => {
    expect(suggestOrders(item, '2026-09-28', 10, weeks)).toEqual([])
  })
})
