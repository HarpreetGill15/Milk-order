import type { Brand, Size } from '../types'

export const DEFAULT_ORDER_STEP: Record<Size, number> = { '2L': 9, '1L': 16, '4L': 4, Cream: 16, Other: 1 }

export function detectSize(name: string): Size {
  // Cream first: "35% Cream 1L" is a cream (16 per crate), not a 1L milk — same step today, but
  // the size filter on the count screen should put it under Creams. "cof.cr." is the report's
  // abbreviation for coffee cream.
  if (/cr[eè]me|cream|\bcr\b|\b(5|6|10|15|18|35)\s?%/i.test(name)) return 'Cream'
  if (/\b4\s?l\b/i.test(name)) return '4L'
  if (/\b2\s?l\b/i.test(name)) return '2L'
  if (/\b1\s?l\b/i.test(name)) return '1L'
  return 'Other'
}

export function detectBrand(name: string): Brand {
  if (/lactantia|\blact\b/i.test(name)) return 'Lactantia'
  // The BDMS report abbreviates Béatrice as "Beatr."
  if (/b[eé]atrice|\bbeatr?\b/i.test(name)) return 'Béatrice'
  if (/\bs[eé]lection\b/i.test(name)) return 'Selection'
  return 'Other'
}

/** Case/spacing/punctuation-insensitive key used to match report names to items. */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()
}

/** Codes compare without leading zeros — Excel drops them from numeric cells ("0005530011001" → 5530011001). */
export function normalizeCode(code: string): string {
  return code.replace(/\D/g, '').replace(/^0+/, '')
}

/** True for names that are only digits/punctuation — what a bad import leaves when it grabs a code column. */
export const nameLooksLikeCode = (name: string) => !/[a-z]/i.test(name)

export interface ItemIdentity {
  upc: string
  vendorCode: string
  /** Description plus a short size, e.g. "Beatr.milk 2% 2L". */
  name: string
}

// Trailing size column in the BDMS report: "2l 2000ML", "4l 4000ML", "473ml 473ML" (sometimes cut off as "473M").
const SIZE_SUFFIX = /\s+(\d+(?:\.\d+)?)\s?(l|ml)\s+\d+\s?[a-z]*$/i

/**
 * Splits the text left of the day columns — "0005530011001 12088501 Beatr.milk 2% 2l 2000ML" —
 * into UPC, vendor code and a readable name. Plain names with no codes pass through unchanged.
 */
export function parseIdentity(text: string): ItemIdentity {
  let rest = text.trim().replace(/\s+/g, ' ')
  let upc = ''
  let vendorCode = ''
  const upcMatch = rest.match(/^(\d{10,14})\s+/)
  if (upcMatch) {
    upc = upcMatch[1]
    rest = rest.slice(upcMatch[0].length)
    const vendorMatch = rest.match(/^(\d{4,9})\s+/)
    if (vendorMatch) {
      vendorCode = vendorMatch[1]
      rest = rest.slice(vendorMatch[0].length)
    }
  }
  const size = rest.match(SIZE_SUFFIX)
  if (size) rest = `${rest.slice(0, size.index)} ${size[1]}${size[2].toLowerCase() === 'l' ? 'L' : 'ml'}`
  return { upc, vendorCode, name: rest.trim() }
}
