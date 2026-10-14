import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Barcode } from '../components/barcode'
import { Button } from '../components/button'
import { markOrdered } from '../data/api'
import { PromoBadge } from '../components/order-badges'
import { usePlanner } from '../data/hooks'
import { prettyDate } from '../lib/dates'
import { SIZE_LABEL } from '../lib/item-filters'
import { buildOrders } from '../lib/order-build'
import { cn } from '../lib/utils'
import { SIZES } from '../types'

type CodeField = 'code' | 'vendorCode'
const BARCODE_KEY = 'milk-order:barcode'
const QTY_BARCODE_KEY = 'milk-order:qty-barcode'
const load = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const store = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* not remembered */ } }

/** Keeps the phone screen on while scanning (where the browser supports it). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const request = () => {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      wakeLock?.request('screen').then(l => { lock = l }).catch(() => undefined)
    }
    request()
    const onVisible = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => undefined) }
  }, [])
}

/**
 * Phone scan mode: one order line at a time with a full-width barcode and a big quantity, so the
 * RF gun can scan items straight off the phone into the ordering system.
 */
export function ScanPage() {
  const { orderDate = '' } = useParams()
  const { planner, items, counts, orders, loading } = usePlanner()
  const deliveries = useMemo(() => buildOrders(items, orderDate, counts, planner, orders), [items, orderDate, counts, planner, orders])
  const [deliveryIndex, setDeliveryIndex] = useState(0)
  const [index, setIndex] = useState(0)
  const [codeField, setCodeField] = useState<CodeField>(() => (load(BARCODE_KEY) === 'vendorCode' ? 'vendorCode' : 'code'))
  const [qtyBarcode, setQtyBarcode] = useState(() => load(QTY_BARCODE_KEY) === '1')
  useWakeLock()

  const delivery = deliveries[Math.min(deliveryIndex, Math.max(0, deliveries.length - 1))]
  // Same order as the printed sheet: by size group, then walk order; only lines being ordered.
  const lines = useMemo(
    () => (delivery?.rows ?? []).filter(row => row.final > 0).sort((a, b) => SIZES.indexOf(a.item.size) - SIZES.indexOf(b.item.size) || a.item.walkOrder - b.item.walkOrder),
    [delivery],
  )
  const done = index >= lines.length
  const line = lines[Math.min(index, lines.length - 1)]
  const code = line ? ((codeField === 'code' ? line.item.code || line.item.vendorCode : line.item.vendorCode || line.item.code) ?? '') : ''

  if (loading) return <p className="p-6 text-slate-500">Loading…</p>

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Link to="/order" aria-label="Exit scan mode" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Order {prettyDate(orderDate)}{delivery ? ` → delivery ${prettyDate(delivery.deliveryDate)}` : ''}</p>
            <p className="text-xs text-slate-500">{done ? lines.length : index + 1} of {lines.length}</p>
          </div>
          <select className="h-9 rounded-lg border px-1 text-sm" value={codeField} onChange={event => { const value = event.target.value as CodeField; setCodeField(value); store(BARCODE_KEY, value) }}>
            <option value="code">UPC</option>
            <option value="vendorCode">Vendor code</option>
          </select>
        </div>
        {deliveries.length > 1 && (
          <div className="flex gap-2">
            {deliveries.map((d, i) => (
              <button key={d.deliveryDate} className={cn('flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold', i === deliveryIndex ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => { setDeliveryIndex(i); setIndex(0) }}>
                {prettyDate(d.deliveryDate)}
              </button>
            ))}
          </div>
        )}
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${lines.length ? (Math.min(index, lines.length) / lines.length) * 100 : 0}%` }} />
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-4 p-4">
        {deliveries.length === 0 && <p className="text-center text-slate-500">Nothing is ordered on {prettyDate(orderDate)}.</p>}
        {deliveries.length > 0 && lines.length === 0 && <p className="text-center text-slate-500">Every line on this order is 0.</p>}
        {lines.length > 0 && done && (
          <div className="space-y-3 text-center">
            <Check className="mx-auto h-16 w-16 text-green-600" />
            <p className="text-2xl font-bold">All {lines.length} lines done</p>
            {delivery?.placed
              ? <p className="text-sm text-green-700">Marked as ordered.</p>
              : (
                <Button onClick={() => void markOrdered(deliveries.map(d => ({
                  orderDate,
                  deliveryDate: d.deliveryDate,
                  lines: orders.find(o => o.orderDate === orderDate && o.deliveryDate === d.deliveryDate)?.lines ?? {},
                  quantities: Object.fromEntries(d.rows.map(row => [row.item.id, row.final])),
                })))}>
                  Mark as ordered
                </Button>
              )}
            <div><Button variant="secondary" onClick={() => setIndex(0)}>Start again</Button></div>
          </div>
        )}
        {line && !done && (
          <>
            <div className="text-center">
              <p className="text-xl font-bold leading-tight">{line.item.name}</p>
              <p className="text-sm text-slate-500">{line.item.brand} · {SIZE_LABEL[line.item.size]}</p>
              {line.promo && <span className="mt-1 inline-block"><PromoBadge promo={line.promo} /></span>}
            </div>
            {code ? <Barcode key={code} value={code} height={140} fill /> : <p className="rounded-xl bg-red-50 p-4 text-center font-semibold text-red-700">No UPC or vendor code — add it on the Items page</p>}
            <div className="text-center">
              <p className="text-sm font-semibold uppercase text-slate-500">Quantity</p>
              <p className="text-8xl font-black leading-none tabular-nums">{line.final}</p>
            </div>
            {qtyBarcode && <Barcode key={`qty-${line.final}`} value={String(line.final)} height={90} fill />}
          </>
        )}
      </main>

      <footer className="space-y-2 border-t p-3">
        <label className="flex items-center justify-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={qtyBarcode} onChange={event => { setQtyBarcode(event.target.checked); store(QTY_BARCODE_KEY, event.target.checked ? '1' : '0') }} />
          Also show quantity as a barcode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-16 text-lg" disabled={index === 0} onClick={() => setIndex(Math.max(0, index - 1))}><ArrowLeft className="h-6 w-6" /> Back</Button>
          <Button className="h-16 text-lg" disabled={done || lines.length === 0} onClick={() => setIndex(index + 1)}>Next <ArrowRight className="h-6 w-6" /></Button>
        </div>
      </footer>
    </div>
  )
}
