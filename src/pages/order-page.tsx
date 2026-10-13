import { AlertTriangle, ChevronLeft, ChevronRight, Printer, RotateCcw, ScanBarcode } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/button'
import { saveItem, saveOrder } from '../data/api'
import { DayNotes } from '../components/day-notes'
import { useOrders, usePlanner } from '../data/hooks'
import { addDaysIso, prettyDate, todayIso } from '../lib/dates'
import { SIZE_LABEL } from '../lib/item-filters'
import { buildOrders, type DeliveryOrder, type OrderRow } from '../lib/order-build'
import type { Planner } from '../lib/planner'
import { cn } from '../lib/utils'
import { SIZES } from '../types'

export function OrderPage() {
  const { planner, items, weeks, counts, loading } = usePlanner()
  const { orders } = useOrders()
  const [chosenDate, setOrderDate] = useState<string | null>(null)
  // Until the user picks a date, follow the schedule (it can change once schedule edits load).
  const orderDate = chosenDate ?? planner.schedule.nextOrderDay(todayIso())

  const count = counts.find(c => c.date === orderDate)
  const deliveries = useMemo(() => buildOrders(items, orderDate, count, planner, orders), [items, orderDate, count, planner, orders])
  const uncounted = items.filter(item => item.active && !count?.entries[item.id]).length

  const setFinal = (delivery: DeliveryOrder, row: OrderRow, value: number | null) => {
    // Only hand-edited lines are stored; everything else follows the live suggestion. `null` resets a line.
    const existing = orders.find(order => order.orderDate === orderDate && order.deliveryDate === delivery.deliveryDate)?.lines ?? {}
    const lines = { ...existing }
    if (value === null) delete lines[row.item.id]
    else lines[row.item.id] = { suggested: row.suggestion.suggested, final: value }
    void saveOrder(orderDate, delivery.deliveryDate, lines)
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label="Previous order day" onClick={() => setOrderDate(planner.schedule.previousOrderDay(orderDate))}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="text-center">
          <p className="text-xs uppercase text-slate-500">Order placed</p>
          <p className="text-lg font-bold">{prettyDate(orderDate)}</p>
        </div>
        <Button variant="secondary" aria-label="Next order day" onClick={() => setOrderDate(planner.schedule.nextOrderDay(addDaysIso(orderDate, 1)))}><ChevronRight className="h-5 w-5" /></Button>
        <div className="ml-auto flex gap-2">
          <Link to={`/scan/${orderDate}`}><Button variant="secondary"><ScanBarcode className="h-4 w-4" /> Scan on phone</Button></Link>
          <Link to={`/print/${orderDate}`}><Button><Printer className="h-4 w-4" /> Print</Button></Link>
        </div>
      </div>
      <p className="text-sm text-slate-500">Delivery days changed for a holiday? Set them on the <Link className="font-semibold text-brand-600" to="/calendar">Calendar</Link> page.</p>

      {weeks.length === 0 && <Warning>No sales reports uploaded yet, so every forecast is 0. <Link className="font-semibold underline" to="/sales">Upload one</Link>.</Warning>}
      {!count && <Warning>No count for {prettyDate(orderDate)} yet. Suggestions assume 0 on hand until the count is done on the phone.</Warning>}
      {count && uncounted > 0 && <Warning>{uncounted} item{uncounted === 1 ? '' : 's'} not counted — treated as 0 on hand (marked below).</Warning>}

      {deliveries.length === 0 && <Warning>No deliveries are ordered on {prettyDate(orderDate)}.</Warning>}
      {deliveries.map(delivery => <DeliveryTable key={delivery.deliveryDate} delivery={delivery} planner={planner} onSetFinal={(row, value) => setFinal(delivery, row, value)} />)}
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></p>
}

function DeliveryTable({ delivery, planner, onSetFinal }: { delivery: DeliveryOrder; planner: Planner; onSetFinal: (row: OrderRow, value: number | null) => void }) {
  const total = delivery.rows.reduce((sum, row) => sum + row.final, 0)
  return (
    <Card className="space-y-3 overflow-hidden p-0">
      <div className="space-y-2 border-b bg-slate-50 px-4 py-3">
        <h2 className="text-lg font-bold">
          Delivery {prettyDate(delivery.deliveryDate)}
          {delivery.changed && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">changed schedule</span>}
        </h2>
        <p className="text-sm text-slate-500">
          Lasts until the next delivery · {total} units total
          {delivery.projected && <span className="ml-1 font-medium text-amber-700">· stock is projected from the earlier delivery (no count in between)</span>}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {delivery.coversDates.map(date => (
            <li key={date} className="flex flex-wrap items-center gap-1">
              <span className="font-medium">{prettyDate(date)}</span>
              <DayNotes marks={planner.calendar.marks(date)} />
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-2 py-2 text-right">{delivery.projected ? 'Proj. stock' : 'Counted'}</th>
              <th className="px-2 py-2 text-right">Forecast</th>
              <th className="px-2 py-2 text-right" title="Units to keep in the cooler when the next truck arrives — saved to the item">Safety</th>
              <th className="px-2 py-2 text-right">Suggested</th>
              <th className="px-4 py-2 text-right">Order</th>
            </tr>
          </thead>
          {SIZES.map(size => {
            const rows = delivery.rows.filter(row => row.item.size === size)
            if (rows.length === 0) return null
            return (
              <tbody key={size}>
                <tr><td colSpan={6} className="bg-slate-100 px-4 py-1 text-xs font-bold uppercase text-slate-600">{SIZE_LABEL[size]}</td></tr>
                {rows.map(row => (
                  <tr key={row.item.id} className="border-t">
                    <td className="px-4 py-2">
                      <p className="font-medium">{row.item.name}</p>
                      <p className="text-xs text-slate-400">{row.item.brand} · steps of {row.item.orderStep}</p>
                    </td>
                    <td className={cn('px-2 py-2 text-right tabular-nums', row.counted === null && !delivery.projected && 'text-amber-700')}>
                      {delivery.projected ? Math.round(row.suggestion.stockAtDelivery) : row.counted ?? 'not counted'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{Math.round(row.suggestion.forecast)}</td>
                    <td className="px-2 py-2 text-right">
                      <QuantityInput className="w-14 text-sm font-medium" value={row.suggestion.safetyStock} onChange={safetyStock => void saveItem({ ...row.item, safetyStock })} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{row.suggestion.suggested}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {row.edited && <button title="Reset to suggested" className="text-slate-400 hover:text-slate-700" onClick={() => onSetFinal(row, null)}><RotateCcw className="h-4 w-4" /></button>}
                        <QuantityInput
                          value={row.final}
                          onChange={value => onSetFinal(row, value)}
                          title={row.item.orderStep > 1 && row.final % row.item.orderStep !== 0 ? `Not a multiple of ${row.item.orderStep}` : undefined}
                          className={cn('w-20 text-base font-bold', row.edited && 'border-brand-500 bg-brand-50', row.item.orderStep > 1 && row.final % row.item.orderStep !== 0 && 'border-amber-500')}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )
          })}
        </table>
      </div>
    </Card>
  )
}

/** Number box that commits on blur/Enter so typing "18" doesn't save "1" first. */
function QuantityInput({ value, onChange, className, title }: { value: number; onChange: (value: number) => void; className?: string; title?: string }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const number = Number(text)
    if (text !== '' && Number.isFinite(number) && number !== value) onChange(Math.max(0, Math.round(number)))
    setText(null)
  }
  return (
    <input
      inputMode="numeric"
      className={cn('h-10 rounded-lg border text-center tabular-nums', className)}
      title={title}
      value={text ?? String(value)}
      onFocus={event => { setText(String(value)); event.target.select() }}
      onChange={event => setText(event.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    />
  )
}
