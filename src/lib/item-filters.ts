import type { Brand, Item, Size } from '../types'
import { BRANDS, SIZES } from '../types'

export type SortMode = 'walk' | 'size' | 'brand'
export interface ItemFilter { sort: SortMode; brand: Brand | 'All'; size: Size | 'All' }
export const DEFAULT_FILTER: ItemFilter = { sort: 'walk', brand: 'All', size: 'All' }

export function filterAndSort(items: Item[], filter: ItemFilter): Item[] {
  const byWalk = (a: Item, b: Item) => a.walkOrder - b.walkOrder || a.name.localeCompare(b.name)
  const compare: Record<SortMode, (a: Item, b: Item) => number> = {
    walk: byWalk,
    size: (a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size) || BRANDS.indexOf(a.brand) - BRANDS.indexOf(b.brand) || byWalk(a, b),
    brand: (a, b) => BRANDS.indexOf(a.brand) - BRANDS.indexOf(b.brand) || SIZES.indexOf(a.size) - SIZES.indexOf(b.size) || byWalk(a, b),
  }
  return items
    .filter(item => item.active && (filter.brand === 'All' || item.brand === filter.brand) && (filter.size === 'All' || item.size === filter.size))
    .sort(compare[filter.sort])
}

export const SIZE_LABEL: Record<Size, string> = { '2L': '2L', '1L': '1L', '4L': '4L bags', Cream: 'Creams', Other: 'Other' }
