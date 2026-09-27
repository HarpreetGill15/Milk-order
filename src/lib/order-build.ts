import type { Count, Item, SalesWeek, SavedOrder } from '../types'
import { deliveriesFor, suggestOrders, type OrderSuggestion } from './order-math'

export interface OrderRow {
  item: Item
  counted: number | null
  suggestion: OrderSuggestion
  /** Hand-edited quantity if one was saved, else the suggestion. */
  final: number
  edited: boolean
}

export interface DeliveryOrder {
  deliveryDate: string
  coversDays: number[]
  projected: boolean
  rows: OrderRow[]
}

/** Builds every delivery's order for `orderDate` from the count, sales history and any saved edits. */
export function buildOrders(items: Item[], orderDate: string, count: Count | undefined, weeks: SalesWeek[], saved: SavedOrder[]): DeliveryOrder[] {
  const plans = deliveriesFor(orderDate)
  const savedFor = plans.map(plan => saved.find(order => order.orderDate === orderDate && order.deliveryDate === plan.deliveryDate))
  const deliveries: DeliveryOrder[] = plans.map((plan, i) => ({ ...plan, projected: i > 0, rows: [] }))

  for (const item of items.filter(candidate => candidate.active)) {
    const entry = count?.entries[item.id]
    const counted = entry ? entry.total : null
    const overrides = savedFor.map(order => order?.lines[item.id]?.final)
    suggestOrders(item, orderDate, counted ?? 0, weeks, overrides).forEach((suggestion, i) => {
      const override = overrides[i]
      deliveries[i].rows.push({ item, counted, suggestion, final: override ?? suggestion.suggested, edited: override !== undefined && override !== suggestion.suggested })
    })
  }
  return deliveries
}
