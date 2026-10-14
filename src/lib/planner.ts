import type { Count, Item, Promo, SalesWeek, SavedOrder } from '../types'
import { forecastBase, learnHolidayEffects, outOfStockLookup, type ForecastContext } from './forecast'
import { categoryOf, createCalendar, type Calendar, type CustomEvent, type HolidaySetting, type LearnedEffects } from './holidays'
import { createPromoLookup, learnPromoLift, type LearnedPromos, type PromoLookup } from './promos'
import { createSchedule, type Schedule, type ScheduleChange } from './schedule'
import { learnTrends, type ItemTrend } from './trend'

export interface PlannerInput {
  items: Item[]
  weeks: SalesWeek[]
  counts: Count[]
  changes: ScheduleChange[]
  holidaySettings: HolidaySetting[]
  events: CustomEvent[]
  promos?: Promo[]
  orders?: SavedOrder[]
}

export interface Planner {
  calendar: Calendar
  schedule: Schedule
  learned: LearnedEffects
  promos: PromoLookup
  learnedPromos: LearnedPromos
  /** Per item: selling faster/slower than forecast, learned from counts and orders marked as ordered. */
  trends: Record<string, ItemTrend>
  /**
   * Expected units sold of the item on the date: 0 when closed, otherwise
   * normal-day forecast × holiday factor × promo lift × the item's trend.
   */
  forecast: (item: Pick<Item, 'id' | 'size'>, date: string) => number
}

/** Ties together the holiday calendar, promos, delivery schedule, sales history and past orders. */
export function createPlanner(input: PlannerInput): Planner {
  const promos = input.promos ?? []
  // Which days are holidays/promos doesn't depend on boosts, so these first lookups decide what to
  // leave out of normal averages; the boosts are then learned from that history.
  const baseCalendar = createCalendar(input.holidaySettings, input.events)
  const basePromos = createPromoLookup(promos)
  const ctx: ForecastContext = { weeks: input.weeks, isAffected: baseCalendar.isAffected, wasOutOfStock: outOfStockLookup(input.counts), isPromo: basePromos.isPromo }
  const learned = learnHolidayEffects(input.items, ctx, baseCalendar.isClosed)
  const calendar = createCalendar(input.holidaySettings, input.events, learned)
  const schedule = createSchedule(input.changes, calendar.isClosed)
  const learnedPromos = learnPromoLift(input.items, promos, ctx, (item, date) => calendar.factor(categoryOf(item), date), calendar.isClosed)
  const promoLookup = createPromoLookup(promos, learnedPromos)

  const cache = new Map<string, number>()
  const withoutTrend = (item: Pick<Item, 'id' | 'size'>, date: string) => {
    const key = `${item.id}|${date}`
    if (!cache.has(key)) {
      const promo = promoLookup.promoOn(item.id, date)
      cache.set(key, calendar.isClosed(date) ? 0 : forecastBase(item.id, date, ctx) * calendar.factor(categoryOf(item), date) * (promo ? 1 + promo.lift / 100 : 1))
    }
    return cache.get(key)!
  }
  const trends = learnTrends(input.items, input.counts, input.orders ?? [], schedule.deliveryOn, withoutTrend)
  const forecast = (item: Pick<Item, 'id' | 'size'>, date: string) => withoutTrend(item, date) * (trends[item.id]?.factor ?? 1)

  return { calendar, schedule, learned, promos: promoLookup, learnedPromos, trends, forecast }
}
