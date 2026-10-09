import type { Item } from '../types'
import { DEFAULT_ORDER_STEP, detectBrand, detectSize, parseIdentity } from './item-detect'

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
