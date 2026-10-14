import type { Distro, Item, Promo, SalesWeek } from '../types'
import { addDaysIso, dayOfWeek, sundayOf } from './dates'
import { forecastBase, type ForecastContext } from './forecast'

/** Flyer weeks start on Thursday and run to Wednesday. */
export const AD_WEEK_START_DAY = 4
/** Starting guess for how much more an item sells on promo, until past promos teach a real number. */
export const DEFAULT_PROMO_LIFT = 50

/** Thursday on or before `date`: the ad week it falls in. */
export const adWeekStart = (date: string) => addDaysIso(date, -((dayOfWeek(date) - AD_WEEK_START_DAY + 7) % 7))
export const adWeekDates = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))

export interface LearnedPromoLift { lift: number; samples: number }
export interface LearnedPromos {
  perItem: Record<string, LearnedPromoLift>
  /** Across every item — used for items that have never been on promo before. */
  overall: LearnedPromoLift | null
}

export type LiftSource = 'set' | 'item' | 'overall' | 'default'

export interface PromoLookup {
  /** Promo on that date for the item, with the lift to use and where it came from; null if none. */
  promoOn: (itemId: string, date: string) => { lift: number; source: LiftSource } | null
  isPromo: (itemId: string, date: string) => boolean
}

export function createPromoLookup(promos: Promo[], learned: LearnedPromos = { perItem: {}, overall: null }): PromoLookup {
  const byWeek = new Map(promos.map(promo => [promo.weekStart, promo]))
  const promoOn = (itemId: string, date: string) => {
    const entry = byWeek.get(adWeekStart(date))?.items[itemId]
    if (!entry) return null
    if (entry.lift !== undefined && entry.lift !== null) return { lift: entry.lift, source: 'set' as const }
    if (learned.perItem[itemId]) return { lift: learned.perItem[itemId].lift, source: 'item' as const }
    if (learned.overall) return { lift: learned.overall.lift, source: 'overall' as const }
    return { lift: DEFAULT_PROMO_LIFT, source: 'default' as const }
  }
  return { promoOn, isPromo: (itemId, date) => byWeek.get(adWeekStart(date))?.items[itemId] !== undefined }
}

/**
 * How much more items sold on promo, from past flyer weeks that have sales uploaded: actual sales
 * on the promo days ÷ the normal-day forecast (× holiday factor) for those days.
 */
export function learnPromoLift(
  items: Item[],
  promos: Promo[],
  ctx: ForecastContext,
  holidayFactor: (item: Item, date: string) => number,
  isClosed: (date: string) => boolean,
): LearnedPromos {
  const weekByStart = new Map<string, SalesWeek>(ctx.weeks.map(week => [week.weekStart, week]))
  const itemById = new Map(items.map(item => [item.id, item]))
  const sums = new Map<string, { actual: number; base: number; promos: Set<string> }>()
  for (const promo of promos) {
    for (const itemId of Object.keys(promo.items)) {
      const item = itemById.get(itemId)
      if (!item) continue
      for (const date of adWeekDates(promo.weekStart)) {
        const week = weekByStart.get(sundayOf(date))
        const weekday = dayOfWeek(date)
        if (!week || week.completeDays?.[weekday] === false || isClosed(date) || ctx.wasOutOfStock(itemId, date)) continue
        const row = week.rows.find(r => r.itemId === itemId)
        if (!row) continue
        const base = forecastBase(itemId, date, ctx) * holidayFactor(item, date)
        if (base <= 0) continue
        const sum = sums.get(itemId) ?? { actual: 0, base: 0, promos: new Set() }
        sum.actual += row.days[weekday]
        sum.base += base
        sum.promos.add(promo.weekStart)
        sums.set(itemId, sum)
      }
    }
  }
  const perItem: Record<string, LearnedPromoLift> = {}
  let actual = 0
  let base = 0
  let samples = 0
  for (const [itemId, sum] of sums) {
    // A tiny baseline (an item selling 1 a week) gives a meaningless ratio.
    if (sum.base < 5) continue
    perItem[itemId] = { lift: Math.round((sum.actual / sum.base - 1) * 100), samples: sum.promos.size }
    actual += sum.actual
    base += sum.base
    samples += sum.promos.size
  }
  return { perItem, overall: base > 0 ? { lift: Math.round((actual / base - 1) * 100), samples } : null }
}

/** The deliveries a distro lands on, starting at `start`, and how many units each brings. */
export function distroSplit(distro: Distro, deliveryOn: (date: string) => unknown): { deliveryDate: string; quantity: number }[] {
  const count = Math.max(1, Math.round(distro.deliveries))
  const dates: string[] = []
  for (let date = distro.start, i = 0; dates.length < count && i < 28; date = addDaysIso(date, 1), i++) if (deliveryOn(date)) dates.push(date)
  // Spread evenly; the first deliveries take the remainder (10 over 4 → 3, 3, 2, 2).
  const base = Math.floor(distro.total / count)
  const extra = distro.total - base * count
  return dates.map((deliveryDate, i) => ({ deliveryDate, quantity: base + (i < extra ? 1 : 0) }))
}

/** Default first distro delivery: the first delivery from the day before the ad starts. */
export function defaultDistroStart(weekStart: string, deliveryOn: (date: string) => unknown): string {
  for (let date = addDaysIso(weekStart, -1), i = 0; i < 14; date = addDaysIso(date, 1), i++) if (deliveryOn(date)) return date
  return weekStart
}

/** Distro units of an item arriving with the delivery on `date`. */
export function createDistroLookup(promos: Promo[], deliveryOn: (date: string) => unknown): (itemId: string, date: string) => number {
  const byKey = new Map<string, number>()
  for (const promo of promos) {
    for (const [itemId, entry] of Object.entries(promo.items)) {
      if (!entry.distro || entry.distro.total <= 0) continue
      for (const { deliveryDate, quantity } of distroSplit(entry.distro, deliveryOn)) {
        const key = `${itemId}|${deliveryDate}`
        byKey.set(key, (byKey.get(key) ?? 0) + quantity)
      }
    }
  }
  return (itemId, date) => byKey.get(`${itemId}|${date}`) ?? 0
}
