import type { Brand, Size } from '../types'

export const DEFAULT_ORDER_STEP: Record<Size, number> = { '2L': 9, '1L': 16, '4L': 4, Cream: 16, Other: 1 }

export function detectSize(name: string): Size {
  // Cream first: "35% Cream 1L" is a cream (16 per crate), not a 1L milk — same step today, but
  // the size filter on the count screen should put it under Creams.
  if (/cr[eè]me|cream|\bcr\b|\b(5|6|10|15|18|35)\s?%/i.test(name)) return 'Cream'
  if (/\b4\s?l\b/i.test(name)) return '4L'
  if (/\b2\s?l\b/i.test(name)) return '2L'
  if (/\b1\s?l\b/i.test(name)) return '1L'
  return 'Other'
}

export function detectBrand(name: string): Brand {
  if (/lactantia|\blact\b/i.test(name)) return 'Lactantia'
  if (/b[eé]atrice|\bbeat\b/i.test(name)) return 'Béatrice'
  return 'Other'
}

/** Case/spacing/punctuation-insensitive key used to match report names to items. */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()
}
