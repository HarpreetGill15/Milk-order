import type { Count, Item, SavedOrder } from '../types'
import { suggestOrders, type OrderSuggestion } from './order-math'
import type { Planner } from './planner'
import type { LiftSource } from './promos'
import { lastOrderedOnWeekday, type ItemTrend } from './trend'

export interface OrderRow {
  item: Item
  counted: number | null
  suggestion: OrderSuggestion
  /** Hand-edited quantity if one was saved, else the suggestion. */
  final: number
  edited: boolean
  /** In the flyer on at least one of the days this delivery covers. */
  promo: { lift: number; source: LiftSource; days: number } | null
  /** What was ordered last time for a delivery on the same weekday. */
  last: { quantity: number; deliveryDate: string } | null
  trend: ItemTrend | null
}

export interface DeliveryOrder {
  deliveryDate: string
  coversDates: string[]
  /** Comes from a schedule change rather than the regular pattern. */
  changed: boolean
  projected: boolean
  rows: OrderRow[]
  /** Set once the order is marked as ordered. */
  placed: SavedOrder['placed'] | null
}

/** Builds every delivery's order for `orderDate` from the count, forecasts and any saved edits. */
export function buildOrders(items: Item[], orderDate: string, count: Count | undefined, planner: Planner, saved: SavedOrder[]): DeliveryOrder[] {
  const plans = planner.schedule.plansFor(orderDate)
  const savedFor = plans.map(plan => saved.find(order => order.orderDate === orderDate && order.deliveryDate === plan.deliveryDate))
  const deliveries: DeliveryOrder[] = plans.map((plan, i) => ({ ...plan, projected: i > 0, rows: [], placed: savedFor[i]?.placed ?? null }))

  for (const item of items.filter(candidate => candidate.active)) {
    const entry = count?.entries[item.id]
    const counted = entry ? entry.total : null
    const overrides = savedFor.map(order => order?.lines[item.id]?.final)
    suggestOrders(item, orderDate, counted ?? 0, plans, date => planner.forecast(item, date), overrides).forEach((suggestion, i) => {
      const override = overrides[i]
      const promoDays = suggestion.coversDates.map(date => planner.promos.promoOn(item.id, date)).filter(promo => promo !== null)
      deliveries[i].rows.push({
        item,
        counted,
        suggestion,
        final: override ?? suggestion.suggested,
        edited: override !== undefined && override !== suggestion.suggested,
        promo: promoDays.length ? { ...promoDays[0], days: promoDays.length } : null,
        last: lastOrderedOnWeekday(saved, item.id, suggestion.deliveryDate),
        trend: planner.trends[item.id] ?? null,
      })
    })
  }
  return deliveries
}
