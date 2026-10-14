import { Megaphone, TrendingDown, TrendingUp } from 'lucide-react'
import { prettyDate } from '../lib/dates'
import type { OrderRow } from '../lib/order-build'
import type { LiftSource } from '../lib/promos'

const LIFT_SOURCE: Record<LiftSource, string> = {
  set: 'lift set by you',
  item: "learned from this item's past promos",
  overall: 'learned from past promos of other items',
  default: 'starting guess until a past promo week is uploaded',
}

export function PromoBadge({ promo }: { promo: NonNullable<OrderRow['promo']> }) {
  return (
    <span title={`On promo ${promo.days} of the covered day(s) · +${promo.lift}% (${LIFT_SOURCE[promo.source]})`} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold uppercase text-orange-800">
      <Megaphone className="h-3 w-3" /> Promo +{promo.lift}%
    </span>
  )
}

/** Small hints under an item on the order screen: promo, last order for this weekday, trend. */
export function OrderHints({ row }: { row: OrderRow }) {
  const trend = row.trend && Math.abs(row.trend.factor - 1) >= 0.05 ? row.trend : null
  if (!row.promo && !row.last && !trend) return null
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {row.promo && <PromoBadge promo={row.promo} />}
      {row.last && (
        <span title={`Ordered for ${prettyDate(row.last.deliveryDate)}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          Last {prettyDate(row.last.deliveryDate).slice(0, 3)}: {row.last.quantity}
        </span>
      )}
      {trend && (
        <span
          title={`Over the last ${trend.intervals} count-to-count stretch(es), ${trend.actual} left the cooler vs ${Math.round(trend.forecast)} forecast (sales + any spoilage). Forecasts for this item are adjusted.`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trend.factor > 1 ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700'}`}
        >
          {trend.factor > 1 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend.factor > 1 ? 'Selling faster' : 'Selling slower'} {trend.factor > 1 ? '+' : '−'}{Math.round(Math.abs(trend.factor - 1) * 100)}%
        </span>
      )}
    </span>
  )
}
