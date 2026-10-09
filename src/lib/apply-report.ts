import type { Item, SalesWeek } from '../types'
import { addDaysIso } from './dates'
import { nameLooksLikeCode, normalizeCode, normalizeName } from './item-detect'
import { detectedFields, newItem } from './items'
import type { ParsedSalesRow } from './sales-parse'

/** 'new' creates an item, 'skip' ignores the row, anything else is an existing item id. */
export type Match = 'new' | 'skip' | string

/**
 * Finds the item for a report row: by UPC, then vendor code, then name/alias. An item whose name
 * is just a code (left by an import that grabbed the wrong column) matches by that code.
 */
export function itemMatcher(items: Item[]) {
  const byCode = new Map<string, Item>()
  const byName = new Map<string, Item>()
  for (const item of items) {
    for (const code of [item.code, item.vendorCode ?? '', ...(nameLooksLikeCode(item.name) ? [item.name] : [])]) {
      if (normalizeCode(code)) byCode.set(normalizeCode(code), item)
    }
    for (const name of [item.name, ...item.aliases]) byName.set(normalizeName(name), item)
  }
  return (row: ParsedSalesRow): Item | undefined =>
    (row.upc && byCode.get(normalizeCode(row.upc))) || (row.vendorCode && byCode.get(normalizeCode(row.vendorCode))) || byName.get(normalizeName(row.name))
}

export const autoMatches = (items: Item[], rows: ParsedSalesRow[]): Match[] => {
  const find = itemMatcher(items)
  return rows.map(row => find(row)?.id ?? 'new')
}

/** A report pulled mid-week has partial numbers for today and zeros after it: those days aren't complete. */
export const completeDaysFor = (weekStart: string, today: string) => [0, 1, 2, 3, 4, 5, 6].map(day => addDaysIso(weekStart, day) < today)

export interface AppliedReport {
  /** Every item after the report (existing + new, with updates). */
  items: Item[]
  /** Items created or changed — what needs saving. */
  changed: Item[]
  newCount: number
  updatedCount: number
  week: SalesWeek
}

/**
 * Turns a parsed report into a SalesWeek, creating new items and filling in what existing ones are
 * missing (codes, a real name for code-named items, extra name spellings as aliases).
 */
export function applyReport(items: Item[], rows: ParsedSalesRow[], matches: Match[], meta: { weekStart: string; fileName: string; today: string }): AppliedReport {
  const byId = new Map(items.map(item => [item.id, item]))
  const newIds = new Set<string>()
  const updatedIds = new Set<string>()
  let nextWalk = items.reduce((max, item) => Math.max(max, item.walkOrder), -1) + 1
  const weekRows: SalesWeek['rows'] = []

  rows.forEach((row, i) => {
    const match = matches[i]
    if (match === 'skip') return
    let itemId = match
    if (match === 'new') {
      const item = newItem(row, nextWalk++)
      byId.set(item.id, item)
      newIds.add(item.id)
      itemId = item.id
    } else {
      const original = byId.get(match)
      if (original) {
        let item = { ...original, vendorCode: original.vendorCode ?? '', safetyStock: original.safetyStock ?? 0 }
        if (!item.code && row.upc) item.code = row.upc
        if (!item.vendorCode && row.vendorCode) item.vendorCode = row.vendorCode
        if (nameLooksLikeCode(item.name)) {
          // Repair an item named after a code: take the report name and re-detect brand/size.
          item = { ...item, name: row.name, ...detectedFields(row.name) }
        } else if (![item.name, ...item.aliases].some(name => normalizeName(name) === normalizeName(row.name))) {
          item.aliases = [...item.aliases, row.name]
        }
        if (JSON.stringify(item) !== JSON.stringify(original)) {
          byId.set(item.id, item)
          if (!newIds.has(item.id)) updatedIds.add(item.id)
        }
      }
    }
    const total = row.total ?? row.days.reduce((a, b) => a + b, 0)
    const existing = weekRows.find(r => r.itemId === itemId)
    if (existing) {
      // Two report lines linked to one item: add them together.
      existing.days = existing.days.map((value, day) => value + row.days[day]) as typeof existing.days
      existing.total += total
    } else {
      weekRows.push({ itemId, days: [...row.days] as typeof row.days, total })
    }
  })

  const all = [...byId.values()]
  return {
    items: all,
    changed: all.filter(item => newIds.has(item.id) || updatedIds.has(item.id)),
    newCount: newIds.size,
    updatedCount: updatedIds.size,
    week: { weekStart: meta.weekStart, fileName: meta.fileName, uploadedAt: new Date().toISOString(), rows: weekRows, completeDays: completeDaysFor(meta.weekStart, meta.today) },
  }
}

/** Several weekly reports in one go, oldest first, so items created by one file are matched in the next. */
export function applyReports(items: Item[], reports: { rows: ParsedSalesRow[]; weekStart: string; fileName: string }[], today: string) {
  let current = items
  const changed = new Map<string, Item>()
  const weeks: SalesWeek[] = []
  let newCount = 0
  for (const report of [...reports].sort((a, b) => a.weekStart.localeCompare(b.weekStart))) {
    const result = applyReport(current, report.rows, autoMatches(current, report.rows), { ...report, today })
    current = result.items
    result.changed.forEach(item => changed.set(item.id, item))
    newCount += result.newCount
    weeks.push(result.week)
  }
  const existingIds = new Set(items.map(item => item.id))
  return { changed: [...changed.values()], weeks, newCount, updatedCount: [...changed.keys()].filter(id => existingIds.has(id)).length }
}
