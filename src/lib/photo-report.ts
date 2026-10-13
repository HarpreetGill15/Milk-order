import type { Item, WeekDays } from '../types'
import { sundayOf } from './dates'
import { normalizeCode, parseIdentity } from './item-detect'
import type { ParsedSalesReport, ParsedSalesRow } from './sales-parse'

/** One row as /api/read-report returns it (see SCHEMA there). */
export interface PhotoRow {
  upc: string
  vendor_code: string | null
  description: string
  size: string
  sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number
  units_sold: number | null
  discontinued: boolean
}

export interface PhotoReading {
  report_type: 'sales_7_days' | 'order_sheet' | 'other'
  date_from: string | null
  date_to: string | null
  rows: PhotoRow[]
}

const days = (row: PhotoRow): WeekDays =>
  [row.sun, row.mon, row.tue, row.wed, row.thu, row.fri, row.sat].map(value => Math.max(0, Math.round(Number(value) || 0))) as WeekDays

const nameOf = (row: PhotoRow) => parseIdentity(`${row.description} ${row.size}`).name

/**
 * Sales rows from every 7-day-report photo, merged by UPC (photos of one long report overlap
 * when scrolling). When a UPC shows up twice, the copy whose days add up to Unit Sold wins.
 */
export function salesFromPhotos(readings: PhotoReading[]): ParsedSalesReport | null {
  const sales = readings.filter(reading => reading.report_type === 'sales_7_days')
  if (sales.length === 0) return null
  const byCode = new Map<string, ParsedSalesRow>()
  for (const reading of sales) {
    for (const row of reading.rows) {
      const parsed: ParsedSalesRow = { name: nameOf(row), upc: row.upc, vendorCode: row.vendor_code ?? '', days: days(row), total: row.units_sold, mismatch: false }
      const sum = parsed.days.reduce((a, b) => a + b, 0)
      parsed.mismatch = parsed.total !== null && parsed.total !== sum
      const key = normalizeCode(row.upc) || parsed.name
      const existing = byCode.get(key)
      if (!existing || (existing.mismatch && !parsed.mismatch)) byCode.set(key, parsed)
    }
  }
  const dated = sales.find(reading => reading.date_from)
  const warnings = sales.length > 1 && !sales.every(reading => !reading.date_from || reading.date_from === dated?.date_from)
    ? ['These photos show different weeks — upload one week at a time.']
    : []
  return { rows: [...byCode.values()], weekStart: dated?.date_from ? sundayOf(dated.date_from) : null, warnings }
}

export interface CatalogueRow {
  upc: string
  name: string
  discontinued: boolean
  /** Probably not something to count/order (yogurt, "No Order" placeholders, discontinued). */
  suggestSkip: boolean
  /** Already on the item list (matched by UPC). */
  existingId: string | null
}

const NOT_MILK = /yog|no order|parmalat|milkshake/i

/** Items from Order Sheet photos, deduplicated by UPC and marked if already on the list. */
export function catalogueFromPhotos(readings: PhotoReading[], items: Item[]): CatalogueRow[] {
  const known = new Map<string, string>()
  for (const item of items) for (const code of [item.code, item.vendorCode ?? '']) if (normalizeCode(code)) known.set(normalizeCode(code), item.id)
  const rows = new Map<string, CatalogueRow>()
  for (const reading of readings) {
    if (reading.report_type !== 'order_sheet') continue
    for (const row of reading.rows) {
      const key = normalizeCode(row.upc)
      if (!key || rows.has(key)) continue
      const discontinued = row.discontinued || /^disc\b/i.test(row.size)
      const name = nameOf(row)
      rows.set(key, { upc: row.upc, name, discontinued, suggestSkip: discontinued || NOT_MILK.test(name), existingId: known.get(key) ?? null })
    }
  }
  return [...rows.values()]
}
