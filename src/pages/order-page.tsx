import { AlertTriangle, ChevronLeft, ChevronRight, Printer, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/button'
import { saveOrder } from '../data/api'
import { useCounts, useItems, useOrders, useSalesWeeks } from '../data/hooks'
import { addDaysIso, DAY_SHORT, prettyDate, todayIso } from '../lib/dates'
import { SIZE_LABEL } from '../lib/item-filters'
import { buildOrders, type DeliveryOrder, type OrderRow } from '../lib/order-build'
import { isOrderDay, nextOrderDay } from '../lib/order-math'
import { cn } from '../lib/utils'
import { SIZES } from '../types'

function previousOrderDay(iso: string) {
  let date = addDaysIso(iso, -1)
  while (!isOrderDay(date)) date = addDaysIso(date, -1)
  return date
}

export function OrderPage() {
  const { items, loading } = useItems()
  const { weeks } = useSalesWeeks()
  const { counts } = useCounts()
  const { orders } = useOrders()
  const [orderDate, setOrderDate] = useState(() => nextOrderDay(todayIso()))

  const count = counts.find(c => c.date === orderDate)
  const deliveries = useMemo(() => buildOrders(items, orderDate, count, weeks, orders), [items, orderDate, count, weeks, orders])
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
        <Button variant="secondary" aria-label="Previous order day" onClick={() => setOrderDate(previousOrderDay(orderDate))}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="text-center">
          <p className="text-xs uppercase text-slate-500">Order placed</p>
          <p className="text-lg font-bold">{prettyDate(orderDate)}</p>
        </div>
        <Button variant="secondary" aria-label="Next order day" onClick={() => setOrderDate(nextOrderDay(addDaysIso(orderDate, 1)))}><ChevronRight className="h-5 w-5" /></Button>
        <Link to={`/print/${orderDate}`} className="ml-auto"><Button><Printer className="h-4 w-4" /> Print order</Button></Link>
      </div>

      {weeks.length === 0 && <Warning>No sales reports uploaded yet, so every forecast is 0. <Link className="font-semibold underline" to="/sales">Upload one</Link>.</Warning>}
      {!count && <Warning>No count for {prettyDate(orderDate)} yet. Suggestions assume 0 on hand until the count is done on the phone.</Warning>}
      {count && uncounted > 0 && <Warning>{uncounted} item{uncounted === 1 ? '' : 's'} not counted — treated as 0 on hand (marked below).</Warning>}

      {deliveries.map(delivery => <DeliveryTable key={delivery.deliveryDate} delivery={delivery} onSetFinal={(row, value) => setFinal(delivery, row, value)} />)}
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></p>
}

function DeliveryTable({ delivery, onSetFinal }: { delivery: DeliveryOrder; onSetFinal: (row: OrderRow, value: number | null) => void }) {
  const total = delivery.rows.reduce((sum, row) => sum + row.final, 0)
  return (
    <Card className="space-y-3 overflow-hidden p-0">
      <div className="border-b bg-slate-50 px-4 py-3">
        <h2 className="text-lg font-bold">Delivery {prettyDate(delivery.deliveryDate)}</h2>
        <p className="text-sm text-slate-500">
          Covers {delivery.coversDays.map(day => DAY_SHORT[day]).join(' + ')} · {total} units total
          {delivery.projected && <span className="ml-1 font-medium text-amber-700">· stock is projected from the Saturday order (no count before Monday)</span>}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-2 py-2 text-right">{delivery.projected ? 'Proj. stock' : 'Counted'}</th>
              <th className="px-2 py-2 text-right">Forecast</th>
              <th className="px-2 py-2 text-right">Suggested</th>
              <th className="px-4 py-2 text-right">Order</th>
            </tr>
          </thead>
          {SIZES.map(size => {
            const rows = delivery.rows.filter(row => row.item.size === size)
            if (rows.length === 0) return null
            return (
              <tbody key={size}>
                <tr><td colSpan={5} className="bg-slate-100 px-4 py-1 text-xs font-bold uppercase text-slate-600">{SIZE_LABEL[size]}</td></tr>
                {rows.map(row => (
                  <tr key={row.item.id} className="border-t">
                    <td className="px-4 py-2">
                      <p className="font-medium">{row.item.name}</p>
                      <p className="text-xs text-slate-400">{row.item.brand} · steps of {row.item.orderStep}</p>
                    </td>
                    <td className={cn('px-2 py-2 text-right tabular-nums', row.counted === null && !delivery.projected && 'text-amber-700')}>
                      {delivery.projected ? Math.round(row.suggestion.stockAtDelivery) : row.counted ?? 'not counted'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{Math.round(row.suggestion.forecast)}<span className="text-slate-400"> +{row.suggestion.buffer}</span></td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{row.suggestion.suggested}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {row.edited && <button title="Reset to suggested" className="text-slate-400 hover:text-slate-700" onClick={() => onSetFinal(row, null)}><RotateCcw className="h-4 w-4" /></button>}
                        <OrderInput value={row.final} step={row.item.orderStep} edited={row.edited} onChange={value => onSetFinal(row, value)} />
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

function OrderInput({ value, step, edited, onChange }: { value: number; step: number; edited: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const number = Number(text)
    if (text !== '' && Number.isFinite(number) && number !== value) onChange(Math.max(0, Math.round(number)))
    setText(null)
  }
  const offStep = step > 1 && value % step !== 0
  return (
    <input
      inputMode="numeric"
      className={cn('h-10 w-20 rounded-lg border text-center text-base font-bold tabular-nums', edited && 'border-brand-500 bg-brand-50', offStep && 'border-amber-500')}
      title={offStep ? `Not a multiple of ${step}` : undefined}
      value={text ?? String(value)}
      onFocus={event => { setText(String(value)); event.target.select() }}
      onChange={event => setText(event.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    />
  )
}
