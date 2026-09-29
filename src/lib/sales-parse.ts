import type { WeekDays } from '../types'
import { sundayOf, toIso } from './dates'
import { parseIdentity } from './item-detect'

export interface ParsedSalesRow {
  name: string
  upc: string
  vendorCode: string
  days: WeekDays
  /** Units-sold / Total column from the report, if it had one. */
  total: number | null
  /** The report's total doesn't equal the sum of the 7 days — usually a misread line. */
  mismatch: boolean
}

export interface ParsedSalesReport {
  rows: ParsedSalesRow[]
  /** Sunday of the week, when the report shows dates. The user confirms it before saving either way. */
  weekStart: string | null
  warnings: string[]
}

/** One piece of text from a PDF page with its horizontal position. */
export interface PdfCell { x: number; width: number; text: string }

const DAY_PATTERNS = [/^sun/i, /^mon/i, /^tue/i, /^wed/i, /^thu/i, /^fri/i, /^sat/i]
const DAY_CELL = /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?$/i
const TOTAL_CELL = /^(unit\s*)?sold$|^total$|^units?$/i
// "Total", "Grand Total", "Vendor Total", "Sub-total" … — no milk is named "total".
const SUMMARY_ROW = /\btotals?\b|\bsub-?totals?\b/i
const DATE_IN_TEXT = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\b/
const NUMERIC_TOKEN = /^\(?-?[\d,]+(\.\d+)?\)?$/
const MONEY_TOKEN = /^\(?-?\$[\d,]+(\.\d+)?\)?$/

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/,/g, '')
  if (!text) return null
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-')
  const number = Number(text.replace(/[()-]/g, ''))
  if (!Number.isFinite(number)) return null
  return negative ? -number : number
}

/** Parses a date-looking value (Date object, yyyy-mm-dd, yyyy/mm/dd or m/d/yyyy). */
function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (us) return new Date(Number(us[3].length === 2 ? `20${us[3]}` : us[3]), Number(us[1]) - 1, Number(us[2]))
  return null
}

function weekStartFromText(text: string): string | null {
  const match = text.match(DATE_IN_TEXT)
  const date = match ? parseDateCell(match[1]) : null
  return date ? sundayOf(toIso(date)) : null
}

function buildRow(identityText: string, rawDays: number[], total: number | null): ParsedSalesRow | null {
  const identity = parseIdentity(identityText)
  // Vendor group headings ("0000202277 LACTALIS CANADA INC") and blank lines have no sales at all.
  if (!/[a-z]/i.test(identity.name) || SUMMARY_ROW.test(identity.name)) return null
  const days = rawDays.map(value => Math.max(0, Math.round(value))) as WeekDays
  const sum = days.reduce((a, b) => a + b, 0)
  if (sum === 0 && !total) return null
  return { ...identity, days, total, mismatch: total !== null && Math.round(total) !== sum }
}

function dayIndexOfHeader(value: unknown): { day: number; date: Date | null } | null {
  const date = parseDateCell(value)
  if (date) return { day: date.getDay(), date }
  if (typeof value !== 'string') return null
  const day = DAY_PATTERNS.findIndex(pattern => pattern.test(value.trim()))
  return day >= 0 ? { day, date: null } : null
}

/**
 * Spreadsheet rows (SheetJS `sheet_to_json(..., { header: 1 })`). Everything left of the first day
 * column is joined and split into UPC / vendor code / name, so it works whether the export puts
 * the description in its own column or merges it with the codes.
 */
export function parseSalesTable(table: unknown[][]): ParsedSalesReport {
  const headerIndex = table.findIndex(row => new Set(row.map(dayIndexOfHeader).filter(Boolean).map(hit => hit!.day)).size >= 7)
  if (headerIndex < 0) return { rows: [], weekStart: null, warnings: ['Could not find a header row with all 7 days (Sunday … Saturday).'] }

  const header = table[headerIndex]
  const dayColumns = new Map<number, number>() // weekday → column
  let firstDate: Date | null = null
  header.forEach((cell, column) => {
    const hit = dayIndexOfHeader(cell)
    if (!hit || dayColumns.has(hit.day)) return
    dayColumns.set(hit.day, column)
    if (hit.date && (!firstDate || hit.date < firstDate)) firstDate = hit.date
  })
  const totalColumn = header.findIndex(cell => typeof cell === 'string' && /total|sold/i.test(cell))
  const firstDayColumn = Math.min(...dayColumns.values())

  let weekStart = firstDate ? sundayOf(toIso(firstDate)) : null
  for (const row of table.slice(0, headerIndex)) {
    weekStart ??= weekStartFromText(row.map(cell => (cell instanceof Date ? toIso(cell) : String(cell ?? ''))).join(' '))
  }

  const rows: ParsedSalesRow[] = []
  for (const row of table.slice(headerIndex + 1)) {
    const identityText = row.slice(0, firstDayColumn).map(cell => String(cell ?? '').trim()).filter(Boolean).join(' ')
    const days = [0, 1, 2, 3, 4, 5, 6].map(day => parseNumber(row[dayColumns.get(day)!]) ?? 0)
    const parsed = buildRow(identityText, days, totalColumn >= 0 ? parseNumber(row[totalColumn]) : null)
    if (parsed) rows.push(parsed)
  }
  return { rows, weekStart, warnings: rows.length === 0 ? ['No item rows found under the header.'] : [] }
}

/**
 * PDF rows with x-positions. The BDMS "Item Sales by Vendor 7 Days" report leaves days with no
 * sales blank, so numbers can't be read left-to-right — each number goes to the column whose
 * header (Sun … Sat, Unit Sold, Sales) it sits under.
 */
export function parseSalesCells(pdfRows: PdfCell[][]): ParsedSalesReport | null {
  const center = (cell: PdfCell) => cell.x + cell.width / 2
  let columns: { day: number[]; total: number | null; sales: number | null } | null = null
  let weekStart: string | null = null
  const rows: ParsedSalesRow[] = []

  pdfRows.forEach((cells, rowIndex) => {
    const text = cells.map(cell => cell.text).join(' ')
    weekStart ??= weekStartFromText(text)

    const dayCells = new Map<number, PdfCell>()
    for (const cell of cells) {
      if (!DAY_CELL.test(cell.text.trim())) continue
      const day = DAY_PATTERNS.findIndex(pattern => pattern.test(cell.text.trim()))
      if (!dayCells.has(day)) dayCells.set(day, cell)
    }
    if (dayCells.size === 7) {
      // Header row (repeated on every page). "Unit Sold" is often split over two lines, so look
      // at the neighbouring rows too for the totals column.
      const day = [0, 1, 2, 3, 4, 5, 6].map(d => center(dayCells.get(d)!))
      const nearby = pdfRows.slice(Math.max(0, rowIndex - 2), rowIndex + 2).flat()
      const right = (cell: PdfCell) => center(cell) > day[6]
      const totalCell = nearby.find(cell => right(cell) && TOTAL_CELL.test(cell.text.trim()))
      const salesCell = nearby.find(cell => right(cell) && /^(sales|amount|\$)$/i.test(cell.text.trim()))
      columns = { day, total: totalCell ? center(totalCell) : null, sales: salesCell ? center(salesCell) : null }
      return
    }
    if (!columns) return

    const cols = columns
    const halfGap = (cols.day[1] - cols.day[0]) / 2
    const boundary = cols.day[0] - halfGap
    const identity = cells.filter(cell => center(cell) < boundary).map(cell => cell.text).join(' ')
    const days = [0, 0, 0, 0, 0, 0, 0]
    let total: number | null = null
    for (const cell of cells) {
      const value = cell.text.trim()
      if (center(cell) < boundary || MONEY_TOKEN.test(value) || !NUMERIC_TOKEN.test(value)) continue
      const targets = [...cols.day.map((x, d) => ({ x, key: d as number | 'total' | 'sales' })),
        ...(cols.total !== null ? [{ x: cols.total, key: 'total' as const }] : []),
        ...(cols.sales !== null ? [{ x: cols.sales, key: 'sales' as const }] : [])]
      const nearest = targets.reduce((best, target) => (Math.abs(target.x - center(cell)) < Math.abs(best.x - center(cell)) ? target : best))
      const number = parseNumber(value) ?? 0
      if (nearest.key === 'total') total = number
      else if (nearest.key !== 'sales') days[nearest.key] += number
    }
    const parsed = buildRow(identity, days, total)
    if (parsed) rows.push(parsed)
  })

  if (!columns) return null
  return { rows, weekStart, warnings: rows.length === 0 ? ['Found the Sun … Sat header but no item lines under it.'] : [] }
}

/**
 * Fallback for PDFs without a recognisable header: each item line must end with all 7 day numbers
 * (and usually a total). Dollar amounts are ignored.
 */
export function parseSalesLines(lines: string[]): ParsedSalesReport {
  const rows: ParsedSalesRow[] = []
  let weekStart: string | null = null
  for (const line of lines) {
    weekStart ??= weekStartFromText(line)
    const tokens = line.trim().split(/\s+/).filter(token => !MONEY_TOKEN.test(token))
    let firstNumeric = tokens.length
    while (firstNumeric > 0 && NUMERIC_TOKEN.test(tokens[firstNumeric - 1])) firstNumeric--
    const numbers = tokens.slice(firstNumeric).map(token => parseNumber(token)!)
    const name = tokens.slice(0, firstNumeric).join(' ')
    if (numbers.length < 7 || !name) continue
    // Trailing 8 = Sun…Sat + Total. Any extra leading numbers belong to the name.
    const extra = Math.max(0, numbers.length - 8)
    const fullName = [name, ...tokens.slice(firstNumeric, firstNumeric + extra)].join(' ')
    const parsed = numbers.length >= 8
      ? buildRow(fullName, numbers.slice(extra, extra + 7), numbers[extra + 7])
      : buildRow(name, numbers, null)
    if (parsed) rows.push(parsed)
  }
  const warnings = rows.length === 0 ? ['No item lines found. Each line should end with 7 daily numbers and a total.'] : []
  return { rows, weekStart, warnings }
}
