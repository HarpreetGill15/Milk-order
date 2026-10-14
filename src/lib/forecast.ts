import { differenceInCalendarDays } from 'date-fns'
import type { Count, Item, SalesWeek } from '../types'
import { addDaysIso, dayOfWeek, fromIso, sundayOf } from './dates'
import { categoryOf, HOLIDAYS, type Category, type LearnedEffects } from './holidays'

/** Up to this many same-weekday samples are averaged… */
export const FORECAST_SAMPLES = 8
/** …from weeks within this many days of the date being forecast. */
export const FORECAST_WINDOW_DAYS = 16 * 7

export interface ForecastContext {
  weeks: SalesWeek[]
  /** Holiday/event days — not normal days, so they're kept out of normal averages. */
  isAffected: (date: string) => boolean
  /** The morning count showed none on the shelf, so that day's sales say nothing about demand. */
  wasOutOfStock: (itemId: string, date: string) => boolean
  /** The item was in the flyer that day — promo sales aren't normal sales. */
  isPromo?: (itemId: string, date: string) => boolean
}

export function outOfStockLookup(counts: Count[]) {
  const empty = new Set<string>()
  for (const count of counts) {
    for (const [itemId, entry] of Object.entries(count.entries)) if (entry.total === 0) empty.add(`${itemId}|${count.date}`)
  }
  return (itemId: string, date: string) => empty.has(`${itemId}|${date}`)
}

/**
 * Normal-day forecast for `date`: the same weekday from the nearest weeks (at most
 * FORECAST_SAMPLES, within FORECAST_WINDOW_DAYS), nearer weeks weighted more. Skips days that were
 * holidays/events, promo days for the item, sold out, or not over when the report was pulled.
 * With 5+ samples the single highest and lowest are dropped so one odd day can't swing the order.
 */
export function forecastBase(itemId: string, date: string, ctx: ForecastContext): number {
  const weekday = dayOfWeek(date)
  const samples: { distance: number; value: number }[] = []
  for (const week of ctx.weeks) {
    if (week.completeDays?.[weekday] === false) continue
    const sampleDate = addDaysIso(week.weekStart, weekday)
    const distance = Math.abs(differenceInCalendarDays(fromIso(sampleDate), fromIso(date)))
    if (distance === 0 || distance > FORECAST_WINDOW_DAYS) continue
    if (ctx.isAffected(sampleDate) || ctx.wasOutOfStock(itemId, sampleDate) || ctx.isPromo?.(itemId, sampleDate)) continue
    const row = week.rows.find(r => r.itemId === itemId)
    if (row) samples.push({ distance, value: row.days[weekday] })
  }
  samples.sort((a, b) => a.distance - b.distance)
  let used = samples.slice(0, FORECAST_SAMPLES)
  if (used.length >= 5) {
    const values = used.map(s => s.value)
    const maxIndex = values.indexOf(Math.max(...values))
    const minIndex = values.lastIndexOf(Math.min(...values))
    used = used.filter((_, i) => i !== maxIndex && i !== (minIndex === maxIndex ? -1 : minIndex))
  }
  if (used.length === 0) return 0
  // Nearest week gets weight n, the next n−1, … the farthest 1.
  let total = 0
  let weights = 0
  used.forEach((sample, i) => {
    const weight = used.length - i
    total += sample.value * weight
    weights += weight
  })
  return total / weights
}

/**
 * Learns each holiday day's real boost from uploaded history: actual sales of the category on
 * that day ÷ the normal-day forecast for it (from surrounding non-holiday weeks). Needs the
 * holiday week plus a few normal weeks around it.
 */
export function learnHolidayEffects(items: Item[], ctx: ForecastContext, isClosed: (date: string) => boolean): LearnedEffects {
  const learned: LearnedEffects = {}
  if (ctx.weeks.length === 0) return learned
  const weekByStart = new Map(ctx.weeks.map(week => [week.weekStart, week]))
  const itemById = new Map(items.map(item => [item.id, item]))
  const years = ctx.weeks.map(week => fromIso(week.weekStart).getFullYear())
  const ratios = new Map<string, number[]>() // `${holiday}|${offset}|${category}`

  for (const holiday of HOLIDAYS) {
    for (let year = Math.min(...years) - 1; year <= Math.max(...years) + 1; year++) {
      const holidayDate = holiday.dateFor(year)
      for (const day of holiday.days) {
        const date = addDaysIso(holidayDate, day.offset)
        if (isClosed(date)) continue
        const week = weekByStart.get(sundayOf(date))
        const weekday = dayOfWeek(date)
        if (!week || week.completeDays?.[weekday] === false) continue
        const sums: Record<Category, { actual: number; base: number }> = { milk: { actual: 0, base: 0 }, cream: { actual: 0, base: 0 } }
        for (const row of week.rows) {
          const item = itemById.get(row.itemId)
          if (!item || ctx.wasOutOfStock(item.id, date)) continue
          const base = forecastBase(item.id, date, ctx)
          if (base <= 0) continue
          sums[categoryOf(item)].actual += row.days[weekday]
          sums[categoryOf(item)].base += base
        }
        for (const category of ['milk', 'cream'] as const) {
          // Ignore tiny baselines — a ratio of 3 ÷ 1 says nothing.
          if (sums[category].base < 5) continue
          const key = `${holiday.id}|${day.offset}|${category}`
          ratios.set(key, [...(ratios.get(key) ?? []), sums[category].actual / sums[category].base])
        }
      }
    }
  }

  for (const [key, values] of ratios) {
    const [holidayId, offset, category] = key.split('|') as [string, string, Category]
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    learned[holidayId] ??= {}
    learned[holidayId][offset] ??= {}
    learned[holidayId][offset][category] = { boost: Math.round((mean - 1) * 100), samples: values.length }
  }
  return learned
}
