import type { CountEntry, Item, OrderLine, SalesWeek } from '../types'
import { DEFAULT_ORDER_STEP, detectBrand, detectSize, parseIdentity } from '../lib/item-detect'
import { store } from './store'

type Doc = Record<string, unknown>
const asDoc = <T extends object>(value: T) => value as unknown as Doc

export const newId = () => crypto.randomUUID()

/** Brand, size and crate size guessed from the name. */
export function detectedFields(name: string): Pick<Item, 'brand' | 'size' | 'orderStep'> {
  const size = detectSize(name)
  return { brand: detectBrand(name), size, orderStep: DEFAULT_ORDER_STEP[size] }
}

export function newItem(identity: { name: string; upc?: string; vendorCode?: string }, walkOrder: number): Item {
  const name = identity.name.trim()
  return { id: newId(), name, aliases: [], ...detectedFields(name), code: identity.upc ?? '', vendorCode: identity.vendorCode ?? '', walkOrder, safetyStock: 0, active: true }
}

/** Manual add: accepts a plain name or a pasted report line with codes. */
export const newItemFromText = (text: string, walkOrder: number) => newItem(parseIdentity(text), walkOrder)

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
