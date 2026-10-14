import type { Count, Item, SavedOrder } from '../types'
import { suggestOrders, type OrderSuggestion } from './order-math'
import type { Planner } from './planner'
import type { LiftSource } from './promos'
import { datesBetween } from './schedule'
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

/** A delivery ordered on an earlier day that lands between this order's count and its delivery. */
export interface EarlierDelivery {
  deliveryDate: string
  orderDate: string
  /** Where its quantities come from. */
  source: 'placed' | 'suggested' | 'unknown'
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
  /** Earlier-ordered deliveries counted in this delivery's starting stock. */
  earlier: EarlierDelivery[]
}

/** Builds every delivery's order for `orderDate` from the count, forecasts, saved edits, earlier orders and distros. */
export function buildOrders(items: Item[], orderDate: string, counts: Count[], planner: Planner, saved: SavedOrder[]): DeliveryOrder[] {
  const count = counts.find(c => c.date === orderDate)
  const plans = planner.schedule.plansFor(orderDate)
  const planDates = new Set(plans.map(plan => plan.deliveryDate))
  const savedOrder = (orderDay: string, deliveryDate: string) => saved.find(order => order.orderDate === orderDay && order.deliveryDate === deliveryDate)
  const savedFor = plans.map(plan => savedOrder(orderDate, plan.deliveryDate))

  // Deliveries ordered on an earlier day that land after this count and before our last delivery
  // (e.g. Friday's own delivery, ordered Thursday, when ordering Saturday + Monday on Friday).
  const lastDelivery = plans[plans.length - 1]?.deliveryDate ?? orderDate
  const earlier: EarlierDelivery[] = datesBetween(orderDate, lastDelivery)
    .filter(date => !planDates.has(date))
    .map(date => planner.schedule.deliveryOn(date))
    .filter(delivery => delivery !== null && delivery.orderDate < orderDate)
    .map(delivery => {
      const order = savedOrder(delivery!.orderDate, delivery!.deliveryDate)
      const hasCount = counts.some(c => c.date === delivery!.orderDate)
      return { deliveryDate: delivery!.deliveryDate, orderDate: delivery!.orderDate, source: order?.placed ? 'placed' : hasCount ? 'suggested' : 'unknown' }
    })

  /** What an earlier delivery brings of the item: marked-as-ordered quantity, else edit, else its own suggestion. */
  const earlierQuantity = (item: Item, delivery: EarlierDelivery): number => {
    const order = savedOrder(delivery.orderDate, delivery.deliveryDate)
    if (order?.placed) return order.placed.quantities[item.id] ?? 0
    const edited = order?.lines[item.id]?.final
    if (edited !== undefined) return edited
    const earlierCount = counts.find(c => c.date === delivery.orderDate)?.entries[item.id]
    if (!earlierCount) return 0
    const earlierPlans = planner.schedule.plansFor(delivery.orderDate)
    const overrides = earlierPlans.map(plan => savedOrder(delivery.orderDate, plan.deliveryDate)?.lines[item.id]?.final)
    const suggestions = suggestOrders(item, delivery.orderDate, earlierCount.total, earlierPlans, date => planner.forecast(item, date), overrides, date => planner.distroOn(item.id, date))
    return suggestions.find(s => s.deliveryDate === delivery.deliveryDate)?.suggested ?? 0
  }

  const deliveries: DeliveryOrder[] = plans.map((plan, i) => ({
    ...plan,
    projected: i > 0,
    rows: [],
    placed: savedFor[i]?.placed ?? null,
    earlier: earlier.filter(e => e.deliveryDate < plan.deliveryDate),
  }))

  for (const item of items.filter(candidate => candidate.active)) {
    const entry = count?.entries[item.id]
    const counted = entry ? entry.total : null
    const overrides = savedFor.map(order => order?.lines[item.id]?.final)
    const fromEarlier = new Map(earlier.map(delivery => [delivery.deliveryDate, earlierQuantity(item, delivery)]))
    const arrivals = (date: string) => planner.distroOn(item.id, date) + (fromEarlier.get(date) ?? 0)
    suggestOrders(item, orderDate, counted ?? 0, plans, date => planner.forecast(item, date), overrides, arrivals).forEach((suggestion, i) => {
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
