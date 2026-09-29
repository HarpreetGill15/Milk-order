import { AlertTriangle, FileUp, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Button, Card } from '../components/button'
import { deleteSalesWeek, detectedFields, newItem, saveItems, saveSalesWeek } from '../data/api'
import { useItems, useSalesWeeks } from '../data/hooks'
import { addDaysIso, DAY_SHORT, lastFullWeekStart, prettyDate, sundayOf, todayIso } from '../lib/dates'
import { nameLooksLikeCode, normalizeCode, normalizeName } from '../lib/item-detect'
import { parseSalesCells, parseSalesLines, parseSalesTable, type ParsedSalesReport, type ParsedSalesRow } from '../lib/sales-parse'
import { cn } from '../lib/utils'
import type { Item, SalesWeek } from '../types'

/** 'new' creates an item, 'skip' ignores the row, anything else is an existing item id. */
type Match = 'new' | 'skip' | string

async function parseFile(file: File): Promise<ParsedSalesReport> {
  if (/\.pdf$/i.test(file.name)) {
    const { pdfToRows } = await import('../lib/pdf-text')
    const rows = await pdfToRows(file)
    return parseSalesCells(rows) ?? parseSalesLines(rows.map(cells => cells.map(cell => cell.text).join(' ')))
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  // Use the first sheet that actually has a Sun…Sat header.
  let fallback: ParsedSalesReport | null = null
  for (const sheetName of workbook.SheetNames) {
    const table = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' })
    const report = parseSalesTable(table)
    if (report.rows.length > 0) return report
    fallback ??= report
  }
  return fallback ?? { rows: [], weekStart: null, warnings: ['The file has no sheets.'] }
}

export function SalesPage() {
  const { items } = useItems()
  const { weeks } = useSalesWeeks()
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState<ParsedSalesReport | null>(null)
  const [weekStart, setWeekStart] = useState(lastFullWeekStart())
  const [matches, setMatches] = useState<Match[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  // Match by UPC, then vendor code, then name. An item whose name is just a code (left by an
  // earlier import that grabbed the wrong column) matches by that code and gets repaired on save.
  const findItem = useMemo(() => {
    const byCode = new Map<string, Item>()
    const byName = new Map<string, Item>()
    for (const item of items) {
      for (const code of [item.code, item.vendorCode ?? '', ...(nameLooksLikeCode(item.name) ? [item.name] : [])]) {
        if (normalizeCode(code)) byCode.set(normalizeCode(code), item)
      }
      for (const name of [item.name, ...item.aliases]) byName.set(normalizeName(name), item)
    }
    return (row: ParsedSalesRow) =>
      (row.upc && byCode.get(normalizeCode(row.upc))) || (row.vendorCode && byCode.get(normalizeCode(row.vendorCode))) || byName.get(normalizeName(row.name))
  }, [items])

  const onFile = async (file: File) => {
    setBusy(true); setMessage(''); setFileName(file.name)
    try {
      const parsed = await parseFile(file)
      setReport(parsed)
      if (parsed.weekStart) setWeekStart(parsed.weekStart)
      setMatches(parsed.rows.map(row => findItem(row)?.id ?? 'new'))
    } catch (error) {
      setReport(null)
      setMessage(`Couldn't read that file: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!report) return
    setBusy(true)
    try {
      const newItems: Item[] = []
      const updates = new Map<string, Item>()
      let nextWalk = items.reduce((max, item) => Math.max(max, item.walkOrder), -1) + 1
      const rows: SalesWeek['rows'] = []
      report.rows.forEach((row, i) => {
        const match = matches[i]
        if (match === 'skip') return
        let itemId = match
        if (match === 'new') {
          const item = newItem(row, nextWalk++)
          newItems.push(item)
          itemId = item.id
        } else {
          const original = updates.get(match) ?? items.find(candidate => candidate.id === match)
          if (original) {
            let item = { ...original, vendorCode: original.vendorCode ?? '', safetyStock: original.safetyStock ?? 0 }
            // Fill in codes the item doesn't have yet.
            if (!item.code && row.upc) item.code = row.upc
            if (!item.vendorCode && row.vendorCode) item.vendorCode = row.vendorCode
            if (nameLooksLikeCode(item.name)) {
              // Repair an item named after a code: take the report name and re-detect brand/size.
              item = { ...item, name: row.name, ...detectedFields(row.name) }
            } else if (![item.name, ...item.aliases].some(name => normalizeName(name) === normalizeName(row.name))) {
              item.aliases = [...item.aliases, row.name]
            }
            if (JSON.stringify(item) !== JSON.stringify(original)) updates.set(item.id, item)
          }
        }
        const existing = rows.find(r => r.itemId === itemId)
        if (existing) {
          // Two report lines linked to one item: add them together.
          existing.days = existing.days.map((value, day) => value + row.days[day]) as typeof existing.days
          existing.total += row.total ?? row.days.reduce((a, b) => a + b, 0)
        } else {
          rows.push({ itemId, days: row.days, total: row.total ?? row.days.reduce((a, b) => a + b, 0) })
        }
      })
      await saveItems([...newItems, ...updates.values()])
      await saveSalesWeek({ weekStart, fileName, uploadedAt: new Date().toISOString(), rows, completeDays })
      const partialNote = incompleteDays.length ? ` ${incompleteDays.map(day => DAY_SHORT[day]).join(', ')} not used yet (week not finished).` : ''
      setMessage(`Saved week of ${prettyDate(weekStart)}: ${rows.length} items${newItems.length ? `, ${newItems.length} new` : ''}${updates.size ? `, ${updates.size} updated` : ''}.${partialNote}`)
      setReport(null)
    } finally {
      setBusy(false)
    }
  }

  // A report pulled mid-week has partial numbers for today and zeros for the days after it.
  const completeDays = [0, 1, 2, 3, 4, 5, 6].map(day => addDaysIso(weekStart, day) < todayIso())
  const incompleteDays = completeDays.flatMap((complete, day) => (complete ? [] : [day]))
  const replacing = weeks.some(week => week.weekStart === weekStart)
  const mismatches = report?.rows.filter(row => row.mismatch).length ?? 0
  const newCount = matches.filter(match => match === 'new').length

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h1 className="text-lg font-bold">Upload 7-day sales report</h1>
        <p className="text-sm text-slate-500">The BDMS "Item Sales by Vendor 7 Days" report as PDF or Excel (or any file with item name, Sun … Sat and a total). The first upload creates your item list with UPCs and vendor codes.</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-slate-600 hover:bg-slate-50">
          <FileUp className="h-5 w-5" /> {busy ? 'Reading…' : 'Choose a file (.pdf, .xlsx, .xls, .csv)'}
          <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={event => { const file = event.target.files?.[0]; if (file) void onFile(file); event.target.value = '' }} />
        </label>
        {message && <p className="rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
      </Card>

      {report && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block font-semibold">Week starting (Sunday)</span>
              <input type="date" value={weekStart} onChange={event => event.target.value && setWeekStart(sundayOf(event.target.value))} className="mt-1 h-10 rounded-xl border px-2" />
            </label>
            <p className="text-sm text-slate-500">{fileName} · {report.rows.length} rows · {newCount} new items</p>
            <Button className="ml-auto" disabled={busy || report.rows.length === 0} onClick={() => void save()}>Save week</Button>
          </div>
          {replacing && <p className="text-sm text-amber-700">A report for this week is already saved — saving will replace it.</p>}
          {incompleteDays.length === 7 && <p className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />This week hasn't started yet — check the week date.</p>}
          {incompleteDays.length > 0 && incompleteDays.length < 7 && (
            <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />This week isn't over yet: {incompleteDays.map(day => DAY_SHORT[day]).join(', ')} won't be used for forecasts. Upload last full week (Sun–Sat) for the best numbers.</p>
          )}
          {report.warnings.map(warning => <p key={warning} className="text-sm text-red-600">{warning}</p>)}
          {mismatches > 0 && <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />{mismatches} row{mismatches === 1 ? '' : 's'} where the days don't add up to the Total (highlighted) — check them against the report.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2 pr-2">Report name</th>{DAY_SHORT.map(day => <th key={day} className="px-1 text-right">{day}</th>)}<th className="px-1 text-right">Total</th><th className="pl-3">Item</th></tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i} className={cn('border-t', row.mismatch && 'bg-amber-50')}>
                    <td className="py-1.5 pr-2">
                      <p className="font-medium">{row.name}</p>
                      {(row.upc || row.vendorCode) && <p className="font-mono text-xs text-slate-400">{[row.upc, row.vendorCode].filter(Boolean).join(' · ')}</p>}
                    </td>
                    {row.days.map((value, day) => <td key={day} className={cn('px-1 text-right tabular-nums', value === 0 && 'text-slate-300', !completeDays[day] && 'bg-slate-100')}>{value}</td>)}
                    <td className="px-1 text-right font-semibold tabular-nums">{row.total ?? '—'}</td>
                    <td className="pl-3">
                      <select className="h-9 max-w-56 rounded-lg border px-1" value={matches[i]} onChange={event => setMatches(matches.map((m, j) => (j === i ? event.target.value : m)))}>
                        <option value="new">+ New item</option>
                        <option value="skip">Skip</option>
                        {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-bold">Uploaded weeks</h2>
        {weeks.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="divide-y">
            {weeks.map(week => (
              <li key={week.weekStart} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-semibold">Week of {prettyDate(week.weekStart)}</span>
                <span className="text-slate-500">{week.rows.length} items · {week.fileName}{week.completeDays?.includes(false) ? ` · partial (${week.completeDays.flatMap((c, d) => (c ? [] : [DAY_SHORT[d]])).join(', ')} not used)` : ''}</span>
                <button className="ml-auto text-slate-400 hover:text-red-600" aria-label="Delete week" onClick={() => { if (confirm(`Delete the week of ${prettyDate(week.weekStart)}?`)) void deleteSalesWeek(week.weekStart) }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">Forecasts average the same weekday over the latest 4 weeks.</p>
      </Card>
    </div>
  )
}
