import type { WeekDays } from '../types'
import { sundayOf, toIso } from './dates'

export interface ParsedSalesRow {
  name: string
  days: WeekDays
  /** Total column from the report, if it had one. */
  total: number | null
  /** The report's Total doesn't equal the sum of the 7 days — usually a misread PDF line. */
  mismatch: boolean
}

export interface ParsedSalesReport {
  rows: ParsedSalesRow[]
  /** Sunday of the week, when the report shows dates. The user confirms it before saving either way. */
  weekStart: string | null
  warnings: string[]
}

const DAY_PATTERNS = [/^sun/i, /^mon/i, /^tue/i, /^wed/i, /^thu/i, /^fri/i, /^sat/i]
const SUMMARY_ROW = /^(grand\s*)?(sub\s*)?total\b|^totals?$/i

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/,/g, '')
  if (!text) return null
  const negative = /^\(.*\)$/.test(text)
  const number = Number(text.replace(/[()]/g, ''))
  if (!Number.isFinite(number)) return null
  return negative ? -number : number
}

/** Parses a date-looking header cell (Date object, ISO, or m/d/yyyy). */
function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (us) return new Date(Number(us[3].length === 2 ? `20${us[3]}` : us[3]), Number(us[1]) - 1, Number(us[2]))
  return null
}

function dayIndexOfHeader(value: unknown): { day: number; date: Date | null } | null {
  const date = parseDateCell(value)
  if (date) return { day: date.getDay(), date }
  if (typeof value !== 'string') return null
  const text = value.trim()
  // "Sun 09/20" or "Sunday" — the weekday name wins.
  const day = DAY_PATTERNS.findIndex(pattern => pattern.test(text))
  return day >= 0 ? { day, date: null } : null
}

function buildRow(name: string, rawDays: number[], total: number | null): ParsedSalesRow {
  const days = rawDays.map(value => Math.max(0, Math.round(value))) as WeekDays
  const sum = days.reduce((a, b) => a + b, 0)
  return { name, days, total, mismatch: total !== null && Math.round(total) !== sum }
}

/** Spreadsheet rows (from SheetJS `sheet_to_json(..., { header: 1 })`): item name, Sun … Sat, Total. */
export function parseSalesTable(table: unknown[][]): ParsedSalesReport {
  const warnings: string[] = []
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
  const totalColumn = header.findIndex(cell => typeof cell === 'string' && /total/i.test(cell))
  const firstDayColumn = Math.min(...dayColumns.values())
  let nameColumn = header.findIndex((cell, column) => column < firstDayColumn && typeof cell === 'string' && /item|desc|name|product|article/i.test(cell))
  if (nameColumn < 0) nameColumn = 0

  const rows: ParsedSalesRow[] = []
  for (const row of table.slice(headerIndex + 1)) {
    const name = String(row[nameColumn] ?? '').trim()
    if (!name || SUMMARY_ROW.test(name)) continue
    const days = [0, 1, 2, 3, 4, 5, 6].map(day => parseNumber(row[dayColumns.get(day)!]) ?? 0)
    const total = totalColumn >= 0 ? parseNumber(row[totalColumn]) : null
    if (days.every(value => value === 0) && !total) continue
    rows.push(buildRow(name, days, total))
  }
  if (rows.length === 0) warnings.push('No item rows found under the header.')
  return { rows, weekStart: firstDate ? sundayOf(toIso(firstDate)) : null, warnings }
}

const NUMERIC_TOKEN = /^\(?-?[\d,]+(\.\d+)?\)?$/
const DATE_IN_TEXT = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\b/

/**
 * PDF text lines: each item line ends with 7 day numbers and (usually) a Total. Everything before
 * those trailing numbers is the item name, so names containing numbers ("2L", "3.25%") are fine as
 * long as they don't end in a bare number.
 */
export function parseSalesLines(lines: string[]): ParsedSalesReport {
  const rows: ParsedSalesRow[] = []
  let weekStart: string | null = null
  for (const line of lines) {
    if (!weekStart) {
      const dateMatch = line.match(DATE_IN_TEXT)
      const date = dateMatch ? parseDateCell(dateMatch[1]) : null
      if (date) weekStart = sundayOf(toIso(date))
    }
    const tokens = line.trim().split(/\s+/)
    let firstNumeric = tokens.length
    while (firstNumeric > 0 && NUMERIC_TOKEN.test(tokens[firstNumeric - 1])) firstNumeric--
    const numbers = tokens.slice(firstNumeric).map(token => parseNumber(token)!)
    const name = tokens.slice(0, firstNumeric).join(' ')
    if (numbers.length < 7 || !name || SUMMARY_ROW.test(name)) continue

    if (numbers.length >= 8) {
      // Trailing 8 = Sun…Sat + Total. Any extra leading numbers belong to the name.
      const extra = numbers.length - 8
      const fullName = [name, ...tokens.slice(firstNumeric, firstNumeric + extra)].join(' ')
      rows.push(buildRow(fullName, numbers.slice(extra, extra + 7), numbers[extra + 7]))
    } else {
      rows.push(buildRow(name, numbers, null))
    }
  }
  const warnings = rows.length === 0 ? ['No item lines found. Each line should end with 7 daily numbers and a total.'] : []
  return { rows, weekStart, warnings }
}
