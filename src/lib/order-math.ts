import type { Item } from '../types'
import { datesBetween, type DeliveryPlan } from './schedule'

export function roundUpToStep(units: number, step: number): number {
  if (units <= 0) return 0
  const safeStep = step > 0 ? step : 1
  return Math.ceil(units / safeStep) * safeStep
}

export interface OrderSuggestion {
  deliveryDate: string
  coversDates: string[]
  /** Units expected on hand when the truck arrives, before this delivery (and its distro) is added. */
  stockAtDelivery: number
  /** Units arriving before this delivery that aren't part of this order: earlier orders and distros. */
  arriving: number
  /** Distro (promo stock the warehouse sends without an order) arriving with this delivery. */
  incoming: number
  /** Forecast sales across coversDates. */
  forecast: number
  /** Units to still have in the cooler when the next truck comes. */
  safetyStock: number
  suggested: number
  /** A second delivery ordered the same day (e.g. Friday's Monday order): stock is projected, not counted. */
  projected: boolean
}

/**
 * Suggested order quantities for one item for every delivery ordered on `orderDate`, walking day
 * by day from the morning count:
 *
 *   each day: stock = max(0, stock + what arrives that day − forecast sales that day)
 *   at a delivery: order = forecast(covered days) + safety stock − stock − distro on this truck,
 *                  rounded up to orderStep
 *
 * `arrivals(date)` is stock that turns up that day without being part of this order: a delivery
 * ordered on an earlier day (Friday's own delivery, ordered Thursday, lands after Friday's
 * count) and distros. A later delivery ordered the same day (Friday's Monday order) builds on the
 * earlier one: stock then + distro + what's being ordered, then the days in between.
 * `finalOverrides[i]` is the hand-edited quantity for delivery i, when there is one.
 */
export function suggestOrders(
  item: Pick<Item, 'orderStep' | 'safetyStock'>,
  orderDate: string,
  countedUnits: number,
  plans: DeliveryPlan[],
  forecast: (date: string) => number,
  finalOverrides: (number | undefined)[] = [],
  arrivals: (date: string) => number = () => 0,
): OrderSuggestion[] {
  const sum = (dates: string[]) => dates.reduce((total, date) => total + forecast(date), 0)
  // Items saved before safety stock existed have no value yet.
  const safetyStock = item.safetyStock ?? 0
  const results: OrderSuggestion[] = []
  let stock = countedUnits
  let from = orderDate
  let skipArrivalsOn: string | null = null

  plans.forEach((plan, index) => {
    let arriving = 0
    for (const date of datesBetween(from, plan.deliveryDate)) {
      const arrived = date === skipArrivalsOn ? 0 : arrivals(date)
      arriving += arrived
      stock = Math.max(0, stock + arrived - forecast(date))
    }
    const incoming = arrivals(plan.deliveryDate)
    const coverForecast = sum(plan.coversDates)
    const suggested = roundUpToStep(coverForecast + safetyStock - stock - incoming, item.orderStep)
    results.push({ deliveryDate: plan.deliveryDate, coversDates: plan.coversDates, stockAtDelivery: stock, arriving, incoming, forecast: coverForecast, safetyStock, suggested, projected: index > 0 })
    // The next delivery ordered today starts from this one arriving.
    stock += incoming + (finalOverrides[index] ?? suggested)
    from = plan.deliveryDate
    skipArrivalsOn = plan.deliveryDate
  })
  return results
}
