import { Camera, ImagePlus, Loader2, ScanText, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { saveItems } from '../data/api'
import { prepareImage } from '../lib/image'
import { newItem } from '../lib/items'
import { catalogueFromPhotos, salesFromPhotos, type PhotoReading } from '../lib/photo-report'
import type { ParsedSalesReport } from '../lib/sales-parse'
import { cn } from '../lib/utils'
import type { Item } from '../types'
import { Button, Card } from './button'
import { CameraCapture } from './camera-capture'

interface Photo {
  id: number
  previewUrl: string
  data: string
  mediaType: 'image/jpeg'
  status: 'ready' | 'reading' | 'done' | 'error'
  reading?: PhotoReading
  error?: string
}

const PIN_KEY = 'milk-order:photo-pin'
const readPin = () => { try { return localStorage.getItem(PIN_KEY) ?? '' } catch { return '' } }
const TYPE_LABEL: Record<PhotoReading['report_type'], string> = { sales_7_days: '7-day sales', order_sheet: 'Order sheet', other: 'Not a report' }

async function readPhoto(photo: Photo, pin: string): Promise<PhotoReading> {
  const response = await fetch('/api/read-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(pin ? { 'x-photo-pin': pin } : {}) },
    body: JSON.stringify({ image: photo.data, mediaType: photo.mediaType }),
  })
  const body = await response.json().catch(() => ({ error: `Server error ${response.status}` }))
  if (!response.ok) throw Object.assign(new Error(body.error ?? `Server error ${response.status}`), { status: response.status })
  return body as PhotoReading
}

let nextId = 1

/**
 * Stand-in for file uploads while the app can't be opened on the store computer: photograph the
 * BDMS screen (7-day sales report and/or Order Sheet) and Claude reads the rows off the photos.
 */
export function PhotoImport({ items, onSales }: { items: Item[]; onSales: (report: ParsedSalesReport, label: string) => void }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState(readPin)
  const [needPin, setNeedPin] = useState(false)
  const [readings, setReadings] = useState<PhotoReading[]>([])
  // UPC → ticked. Rows not in here use the default (new and not yogurt/discontinued).
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  // Recomputed against the live item list, so items created meanwhile (e.g. by saving the sales
  // week from the same photos) show as "on list" instead of being added twice.
  const catalogue = useMemo(() => catalogueFromPhotos(readings, items).map(row => ({ ...row, selected: !row.existingId && (ticked[row.upc] ?? !row.suggestSkip) })), [readings, items, ticked])
  const [message, setMessage] = useState('')

  const addBlob = async (blob: Blob) => {
    const prepared = await prepareImage(blob)
    setPhotos(current => [...current, { id: nextId++, ...prepared, status: 'ready' }])
  }
  const update = (id: number, patch: Partial<Photo>) => setPhotos(current => current.map(photo => (photo.id === id ? { ...photo, ...patch } : photo)))

  const readAll = async () => {
    setBusy(true); setMessage(''); setNeedPin(false)
    try { localStorage.setItem(PIN_KEY, pin) } catch { /* not remembered */ }
    const results: PhotoReading[] = photos.filter(p => p.status === 'done' && p.reading).map(p => p.reading!)
    const queue = photos.filter(p => p.status !== 'done')
    // Three at a time: each photo is its own request (a full-screen table takes a while to read).
    const worker = async () => {
      for (let photo = queue.shift(); photo; photo = queue.shift()) {
        update(photo.id, { status: 'reading', error: undefined })
        try {
          const reading = await readPhoto(photo, pin)
          results.push(reading)
          update(photo.id, { status: 'done', reading })
        } catch (error) {
          if ((error as { status?: number }).status === 401) setNeedPin(true)
          update(photo.id, { status: 'error', error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setBusy(false)

    const sales = salesFromPhotos(results)
    if (sales) {
      onSales(sales, `${results.filter(r => r.report_type === 'sales_7_days').length} photo(s)`)
      setMessage(`Read ${sales.rows.length} sales rows — they're below. Check them against the screen (rows that don't add up are highlighted), then tap Save week.`)
    }
    setReadings(results)
    setTicked({})
    if (!sales && catalogueFromPhotos(results, items).length === 0 && results.length > 0) setMessage('No report rows were found in these photos.')
  }

  const addItems = async () => {
    let walk = items.reduce((max, item) => Math.max(max, item.walkOrder), -1) + 1
    const created = catalogue.filter(row => row.selected && !row.existingId).map(row => newItem({ name: row.name, upc: row.upc }, walk++))
    await saveItems(created)
    setMessage(`Added ${created.length} item${created.length === 1 ? '' : 's'}. Set their crate size and walk order on the Items page.`)
    setReadings(current => current.filter(reading => reading.report_type !== 'order_sheet'))
  }

  const pending = photos.filter(p => p.status !== 'done').length

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Read from photos</h2>
        <p className="text-sm text-slate-500">
          Can't upload the file from the store computer? Photograph the BDMS screen — the 7-day sales report and/or the Order Sheet.
          Fill the screen with the table and take one photo per screenful. Photos aren't saved to your phone.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCamera(true)}><Camera className="h-4 w-4" /> Take photos</Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <ImagePlus className="h-4 w-4" /> Choose pictures
          <input type="file" accept="image/*" multiple className="hidden" onChange={event => { [...(event.target.files ?? [])].forEach(file => void addBlob(file)); event.target.value = '' }} />
        </label>
      </div>

      {photos.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map(photo => (
              <li key={photo.id} className="relative overflow-hidden rounded-lg border">
                <img src={photo.previewUrl} alt="" className="aspect-[3/4] w-full object-cover" />
                <div className={cn('absolute inset-x-0 bottom-0 px-1 py-0.5 text-[11px] text-white', photo.status === 'error' ? 'bg-red-600' : photo.status === 'done' ? 'bg-green-700' : 'bg-black/60')}>
                  {photo.status === 'reading' && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Reading…</span>}
                  {photo.status === 'ready' && 'Ready'}
                  {photo.status === 'done' && photo.reading && `${TYPE_LABEL[photo.reading.report_type]} · ${photo.reading.rows.length} rows`}
                  {photo.status === 'error' && <span title={photo.error}>{photo.error}</span>}
                </div>
                {photo.status !== 'reading' && (
                  <button aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" onClick={() => setPhotos(current => current.filter(p => p.id !== photo.id))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {needPin && (
            <label className="block text-sm">
              <span className="font-semibold text-red-700">Enter the store PIN to read photos</span>
              <input className="mt-1 h-10 w-40 rounded-lg border px-2" inputMode="numeric" value={pin} onChange={event => setPin(event.target.value)} />
            </label>
          )}
          <div className="flex items-center gap-3">
            <Button disabled={busy || pending === 0} onClick={() => void readAll()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
              {busy ? 'Reading photos…' : `Read ${pending} photo${pending === 1 ? '' : 's'}`}
            </Button>
            <span className="text-xs text-slate-500">Takes up to a minute per photo. Check the numbers below before saving.</span>
          </div>
        </>
      )}
      {message && <p className="rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}

      {catalogue.length > 0 && (
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Items on the order sheet</p>
            <Button className="ml-auto" disabled={!catalogue.some(row => row.selected && !row.existingId)} onClick={() => void addItems()}>
              Add {catalogue.filter(row => row.selected && !row.existingId).length} new items
            </Button>
          </div>
          <p className="text-xs text-slate-500">Yogurt, milkshakes and discontinued (DISC) lines are unticked. Items you already have are greyed out.</p>
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {catalogue.map(row => (
              <li key={row.upc} className={cn('flex items-center gap-2 py-1.5', row.existingId && 'text-slate-400')}>
                <input
                  type="checkbox"
                  disabled={!!row.existingId}
                  checked={row.selected && !row.existingId}
                  onChange={event => setTicked({ ...ticked, [row.upc]: event.target.checked })}
                />
                <span className="flex-1">{row.name}</span>
                <span className="font-mono text-xs text-slate-400">{row.upc}</span>
                {row.existingId && <span className="text-xs">on list</span>}
                {row.discontinued && <span className="text-xs text-red-600">DISC</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {camera && <CameraCapture count={photos.length} onPhoto={blob => void addBlob(blob)} onClose={() => setCamera(false)} />}
    </Card>
  )
}
