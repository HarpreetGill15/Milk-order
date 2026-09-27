import type { CountEntry, Item, OrderLine, SalesWeek } from '../types'
import { DEFAULT_ORDER_STEP, detectBrand, detectSize } from '../lib/item-detect'
import { store } from './store'

type Doc = Record<string, unknown>
const asDoc = <T extends object>(value: T) => value as unknown as Doc

export const newId = () => crypto.randomUUID()

export function newItemFromName(name: string, walkOrder: number): Item {
  const size = detectSize(name)
  return { id: newId(), name: name.trim(), aliases: [], brand: detectBrand(name), size, orderStep: DEFAULT_ORDER_STEP[size], code: '', walkOrder, bufferPct: 10, bufferMin: 2, active: true }
}

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
