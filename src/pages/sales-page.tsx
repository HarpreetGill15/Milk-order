import { AlertTriangle, FileUp, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Button, Card } from '../components/button'
import { PhotoImport } from '../components/photo-import'
import { deleteSalesWeek, saveItems, saveSalesWeek } from '../data/api'
import { useItems, useSalesWeeks } from '../data/hooks'
import { addDaysIso, DAY_SHORT, lastFullWeekStart, prettyDate, sundayOf, todayIso } from '../lib/dates'
import { applyReport, applyReports, autoMatches, completeDaysFor, type Match } from '../lib/apply-report'
import { FORECAST_SAMPLES } from '../lib/forecast'
import { createCalendar } from '../lib/holidays'
import { parseSalesCells, parseSalesLines, parseSalesTable, type ParsedSalesReport } from '../lib/sales-parse'
import { cn } from '../lib/utils'

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

interface Upload {
  fileName: string
  report: ParsedSalesReport | null
  error: string | null
  /** Sunday the report starts on — from the report's dates, or picked by hand. */
  weekStart: string | null
}

// Default holiday dates only, for labelling weeks ("Thanksgiving") — boosts don't matter here.
const holidayCalendar = createCalendar([], [])
const holidaysInWeek = (weekStart: string) => {
  const labels = new Set<string>()
  for (let day = 0; day < 7; day++) holidayCalendar.marks(addDaysIso(weekStart, day)).forEach(mark => mark.offset === 0 && labels.add(mark.label))
  return [...labels]
}

function HolidayTags({ weekStart, suffix = '' }: { weekStart: string; suffix?: string }) {
  return <>{holidaysInWeek(weekStart).map(label => <span key={label} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">{label}{suffix}</span>)}</>
}

export function SalesPage() {
  const { items } = useItems()
  const { weeks } = useSalesWeeks()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const onFiles = async (files: File[]) => {
    setBusy(true); setMessage('')
    const parsed: Upload[] = []
    for (const file of files) {
      try {
        const report = await parseFile(file)
        parsed.push({ fileName: file.name, report, error: null, weekStart: report.weekStart ?? (files.length === 1 ? lastFullWeekStart() : null) })
      } catch (error) {
        parsed.push({ fileName: file.name, report: null, error: error instanceof Error ? error.message : String(error), weekStart: null })
      }
    }
    setUploads(parsed)
    const single = parsed.length === 1 ? parsed[0].report : null
    setMatches(single ? autoMatches(items, single.rows) : [])
    setBusy(false)
  }

  const setWeekStart = (index: number, value: string) => setUploads(uploads.map((upload, i) => (i === index ? { ...upload, weekStart: sundayOf(value) } : upload)))

  const saveSingle = async () => {
    const upload = uploads[0]
    if (!upload?.report || !upload.weekStart) return
    setBusy(true)
    try {
      const result = applyReport(items, upload.report.rows, matches, { weekStart: upload.weekStart, fileName: upload.fileName, today: todayIso() })
      await saveItems(result.changed)
      await saveSalesWeek(result.week)
      const incomplete = result.week.completeDays!.flatMap((complete, day) => (complete ? [] : [DAY_SHORT[day]]))
      setMessage(`Saved week of ${prettyDate(upload.weekStart)}: ${result.week.rows.length} items${result.newCount ? `, ${result.newCount} new` : ''}${result.updatedCount ? `, ${result.updatedCount} updated` : ''}.${incomplete.length ? ` ${incomplete.join(', ')} not used yet (week not finished).` : ''}`)
      setUploads([])
    } finally {
      setBusy(false)
    }
  }

  // Preview of what a multi-file save will do (new items are matched across files).
  const batch = useMemo(() => {
    if (uploads.length < 2) return null
    const ready = uploads.filter(upload => upload.report && upload.report.rows.length > 0 && upload.weekStart)
    return applyReports(items, ready.map(u => ({ rows: u.report!.rows, weekStart: u.weekStart!, fileName: u.fileName })), todayIso())
  }, [uploads, items])

  const saveBatch = async () => {
    if (!batch) return
    setBusy(true)
    try {
      await saveItems(batch.changed)
      for (const week of batch.weeks) await saveSalesWeek(week)
      setMessage(`Saved ${batch.weeks.length} weeks${batch.newCount ? `, ${batch.newCount} new items` : ''}${batch.updatedCount ? `, ${batch.updatedCount} items updated` : ''}.`)
      setUploads([])
    } finally {
      setBusy(false)
    }
  }

  const oldest = weeks[weeks.length - 1]?.weekStart

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h1 className="text-lg font-bold">Upload sales reports</h1>
        <p className="text-sm text-slate-500">
          The BDMS "Item Sales by Vendor 7 Days" report, PDF or Excel — one file per week. You can select many weeks at once;
          each week is read from the report's dates.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-slate-600 hover:bg-slate-50">
          <FileUp className="h-5 w-5" /> {busy ? 'Reading…' : 'Choose files (.pdf, .xlsx, .xls, .csv)'}
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={event => { const files = [...(event.target.files ?? [])]; if (files.length) void onFiles(files); event.target.value = '' }}
          />
        </label>
        {message && <p className="rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
      </Card>

      <PhotoImport
        items={items}
        onSales={(report, label) => {
          // Shown in the same preview as an uploaded file: check the week and rows, then Save week.
          setMessage('')
          setUploads([{ fileName: `Photos (${label})`, report, error: null, weekStart: report.weekStart ?? lastFullWeekStart() }])
          setMatches(autoMatches(items, report.rows))
        }}
      />

      {uploads.length === 1 && (
        <SinglePreview
          upload={uploads[0]}
          matches={matches}
          setMatches={setMatches}
          onWeek={value => setWeekStart(0, value)}
          onSave={() => void saveSingle()}
          busy={busy}
          replacing={weeks.some(w => w.weekStart === uploads[0].weekStart)}
        />
      )}

      {uploads.length > 1 && batch && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold">{uploads.length} files</h2>
            <p className="text-sm text-slate-500">{batch.weeks.length} weeks ready · {batch.newCount} new items · {batch.updatedCount} items updated</p>
            <Button className="ml-auto" disabled={busy || batch.weeks.length === 0} onClick={() => void saveBatch()}>Save {batch.weeks.length} week{batch.weeks.length === 1 ? '' : 's'}</Button>
          </div>
          <ul className="divide-y text-sm">
            {uploads.map((upload, i) => {
              const duplicate = upload.weekStart && uploads.some((other, j) => j !== i && other.weekStart === upload.weekStart)
              const mismatches = upload.report?.rows.filter(row => row.mismatch).length ?? 0
              const partial = upload.weekStart ? completeDaysFor(upload.weekStart, todayIso()).filter(complete => !complete).length : 0
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="w-48 truncate font-medium" title={upload.fileName}>{upload.fileName}</span>
                  {upload.error || !upload.report ? <span className="text-red-600">Couldn't read: {upload.error}</span> : (
                    <>
                      <input type="date" className={cn('h-9 rounded-lg border px-1', !upload.weekStart && 'border-red-500')} value={upload.weekStart ?? ''} onChange={e => e.target.value && setWeekStart(i, e.target.value)} />
                      <span className="text-slate-500">{upload.report.rows.length} items</span>
                      {upload.weekStart && <HolidayTags weekStart={upload.weekStart} />}
                      {!upload.weekStart && <span className="text-red-600">No dates found — pick the week</span>}
                      {upload.report.warnings.map(w => <span key={w} className="text-red-600">{w}</span>)}
                      {mismatches > 0 && <span className="text-amber-700">{mismatches} rows don't add up</span>}
                      {duplicate && <span className="text-amber-700">Same week as another file — only one is kept</span>}
                      {upload.weekStart && weeks.some(w => w.weekStart === upload.weekStart) && <span className="text-slate-500">replaces saved week</span>}
                      {partial === 7 && <span className="text-red-600">Week hasn't started</span>}
                      {partial > 0 && partial < 7 && <span className="text-amber-700">Week not over — {partial} day{partial === 1 ? '' : 's'} not used</span>}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-slate-400">With several files, report lines are matched to items automatically (by UPC, vendor code, then name). Upload one file at a time to link lines by hand.</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-bold">Uploaded weeks ({weeks.length})</h2>
        <p className="mb-2 text-xs text-slate-500">
          Normal days use the same weekday from the nearest {FORECAST_SAMPLES} weeks (recent weeks count more; holidays and sold-out days are left out).
          Holiday boosts are learned from past holiday weeks — upload each one with a few normal weeks around it.
          {oldest && ` History goes back to ${prettyDate(oldest)}, ${oldest.slice(0, 4)}.`}
        </p>
        {weeks.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {weeks.map(week => (
              <li key={week.weekStart} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-semibold">Week of {prettyDate(week.weekStart)}, {week.weekStart.slice(0, 4)}</span>
                <HolidayTags weekStart={week.weekStart} />
                <span className="text-slate-500">{week.rows.length} items · {week.fileName}{week.completeDays?.includes(false) ? ` · partial (${week.completeDays.flatMap((c, d) => (c ? [] : [DAY_SHORT[d]])).join(', ')} not used)` : ''}</span>
                <button className="ml-auto text-slate-400 hover:text-red-600" aria-label="Delete week" onClick={() => { if (confirm(`Delete the week of ${prettyDate(week.weekStart)}?`)) void deleteSalesWeek(week.weekStart) }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function SinglePreview({ upload, matches, setMatches, onWeek, onSave, busy, replacing }: {
  upload: Upload
  matches: Match[]
  setMatches: (matches: Match[]) => void
  onWeek: (value: string) => void
  onSave: () => void
  busy: boolean
  replacing: boolean
}) {
  const { items } = useItems()
  if (upload.error || !upload.report) return <Card><p className="text-sm text-red-600">Couldn't read {upload.fileName}: {upload.error}</p></Card>
  const report = upload.report
  const weekStart = upload.weekStart ?? lastFullWeekStart()
  const completeDays = completeDaysFor(weekStart, todayIso())
  const incompleteDays = completeDays.flatMap((complete, day) => (complete ? [] : [day]))
  const mismatches = report.rows.filter(row => row.mismatch).length
  const newCount = matches.filter(match => match === 'new').length

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block font-semibold">Week starting (Sunday)</span>
          <input type="date" value={weekStart} onChange={event => event.target.value && onWeek(event.target.value)} className="mt-1 h-10 rounded-xl border px-2" />
        </label>
        <p className="text-sm text-slate-500">{upload.fileName} · {report.rows.length} rows · {newCount} new items</p>
        <HolidayTags weekStart={weekStart} suffix=" week" />
        <Button className="ml-auto" disabled={busy || report.rows.length === 0} onClick={onSave}>Save week</Button>
      </div>
      {replacing && <p className="text-sm text-amber-700">A report for this week is already saved — saving will replace it.</p>}
      {incompleteDays.length === 7 && <p className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />This week hasn't started yet — check the week date.</p>}
      {incompleteDays.length > 0 && incompleteDays.length < 7 && (
        <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />This week isn't over yet: {incompleteDays.map(day => DAY_SHORT[day]).join(', ')} won't be used for forecasts. Upload last full week (Sun–Sat) for the best numbers.</p>
      )}
      {report.warnings.map(warning => <p key={warning} className="text-sm text-red-600">{warning}</p>)}
      {mismatches > 0 && <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />{mismatches} row{mismatches === 1 ? '' : 's'} where the days don't add up to the total (highlighted) — check them against the report.</p>}
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
  )
}
