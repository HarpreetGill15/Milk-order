import { ArrowLeft, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Barcode } from '../components/barcode'
import { Button } from '../components/button'
import { useCounts, useItems, useOrders, useSalesWeeks } from '../data/hooks'
import { DAY_SHORT, prettyDate } from '../lib/dates'
import { SIZE_LABEL } from '../lib/item-filters'
import { buildOrders } from '../lib/order-build'
import { SIZES } from '../types'

export function PrintPage() {
  const { orderDate = '' } = useParams()
  const { items, loading } = useItems()
  const { weeks } = useSalesWeeks()
  const { counts } = useCounts()
  const { orders } = useOrders()
  const [showZero, setShowZero] = useState(false)
  const count = counts.find(c => c.date === orderDate)
  const deliveries = useMemo(() => buildOrders(items, orderDate, count, weeks, orders), [items, orderDate, count, weeks, orders])

  if (loading) return <p className="p-6 text-slate-500">Loading…</p>

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black">
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link to="/order"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showZero} onChange={event => setShowZero(event.target.checked)} /> Show items with 0</label>
        <Button className="ml-auto" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
      </div>
      {deliveries.length === 0 && <p>{prettyDate(orderDate)} isn't an order day.</p>}
      {deliveries.map((delivery, index) => {
        const rows = delivery.rows.filter(row => showZero || row.final > 0)
        return (
          <section key={delivery.deliveryDate} className={index > 0 ? 'print-break pt-6' : ''}>
            <header className="mb-3 border-b-2 border-black pb-2">
              <h1 className="text-2xl font-bold">Milk order — delivery {prettyDate(delivery.deliveryDate)}</h1>
              <p className="text-sm">Ordered {prettyDate(orderDate)} · covers {delivery.coversDays.map(day => DAY_SHORT[day]).join(' + ')} · {rows.length} items · {rows.reduce((sum, row) => sum + row.final, 0)} units</p>
            </header>
            {SIZES.map(size => {
              const group = rows.filter(row => row.item.size === size)
              if (group.length === 0) return null
              return (
                <div key={size} className="mb-4">
                  <h2 className="mb-1 bg-black px-2 py-0.5 text-sm font-bold uppercase text-white">{SIZE_LABEL[size]}</h2>
                  {group.map(row => (
                    <div key={row.item.id} className="avoid-break flex items-center gap-4 border-b border-slate-300 py-2">
                      <div className="w-56 shrink-0">
                        {row.item.code ? <Barcode value={row.item.code} /> : <span className="text-sm font-semibold text-red-600">No UPC / vendor code — add on Items page</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">{row.item.name}</p>
                        <p className="text-xs text-slate-600">{row.item.brand}</p>
                      </div>
                      <p className="w-20 text-right text-3xl font-bold tabular-nums">{row.final}</p>
                    </div>
                  ))}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
