import { describe, expect, it } from 'vitest'
import { createCalendar, easterSunday, HOLIDAYS } from './holidays'

const dateOf = (id: string, year: number) => HOLIDAYS.find(h => h.id === id)!.dateFor(year)

describe('Ontario holiday dates', () => {
  it.each([
    ['new-year', '2026-01-01'], ['family-day', '2026-02-16'], ['easter', '2026-04-05'], ['victoria-day', '2026-05-18'],
    ['canada-day', '2026-07-01'], ['civic-holiday', '2026-08-03'], ['labour-day', '2026-09-07'], ['thanksgiving', '2026-10-12'], ['christmas', '2026-12-25'],
  ])('%s 2026 → %s', (id, date) => expect(dateOf(id, 2026)).toBe(date))

  it('computes Easter and Victoria Day in other years', () => {
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(dateOf('victoria-day', 2025)).toBe('2025-05-19')
    expect(dateOf('thanksgiving', 2025)).toBe('2025-10-13')
  })
})

describe('calendar', () => {
  const calendar = createCalendar([], [])

  it('closes the store on Ontario retail holidays by default', () => {
    expect(calendar.isClosed('2026-10-12')).toBe(true) // Thanksgiving
    expect(calendar.isClosed('2026-04-03')).toBe(true) // Good Friday
    expect(calendar.isClosed('2026-08-03')).toBe(false) // Civic Holiday stays open
    expect(calendar.isClosed('2026-10-13')).toBe(false)
  })

  it('boosts lead-up days, more for cream', () => {
    expect(calendar.factor('cream', '2026-10-10')).toBeCloseTo(1.6)
    expect(calendar.factor('milk', '2026-10-10')).toBeCloseTo(1.2)
    expect(calendar.factor('milk', '2026-10-20')).toBe(1)
    expect(calendar.marks('2026-10-10')[0].label).toBe('Thanksgiving −2 days')
  })

  it('handles New Year offsets across the year boundary', () => {
    expect(calendar.marks('2026-12-31').map(m => m.label)).toEqual(["New Year's Day −1 day"])
    expect(calendar.isClosed('2027-01-01')).toBe(true)
  })

  it('store settings beat learned values, which beat defaults', () => {
    const custom = createCalendar(
      [{ id: 'thanksgiving', days: { '0': { closed: false }, '-2': { cream: 100 } } }],
      [{ id: 'promo', name: 'Cream promo', start: '2026-10-20', end: '2026-10-21', closed: false, milk: 0, cream: 50 }],
      { thanksgiving: { '-2': { milk: { boost: 35, samples: 1 }, cream: { boost: 70, samples: 1 } } } },
    )
    expect(custom.isClosed('2026-10-12')).toBe(false)
    const mark = custom.marks('2026-10-10')[0]
    expect([mark.milk, mark.milkSource, mark.cream, mark.creamSource]).toEqual([35, 'learned', 100, 'set'])
    expect(custom.factor('cream', '2026-10-21')).toBeCloseTo(1.5)
    expect(custom.isAffected('2026-10-22')).toBe(false)
  })
})
