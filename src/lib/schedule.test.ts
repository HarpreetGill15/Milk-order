import { describe, expect, it } from 'vitest'
import { createCalendar } from './holidays'
import { createSchedule } from './schedule'

const noHolidays = () => false

describe('regular schedule', () => {
  const schedule = createSchedule([], noHolidays)
  // 2026-09-29 Tue, 2026-10-01 Thu, 2026-10-02 Fri
  it('Tuesday orders Wednesday, covering Wed + Thu', () => {
    expect(schedule.plansFor('2026-09-29')).toEqual([{ deliveryDate: '2026-09-30', coversDates: ['2026-09-30', '2026-10-01'], changed: false }])
  })
  it('Thursday orders Friday, covering Fri', () => {
    expect(schedule.plansFor('2026-10-01')).toEqual([{ deliveryDate: '2026-10-02', coversDates: ['2026-10-02'], changed: false }])
  })
  it('Friday orders Saturday (Sat + Sun) and Monday (Mon + Tue)', () => {
    expect(schedule.plansFor('2026-10-02').map(p => [p.deliveryDate, p.coversDates])).toEqual([
      ['2026-10-03', ['2026-10-03', '2026-10-04']],
      ['2026-10-05', ['2026-10-05', '2026-10-06']],
    ])
  })
  it('finds order days', () => {
    expect(schedule.isOrderDay('2026-09-28')).toBe(false)
    expect(schedule.nextOrderDay('2026-09-28')).toBe('2026-09-29')
    expect(schedule.nextOrderDay('2026-10-03')).toBe('2026-10-06')
    expect(schedule.previousOrderDay('2026-10-06')).toBe('2026-10-02')
  })
})

describe('Thanksgiving week 2026 (store closed Mon Oct 12)', () => {
  const calendar = createCalendar([], [])
  // Supplier change: no Saturday delivery, a Sunday delivery ordered Friday instead.
  const schedule = createSchedule([
    { date: '2026-10-10', delivery: false },
    { date: '2026-10-11', delivery: true, orderDate: '2026-10-09' },
  ], calendar.isClosed)

  it('drops the Monday delivery automatically because the store is closed', () => {
    expect(schedule.deliveryOn('2026-10-12')).toBeNull()
    expect(schedule.missingReason('2026-10-12')).toBe('closed')
    expect(schedule.missingReason('2026-10-10')).toBe('removed')
  })

  it('Friday orders only the Sunday delivery, which lasts until Wednesday', () => {
    expect(schedule.plansFor('2026-10-09')).toEqual([
      { deliveryDate: '2026-10-11', coversDates: ['2026-10-11', '2026-10-12', '2026-10-13'], changed: true },
    ])
  })

  it('Tuesday orders Wednesday as usual', () => {
    expect(schedule.plansFor('2026-10-13').map(p => p.deliveryDate)).toEqual(['2026-10-14'])
  })
})
