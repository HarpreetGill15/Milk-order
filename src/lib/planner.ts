import type { Count, Item, SalesWeek } from '../types'
import { forecastBase, learnHolidayEffects, outOfStockLookup, type ForecastContext } from './forecast'
import { categoryOf, createCalendar, type Calendar, type CustomEvent, type HolidaySetting, type LearnedEffects } from './holidays'
import { createSchedule, type Schedule, type ScheduleChange } from './schedule'

export interface PlannerInput {
  items: Item[]
  weeks: SalesWeek[]
  counts: Count[]
  changes: ScheduleChange[]
  holidaySettings: HolidaySetting[]
  events: CustomEvent[]
}

export interface Planner {
  calendar: Calendar
  schedule: Schedule
  learned: LearnedEffects
  /** Expected units sold of the item on the date: 0 when closed, normal-day forecast × holiday factor otherwise. */
  forecast: (item: Pick<Item, 'id' | 'size'>, date: string) => number
}

/** Ties together the holiday calendar, delivery schedule and sales history. */
export function createPlanner(input: PlannerInput): Planner {
  // Which days are holidays doesn't depend on boosts, so the first calendar can decide what to
  // leave out of normal averages; the second one adds the boosts learned from that history.
  const baseCalendar = createCalendar(input.holidaySettings, input.events)
  const ctx: ForecastContext = { weeks: input.weeks, isAffected: baseCalendar.isAffected, wasOutOfStock: outOfStockLookup(input.counts) }
  const learned = learnHolidayEffects(input.items, ctx, baseCalendar.isClosed)
  const calendar = createCalendar(input.holidaySettings, input.events, learned)
  const schedule = createSchedule(input.changes, calendar.isClosed)
  const cache = new Map<string, number>()
  const forecast = (item: Pick<Item, 'id' | 'size'>, date: string) => {
    const key = `${item.id}|${date}`
    if (!cache.has(key)) cache.set(key, calendar.isClosed(date) ? 0 : forecastBase(item.id, date, ctx) * calendar.factor(categoryOf(item), date))
    return cache.get(key)!
  }
  return { calendar, schedule, learned, forecast }
}
