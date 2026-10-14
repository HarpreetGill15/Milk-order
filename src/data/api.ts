import type { CustomEvent } from '../lib/holidays'
import type { ScheduleChange } from '../lib/schedule'
import type { CountEntry, Item, OrderLine, Promo, SalesWeek, SavedOrder } from '../types'
import { store } from './store'

type Doc = Record<string, unknown>
const asDoc = <T extends object>(value: T) => value as unknown as Doc

export { newId } from '../lib/items'

export const saveItem = (item: Item) => store.put('items', item.id, asDoc(item))
export const saveItems = (items: Item[]) => store.putMany('items', items.map(item => ({ id: item.id, data: asDoc(item) })))
export const deleteItem = (id: string) => store.remove('items', id)

export const saveSalesWeek = (week: SalesWeek) => store.put('salesWeeks', week.weekStart, asDoc(week))
export const deleteSalesWeek = (weekStart: string) => store.remove('salesWeeks', weekStart)

export const saveCountEntry = (date: string, itemId: string, entry: CountEntry) =>
  store.merge('counts', date, { date, entries: { [itemId]: entry } })

export const saveOrder = (orderDate: string, deliveryDate: string, lines: Record<string, OrderLine>, placed?: SavedOrder['placed']) => {
  const id = `${orderDate}_${deliveryDate}`
  const order: SavedOrder = { id, orderDate, deliveryDate, lines, savedAt: new Date().toISOString(), ...(placed ? { placed } : {}) }
  return store.put('orders', id, asDoc(order))
}

/** "Mark as ordered": freezes what was ordered for each delivery so later counts can be compared with it. */
export const markOrdered = (orders: { orderDate: string; deliveryDate: string; lines: Record<string, OrderLine>; quantities: Record<string, number> }[]) =>
  Promise.all(orders.map(order => saveOrder(order.orderDate, order.deliveryDate, order.lines, { at: new Date().toISOString(), quantities: order.quantities })))

export const saveScheduleChange = (change: ScheduleChange) => store.put('scheduleChanges', change.date, asDoc(change))
export const deleteScheduleChange = (date: string) => store.remove('scheduleChanges', date)

/** Sets (or with `null`, clears back to learned/default) one value for one holiday day. */
export const setHolidayValue = (holidayId: string, offset: number, field: 'closed' | 'milk' | 'cream', value: boolean | number | null) =>
  value === null
    ? store.clearField('holidaySettings', holidayId, ['days', String(offset), field])
    : store.merge('holidaySettings', holidayId, { id: holidayId, days: { [String(offset)]: { [field]: value } } })

export const saveEvent = (event: CustomEvent) => store.put('events', event.id, asDoc(event))
export const deleteEvent = (id: string) => store.remove('events', id)

/** Puts an item in (or, with `null`, takes it out of) the flyer for the ad week starting `weekStart` (a Thursday). */
export const setPromoItem = (weekStart: string, itemId: string, value: Promo['items'][string] | null) =>
  value === null
    ? store.clearField('promos', weekStart, ['items', itemId])
    : store.merge('promos', weekStart, { weekStart, items: { [itemId]: value } })
