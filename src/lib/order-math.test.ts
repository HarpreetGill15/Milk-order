import { describe, expect, it } from 'vitest'
import type { DeliveryPlan } from './schedule'
import { roundUpToStep, suggestOrders } from './order-math'

const item = { orderStep: 9, safetyStock: 2 }
const forecastFrom = (byDate: Record<string, number>) => (date: string) => byDate[date] ?? 0
const plan = (deliveryDate: string, coversDates: string[]): DeliveryPlan => ({ deliveryDate, coversDates, changed: false })

describe('roundUpToStep', () => {
  it('always rounds up to the order step', () => {
    expect(roundUpToStep(15, 9)).toBe(18)
    expect(roundUpToStep(18, 9)).toBe(18)
    expect(roundUpToStep(0.2, 16)).toBe(16)
    expect(roundUpToStep(-3, 9)).toBe(0)
    expect(roundUpToStep(5, 0)).toBe(5)
    // Floating-point leftovers don't add a crate: 0.1 × 3 × 40 is 12.000000000000002 in JavaScript.
    expect(0.1 * 3 * 40).not.toBe(12)
    expect(roundUpToStep(0.1 * 3 * 40, 4)).toBe(12)
    expect(roundUpToStep(44.01, 4)).toBe(48)
  })
})

describe('suggestOrders', () => {
  // Tue Sep 29: 12, Wed: 10, Thu: 9
  const forecast = forecastFrom({ '2026-09-29': 12, '2026-09-30': 10, '2026-10-01': 9 })
  const wednesday = [plan('2026-09-30', ['2026-09-30', '2026-10-01'])]

  it('Tuesday: count 20 − Tue 12 = 8 on hand; Wed+Thu 19 + safety 2 − 8 = 13 → 18', () => {
    const [result] = suggestOrders(item, '2026-09-29', 20, wednesday, forecast)
    expect(result).toMatchObject({ stockAtDelivery: 8, forecast: 19, safetyStock: 2, suggested: 18, projected: false })
  })

  it('orders nothing when stock already covers forecast + safety stock', () => {
    expect(suggestOrders(item, '2026-09-29', 60, wednesday, forecast)[0].suggested).toBe(0)
  })

  it('never treats negative stock as a credit', () => {
    expect(suggestOrders(item, '2026-09-29', 0, wednesday, forecast)[0]).toMatchObject({ stockAtDelivery: 0, suggested: 27 })
  })

  it('keeps safety stock in the cooler for an item with no sales', () => {
    expect(suggestOrders({ orderStep: 4, safetyStock: 5 }, '2026-09-29', 2, wednesday, () => 0)[0].suggested).toBe(4)
  })

  it('treats items saved before safety stock existed as 0', () => {
    expect(suggestOrders({ orderStep: 9 } as typeof item, '2026-09-29', 20, wednesday, forecast)[0].suggested).toBe(18)
  })

  describe('Friday: Saturday + Monday', () => {
    // Fri 5, Sat 20, Sun 10, Mon 8, Tue 6
    const fri = forecastFrom({ '2026-10-02': 5, '2026-10-03': 20, '2026-10-04': 10, '2026-10-05': 8, '2026-10-06': 6 })
    const plans = [plan('2026-10-03', ['2026-10-03', '2026-10-04']), plan('2026-10-05', ['2026-10-05', '2026-10-06'])]

    it('projects Monday stock from the Saturday order', () => {
      const [sat, mon] = suggestOrders(item, '2026-10-02', 12, plans, fri)
      // Sat: 12 − 5 = 7; 30 + 2 − 7 = 25 → 27. Mon: 7 + 27 − 30 = 4; 14 + 2 − 4 = 12 → 18
      expect(sat).toMatchObject({ stockAtDelivery: 7, forecast: 30, suggested: 27, projected: false })
      expect(mon).toMatchObject({ stockAtDelivery: 4, forecast: 14, suggested: 18, projected: true })
    })

    it('uses a hand-edited Saturday quantity for the Monday projection', () => {
      const [, mon] = suggestOrders(item, '2026-10-02', 12, plans, fri, [36])
      expect(mon).toMatchObject({ stockAtDelivery: 13, suggested: 9 })
    })
  })

  it('Thanksgiving: Friday count, Sunday delivery — subtracts Fri + Sat sales, covers Sun–Tue', () => {
    const forecast = forecastFrom({ '2026-10-09': 6, '2026-10-10': 12, '2026-10-11': 8, '2026-10-12': 0, '2026-10-13': 7 })
    const [sunday] = suggestOrders(item, '2026-10-09', 30, [plan('2026-10-11', ['2026-10-11', '2026-10-12', '2026-10-13'])], forecast)
    // 30 − (6 + 12) = 12 on hand; 15 + 2 − 12 = 5 → 9
    expect(sunday).toMatchObject({ stockAtDelivery: 12, forecast: 15, suggested: 9 })
  })

  describe('stock that arrives without being part of this order', () => {
    // Fri 5, Sat 20, Sun 10, Mon 8, Tue 6
    const fri = forecastFrom({ '2026-10-02': 5, '2026-10-03': 20, '2026-10-04': 10, '2026-10-05': 8, '2026-10-06': 6 })
    const plans = [plan('2026-10-03', ['2026-10-03', '2026-10-04']), plan('2026-10-05', ['2026-10-05', '2026-10-06'])]

    it("counts Friday's own delivery (ordered Thursday) that lands after the Friday count", () => {
      const arrivals = (date: string) => (date === '2026-10-02' ? 9 : 0)
      const [sat, mon] = suggestOrders(item, '2026-10-02', 12, plans, fri, [], arrivals)
      // Sat: 12 + 9 − 5 = 16 on hand; 30 + 2 − 16 = 16 → 18 (was 27 without the Friday delivery)
      expect(sat).toMatchObject({ stockAtDelivery: 16, arriving: 9, incoming: 0, suggested: 18 })
      // Mon: 16 + 18 − 30 = 4; 14 + 2 − 4 = 12 → 18
      expect(mon).toMatchObject({ stockAtDelivery: 4, suggested: 18 })
    })

    it('takes a distro on the delivery off the order, and carries it into the next one', () => {
      const arrivals = (date: string) => (date === '2026-10-03' ? 20 : 0)
      const [sat, mon] = suggestOrders(item, '2026-10-02', 12, plans, fri, [], arrivals)
      // Sat: 7 on hand + 20 distro; 30 + 2 − 7 − 20 = 5 → 9. Mon: 7 + 20 + 9 − 30 = 6; 14 + 2 − 6 = 10 → 18
      expect(sat).toMatchObject({ stockAtDelivery: 7, incoming: 20, suggested: 9 })
      expect(mon).toMatchObject({ stockAtDelivery: 6, arriving: 0, suggested: 18 })
    })

    it('a distro bigger than the need orders nothing', () => {
      const [sat] = suggestOrders(item, '2026-10-02', 12, plans, fri, [], date => (date === '2026-10-03' ? 40 : 0))
      expect(sat.suggested).toBe(0)
    })
  })

  it('returns nothing when no deliveries are ordered that day', () => {
    expect(suggestOrders(item, '2026-09-28', 10, [], forecast)).toEqual([])
  })
})
