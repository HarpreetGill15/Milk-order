import type { Item } from '../types'
import { addDaysIso, fromIso, toIso } from './dates'

export type Category = 'milk' | 'cream'
export const categoryOf = (item: Pick<Item, 'size'>): Category => (item.size === 'Cream' ? 'cream' : 'milk')

/** One day around a holiday: `offset` days from the holiday itself, with % sales boosts per category. */
export interface HolidayDay { offset: number; closed: boolean; milk: number; cream: number }

export interface HolidayDef {
  id: string
  name: string
  dateFor: (year: number) => string
  days: HolidayDay[]
}

/** The store's own choices for a holiday, per offset. Anything left out uses learned or default values. */
export interface HolidaySetting {
  id: string
  days: Record<string, { closed?: boolean; milk?: number; cream?: number }>
}

/** One-off event (promo, storm, long weekend…) set by hand. */
export interface CustomEvent {
  id: string
  name: string
  start: string
  end: string
  closed: boolean
  milk: number
  cream: number
}

/** Boosts learned from past sales: learned[holidayId][offset][category]. */
export type LearnedEffects = Record<string, Record<string, Partial<Record<Category, { boost: number; samples: number }>>>>

const iso = (year: number, month: number, day: number) => toIso(new Date(year, month - 1, day))

/** The `n`th `weekday` (0 = Sun) of a month. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(year, month - 1, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return iso(year, month, 1 + offset + (n - 1) * 7)
}

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

/** Monday on or before May 24. */
function victoriaDay(year: number): string {
  const may24 = new Date(year, 4, 24)
  return toIso(new Date(year, 4, 24 - ((may24.getDay() + 6) % 7)))
}

const day = (offset: number, milk: number, cream: number, closed = false): HolidayDay => ({ offset, milk, cream, closed })

/**
 * Ontario holidays. "Closed" defaults follow the Retail Business Holidays Act (New Year's, Family
 * Day, Good Friday, Easter Sunday, Victoria Day, Canada Day, Labour Day, Thanksgiving, Christmas);
 * the store can switch any of them to open. Boost percentages are starting guesses — once past
 * holiday weeks are uploaded, the app learns the real numbers and uses those instead.
 */
export const HOLIDAYS: HolidayDef[] = [
  { id: 'new-year', name: "New Year's Day", dateFor: y => iso(y, 1, 1), days: [day(-2, 10, 20), day(-1, 20, 40), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'family-day', name: 'Family Day', dateFor: y => nthWeekday(y, 2, 1, 3), days: [day(-3, 10, 10), day(-2, 10, 10), day(-1, 10, 10), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'easter', name: 'Easter', dateFor: easterSunday, days: [day(-3, 25, 40), day(-2, 0, 0, true), day(-1, 30, 60), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'victoria-day', name: 'Victoria Day', dateFor: victoriaDay, days: [day(-3, 15, 15), day(-2, 15, 15), day(-1, 10, 10), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'canada-day', name: 'Canada Day', dateFor: y => iso(y, 7, 1), days: [day(-2, 10, 10), day(-1, 15, 15), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'civic-holiday', name: 'Civic Holiday', dateFor: y => nthWeekday(y, 8, 1, 1), days: [day(-3, 10, 10), day(-2, 10, 10), day(-1, 10, 10), day(0, 0, 0)] },
  { id: 'labour-day', name: 'Labour Day', dateFor: y => nthWeekday(y, 9, 1, 1), days: [day(-3, 10, 10), day(-2, 10, 10), day(-1, 10, 10), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'thanksgiving', name: 'Thanksgiving', dateFor: y => nthWeekday(y, 10, 1, 2), days: [day(-3, 15, 40), day(-2, 20, 60), day(-1, 15, 40), day(0, 0, 0, true), day(1, 0, 0)] },
  { id: 'christmas', name: 'Christmas', dateFor: y => iso(y, 12, 25), days: [day(-3, 20, 50), day(-2, 30, 80), day(-1, 30, 80), day(0, 0, 0, true), day(1, 0, 0)] },
]

export function offsetLabel(holiday: Pick<HolidayDef, 'id' | 'name'>, offset: number): string {
  if (holiday.id === 'easter') {
    const names: Record<number, string> = { [-3]: 'Thursday before Easter', [-2]: 'Good Friday', [-1]: 'Easter Saturday', 0: 'Easter Sunday', 1: 'Easter Monday' }
    if (names[offset]) return names[offset]
  }
  if (offset === 0) return holiday.name
  if (offset === 1) return `Day after ${holiday.name}`
  return `${holiday.name} −${-offset} day${offset === -1 ? '' : 's'}`
}

export type BoostSource = 'default' | 'learned' | 'set'

export interface DayMark {
  /** Holiday id or `event:<id>`. */
  id: string
  label: string
  holidayId?: string
  offset?: number
  closed: boolean
  milk: number
  cream: number
  milkSource: BoostSource
  creamSource: BoostSource
}

export interface Calendar {
  marks: (date: string) => DayMark[]
  isClosed: (date: string) => boolean
  /** Any holiday or event touches this day — its sales aren't a normal day's. */
  isAffected: (date: string) => boolean
  /** Sales multiplier for the category on that date (1 = normal). */
  factor: (category: Category, date: string) => number
}

/** Effective values for one holiday day: the store's setting, else learned, else the default. */
export function resolveHolidayDay(holiday: HolidayDef, base: HolidayDay, settings: HolidaySetting[], learned: LearnedEffects = {}) {
  const set = settings.find(s => s.id === holiday.id)?.days[String(base.offset)] ?? {}
  const learnedDay = learned[holiday.id]?.[String(base.offset)] ?? {}
  const pick = (category: Category): [number, BoostSource] =>
    set[category] !== undefined ? [set[category]!, 'set'] : learnedDay[category] ? [learnedDay[category]!.boost, 'learned'] : [base[category], 'default']
  const [milk, milkSource] = pick('milk')
  const [cream, creamSource] = pick('cream')
  return { closed: set.closed ?? base.closed, milk, cream, milkSource, creamSource }
}

export function createCalendar(settings: HolidaySetting[], events: CustomEvent[], learned: LearnedEffects = {}): Calendar {
  const cache = new Map<string, DayMark[]>()
  const marks = (date: string): DayMark[] => {
    const cached = cache.get(date)
    if (cached) return cached
    const result: DayMark[] = []
    const year = fromIso(date).getFullYear()
    for (const holiday of HOLIDAYS) {
      // Offsets can cross a year boundary (Dec 31 is New Year's −1), so check neighbouring years.
      for (const y of [year - 1, year, year + 1]) {
        const holidayDate = holiday.dateFor(y)
        for (const base of holiday.days) {
          if (addDaysIso(holidayDate, base.offset) !== date) continue
          result.push({ id: holiday.id, label: offsetLabel(holiday, base.offset), holidayId: holiday.id, offset: base.offset, ...resolveHolidayDay(holiday, base, settings, learned) })
        }
      }
    }
    for (const event of events) {
      if (date < event.start || date > event.end) continue
      result.push({ id: `event:${event.id}`, label: event.name, closed: event.closed, milk: event.milk, cream: event.cream, milkSource: 'set', creamSource: 'set' })
    }
    cache.set(date, result)
    return result
  }
  return {
    marks,
    isClosed: date => marks(date).some(mark => mark.closed),
    isAffected: date => marks(date).length > 0,
    factor: (category, date) => marks(date).reduce((product, mark) => product * (1 + mark[category] / 100), 1),
  }
}
