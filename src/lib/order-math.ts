import type { Item, SalesWeek } from '../types'
import { addDaysIso, dayOfWeek } from './dates'

/** How many past weeks of the same weekday are averaged into a forecast. */
export const FORECAST_WEEKS = 4

export interface DeliveryPlan {
  deliveryDate: string
  /** Weekdays (0 = Sun) this delivery has to last through. */
  coversDays: number[]
}

/**
 * Orders are placed the morning before delivery, except Friday which orders for both Saturday and
 * Monday. Returns the deliveries ordered on `orderDate` (empty if it isn't an order day).
 *   Tue → Wed (covers Wed, Thu)   Thu → Fri (covers Fri)
 *   Fri → Sat (covers Sat, Sun)   Fri → Mon (covers Mon, Tue)
 */
export function deliveriesFor(orderDate: string): DeliveryPlan[] {
  switch (dayOfWeek(orderDate)) {
    case 2: return [{ deliveryDate: addDaysIso(orderDate, 1), coversDays: [3, 4] }]
    case 4: return [{ deliveryDate: addDaysIso(orderDate, 1), coversDays: [5] }]
    case 5: return [
      { deliveryDate: addDaysIso(orderDate, 1), coversDays: [6, 0] },
      { deliveryDate: addDaysIso(orderDate, 3), coversDays: [1, 2] },
    ]
    default: return []
  }
}

export const isOrderDay = (iso: string) => deliveriesFor(iso).length > 0

/** Next order day on or after `iso`. */
export function nextOrderDay(iso: string): string {
  let date = iso
  while (!isOrderDay(date)) date = addDaysIso(date, 1)
  return date
}

/**
 * Average units sold on `weekday` over the most recent FORECAST_WEEKS reports that include the
 * item. Weeks the item doesn't appear in are skipped rather than counted as zero, so a newly added
 * item isn't dragged down by weeks before it existed.
 */
export function forecastForDay(itemId: string, weekday: number, weeks: SalesWeek[]): number {
  const samples = [...weeks]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map(week => week.rows.find(row => row.itemId === itemId))
    .filter(row => row !== undefined)
    .slice(0, FORECAST_WEEKS)
    .map(row => row.days[weekday])
  if (samples.length === 0) return 0
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

export function bufferFor(item: Pick<Item, 'bufferPct' | 'bufferMin'>, forecast: number): number {
  // No buffer for items that aren't selling — otherwise a dead item would order a full crate forever.
  if (forecast <= 0) return 0
  return Math.max(item.bufferMin, Math.ceil((forecast * item.bufferPct) / 100))
}

export function roundUpToStep(units: number, step: number): number {
  if (units <= 0) return 0
  const safeStep = step > 0 ? step : 1
  return Math.ceil(units / safeStep) * safeStep
}

export interface OrderSuggestion {
  deliveryDate: string
  coversDays: number[]
  /** Units expected on hand when the truck arrives (count minus the rest of the order day's sales, or projected for Monday). */
  stockAtDelivery: number
  /** Forecast sales across coversDays. */
  forecast: number
  buffer: number
  suggested: number
  /** True for Friday's Monday order, which is based on a projected (not counted) stock level. */
  projected: boolean
}

/**
 * Suggested order quantities for one item for every delivery ordered on `orderDate`.
 *
 *   stock at delivery = count − forecast(order day)        (counted before 10am, so the whole day's sales still happen)
 *   order             = forecast(covered days) + buffer − stock at delivery, rounded up to orderStep
 *
 * Friday's Monday order has no count to work from, so its stock is projected from the Saturday
 * delivery: stock at Sat + Sat order − forecast(Sat, Sun). `finalOverrides[i]` is the hand-edited
 * quantity for delivery i, when there is one.
 */
export function suggestOrders(item: Item, orderDate: string, countedUnits: number, weeks: SalesWeek[], finalOverrides: (number | undefined)[] = []): OrderSuggestion[] {
  const forecast = (day: number) => forecastForDay(item.id, day, weeks)
  let stock = Math.max(0, countedUnits - forecast(dayOfWeek(orderDate)))
  const results: OrderSuggestion[] = []
  deliveriesFor(orderDate).forEach((plan, index) => {
    if (index > 0) {
      const previous = results[index - 1]
      // If the earlier order was edited by hand, project from what's actually being ordered.
      const ordered = finalOverrides[index - 1] ?? previous.suggested
      stock = Math.max(0, previous.stockAtDelivery + ordered - previous.forecast)
    }
    const coverForecast = plan.coversDays.reduce((sum, day) => sum + forecast(day), 0)
    const buffer = bufferFor(item, coverForecast)
    const suggested = roundUpToStep(coverForecast + buffer - stock, item.orderStep)
    results.push({ ...plan, stockAtDelivery: stock, forecast: coverForecast, buffer, suggested, projected: index > 0 })
  })
  return results
}
