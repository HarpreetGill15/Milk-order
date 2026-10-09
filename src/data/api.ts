import type { CustomEvent } from '../lib/holidays'
import type { ScheduleChange } from '../lib/schedule'
import type { CountEntry, Item, OrderLine, SalesWeek } from '../types'
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

export const saveOrder = (orderDate: string, deliveryDate: string, lines: Record<string, OrderLine>) => {
  const id = `${orderDate}_${deliveryDate}`
  return store.put('orders', id, { id, orderDate, deliveryDate, lines, savedAt: new Date().toISOString() })
}

export const saveScheduleChange = (change: ScheduleChange) => store.put('scheduleChanges', change.date, asDoc(change))
export const deleteScheduleChange = (date: string) => store.remove('scheduleChanges', date)

/** Sets (or with `null`, clears back to learned/default) one value for one holiday day. */
export const setHolidayValue = (holidayId: string, offset: number, field: 'closed' | 'milk' | 'cream', value: boolean | number | null) =>
  value === null
    ? store.clearField('holidaySettings', holidayId, ['days', String(offset), field])
    : store.merge('holidaySettings', holidayId, { id: holidayId, days: { [String(offset)]: { [field]: value } } })

export const saveEvent = (event: CustomEvent) => store.put('events', event.id, asDoc(event))
export const deleteEvent = (id: string) => store.remove('events', id)
