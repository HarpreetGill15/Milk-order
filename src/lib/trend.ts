import { differenceInCalendarDays } from 'date-fns'
import type { Count, Item, SavedOrder } from '../types'
import { fromIso } from './dates'
import { datesBetween } from './schedule'

/** How many recent count-to-count stretches an item's trend is based on. */
export const TREND_INTERVALS = 6
/** Trend can raise or lower forecasts by at most this much. */
const TREND_LIMIT = { low: 0.6, high: 1.6 }

export interface ItemTrend {
  /** Multiplier on the forecast (1 = selling as forecast). */
  factor: number
  /** Units that actually left the cooler (sold, spoiled, …) vs. forecast, over the stretches used. */
  actual: number
  forecast: number
  intervals: number
}

/**
 * Learns from previous orders: between two counts, what left the cooler is
 *   earlier count + what was delivered in between (orders marked as ordered + distros) − later count
 * Compared with what was forecast for those days, that shows whether an item is selling faster or
 * slower than the sales history says — and catches spoilage, which also has to be re-ordered.
 *
 * Only stretches of up to 4 days where every delivery in between was marked as ordered are used.
 * The factor is pulled toward 1 when there are few stretches, so one odd week can't swing it.
 */
export function learnTrends(
  items: Item[],
  counts: Count[],
  orders: SavedOrder[],
  deliveryOn: (date: string) => { deliveryDate: string } | null,
  forecast: (item: Item, date: string) => number,
  distroOn: (itemId: string, date: string) => number = () => 0,
): Record<string, ItemTrend> {
  const placed = new Map<string, Record<string, number>>()
  for (const order of orders) if (order.placed) placed.set(order.deliveryDate, order.placed.quantities)
  const sortedCounts = [...counts].sort((a, b) => a.date.localeCompare(b.date))
  const trends: Record<string, ItemTrend> = {}

  for (const item of items) {
    const stretches: { actual: number; forecast: number }[] = []
    const withItem = sortedCounts.filter(count => count.entries[item.id])
    for (let i = withItem.length - 1; i > 0 && stretches.length < TREND_INTERVALS; i--) {
      const later = withItem[i]
      const earlier = withItem[i - 1]
      const gap = differenceInCalendarDays(fromIso(later.date), fromIso(earlier.date))
      if (gap < 1 || gap > 4) continue
      // The morning count comes before that day's delivery, so deliveries on [earlier, later) count.
      const days = datesBetween(earlier.date, later.date)
      let delivered = 0
      let complete = true
      for (const day of days) {
        if (!deliveryOn(day)) continue
        const quantities = placed.get(day)
        if (!quantities) { complete = false; break }
        delivered += (quantities[item.id] ?? 0) + distroOn(item.id, day)
      }
      if (!complete) continue
      const actual = earlier.entries[item.id].total + delivered - later.entries[item.id].total
      if (actual < 0) continue // more on the shelf than could have arrived: a miscount, skip it
      stretches.push({ actual, forecast: days.reduce((sum, day) => sum + forecast(item, day), 0) })
    }
    const actual = stretches.reduce((sum, s) => sum + s.actual, 0)
    const forecastTotal = stretches.reduce((sum, s) => sum + s.forecast, 0)
    if (stretches.length === 0 || forecastTotal < 3) continue
    const raw = Math.min(TREND_LIMIT.high, Math.max(TREND_LIMIT.low, actual / forecastTotal))
    const weight = stretches.length / (stretches.length + 2)
    trends[item.id] = { factor: 1 + (raw - 1) * weight, actual, forecast: forecastTotal, intervals: stretches.length }
  }
  return trends
}

/** Most recent order marked as ordered for a delivery on the same weekday, for the "last time" hint. */
export function lastOrderedOnWeekday(orders: SavedOrder[], itemId: string, deliveryDate: string): { quantity: number; deliveryDate: string } | null {
  let best: SavedOrder | null = null
  for (const order of orders) {
    if (!order.placed || order.deliveryDate >= deliveryDate) continue
    if (fromIso(order.deliveryDate).getDay() !== fromIso(deliveryDate).getDay()) continue
    if (!best || order.deliveryDate > best.deliveryDate) best = order
  }
  if (!best) return null
  return { quantity: best.placed!.quantities[itemId] ?? 0, deliveryDate: best.deliveryDate }
}

