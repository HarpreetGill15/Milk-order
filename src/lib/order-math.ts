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
  /** Units expected on hand when the truck arrives (count minus sales until then, or projected for a later delivery). */
  stockAtDelivery: number
  /** Forecast sales across coversDates. */
  forecast: number
  /** Units to still have in the cooler when the next truck comes. */
  safetyStock: number
  suggested: number
  /** A second delivery ordered the same day (e.g. Friday's Monday order): stock is projected, not counted. */
  projected: boolean
}

/**
 * Suggested order quantities for one item for every delivery ordered on `orderDate`.
 *
 *   stock at delivery = count − forecast(order day … day before delivery)   (count is before 10am)
 *   order             = forecast(covered days) + safety stock − stock at delivery, rounded up to orderStep
 *
 * A later delivery ordered the same day has no count of its own, so its stock is projected from
 * the earlier one: stock then + what's being ordered − forecast until the later delivery.
 * `finalOverrides[i]` is the hand-edited quantity for delivery i, when there is one.
 */
export function suggestOrders(
  item: Pick<Item, 'orderStep' | 'safetyStock'>,
  orderDate: string,
  countedUnits: number,
  plans: DeliveryPlan[],
  forecast: (date: string) => number,
  finalOverrides: (number | undefined)[] = [],
): OrderSuggestion[] {
  const sum = (dates: string[]) => dates.reduce((total, date) => total + forecast(date), 0)
  const results: OrderSuggestion[] = []
  plans.forEach((plan, index) => {
    let stock: number
    if (index === 0) {
      stock = Math.max(0, countedUnits - sum(datesBetween(orderDate, plan.deliveryDate)))
    } else {
      const previous = results[index - 1]
      const ordered = finalOverrides[index - 1] ?? previous.suggested
      stock = Math.max(0, previous.stockAtDelivery + ordered - sum(datesBetween(previous.deliveryDate, plan.deliveryDate)))
    }
    const coverForecast = sum(plan.coversDates)
    // Items saved before safety stock existed have no value yet.
    const safetyStock = item.safetyStock ?? 0
    const suggested = roundUpToStep(coverForecast + safetyStock - stock, item.orderStep)
    results.push({ deliveryDate: plan.deliveryDate, coversDates: plan.coversDates, stockAtDelivery: stock, forecast: coverForecast, safetyStock, suggested, projected: index > 0 })
  })
  return results
}
