import { Megaphone, PackagePlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Chip } from '../components/button'
import { setPromoItem } from '../data/api'
import { usePlanner } from '../data/hooks'
import { addDaysIso, prettyDate, todayIso } from '../lib/dates'
import { DEFAULT_FILTER, filterAndSort, SIZE_LABEL, type ItemFilter } from '../lib/item-filters'
import { normalizeName } from '../lib/item-detect'
import { adWeekStart, DEFAULT_PROMO_LIFT, distroDeliveryDates, distroQuantities } from '../lib/promos'
import type { Planner } from '../lib/planner'
import type { Distro, LegacyDistro } from '../types'
import { cn } from '../lib/utils'
import { BRANDS, SIZES } from '../types'

/** Mon–Wed you're usually setting up next Thursday's flyer; Thu–Sun the current one. */
const defaultWeek = () => adWeekStart(addDaysIso(todayIso(), 3))

export function PromosPage() {
  const { planner, items, promos, loading } = usePlanner()
  const [params, setParams] = useSearchParams()
  const weekStart = adWeekStart(params.get('week') ?? defaultWeek())
  const [filter, setFilter] = useState<ItemFilter>({ ...DEFAULT_FILTER, sort: 'size' })
  const [search, setSearch] = useState('')

  const promo = promos.find(p => p.weekStart === weekStart)
  const onPromo = promo?.items ?? {}
  const weekChoices = [-7, 0, 7, 14].map(offset => addDaysIso(adWeekStart(todayIso()), offset))
  const shown = useMemo(() => {
    const query = normalizeName(search)
    return filterAndSort(items, filter).filter(item => !query || normalizeName(item.name).includes(query))
  }, [items, filter, search])
  const overall = planner.learnedPromos.overall

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold"><Megaphone className="h-5 w-5 text-orange-600" /> Flyer promos</h1>
          <p className="text-sm text-slate-500">
            Ad weeks run Thursday to Wednesday. Tick what's in the flyer and orders covering those days are raised.
            If the warehouse sends a distro for an item, enter it so it isn't ordered twice.
            Leave the lift blank to use the learned number: {overall
              ? <>your past promos average <b>{overall.lift > 0 ? '+' : ''}{overall.lift}%</b> ({overall.samples} promo-week{overall.samples === 1 ? '' : 's'}), and items with their own promo history use their own.</>
              : <>until a past flyer week is set here and its sales are uploaded, that's a starting guess of <b>+{DEFAULT_PROMO_LIFT}%</b>.</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {weekChoices.map(start => (
            <Chip key={start} active={start === weekStart} onClick={() => setParams({ week: start })}>
              {start === adWeekStart(todayIso()) ? 'This week' : prettyDate(start)}
            </Chip>
          ))}
          <input type="date" className="h-9 rounded-lg border px-1 text-sm" value={weekStart} onChange={event => event.target.value && setParams({ week: adWeekStart(event.target.value) })} />
        </div>
        <p className="font-semibold">
          {prettyDate(weekStart)} – {prettyDate(addDaysIso(weekStart, 6))}: {Object.keys(onPromo).length} item{Object.keys(onPromo).length === 1 ? '' : 's'} on promo
        </p>
      </Card>

      <Card className="space-y-3">
        <input className="h-10 w-full rounded-xl border px-3" placeholder="Search items" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(['All', ...BRANDS] as const).map(brand => <Chip key={brand} active={filter.brand === brand} onClick={() => setFilter({ ...filter, brand })}>{brand}</Chip>)}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(['All', ...SIZES] as const).map(size => <Chip key={size} active={filter.size === size} onClick={() => setFilter({ ...filter, size })}>{size === 'All' ? 'All sizes' : SIZE_LABEL[size]}</Chip>)}
        </div>
        <ul className="divide-y">
          {shown.map(item => {
            const entry = onPromo[item.id]
            const active = entry !== undefined
            const auto = planner.learnedPromos.perItem[item.id]
            return (
              <li key={item.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 py-2', active && 'bg-orange-50/60')}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-orange-600" checked={active} onChange={event => void setPromoItem(weekStart, item.id, event.target.checked ? { lift: null } : null)} />
                  <span className="min-w-0">
                    <span className="block font-medium leading-tight">{item.name}</span>
                    <span className="text-xs text-slate-500">{item.brand} · {SIZE_LABEL[item.size]}{auto ? ` · past promos +${auto.lift}%` : ''}</span>
                  </span>
                </label>
                {active && (
                  <LiftInput
                    value={entry.lift ?? null}
                    placeholder={`auto +${auto?.lift ?? overall?.lift ?? DEFAULT_PROMO_LIFT}`}
                    onChange={lift => void setPromoItem(weekStart, item.id, { lift })}
                  />
                )}
                {active && (
                  <DistroEditor
                    planner={planner}
                    weekStart={weekStart}
                    distro={entry.distro ?? null}
                    onChange={distro => void setPromoItem(weekStart, item.id, { distro })}
                  />
                )}
              </li>
            )
          })}
        </ul>
        {shown.length === 0 && <p className="text-sm text-slate-500">No items match.</p>}
      </Card>
    </div>
  )
}

/**
 * Distro: promo stock the warehouse sends without an order — a set amount on each delivery,
 * usually starting with the Wednesday delivery, then Friday and Saturday. Each amount is taken off
 * the suggested order for that delivery.
 */
function DistroEditor({ planner, weekStart, distro, onChange }: { planner: Planner; weekStart: string; distro: Distro | LegacyDistro | null; onChange: (distro: Distro) => void }) {
  const quantities = distroQuantities(distro, planner.schedule.deliveryOn)
  const dates = [...new Set([...distroDeliveryDates(weekStart, planner.schedule.deliveryOn), ...Object.keys(quantities)])].sort()
  const total = Object.values(quantities).reduce((sum, units) => sum + units, 0)
  // Saves every date so a distro saved the old way is rewritten in the new per-delivery form.
  const set = (date: string, units: number) => onChange({ ...Object.fromEntries(dates.map(d => [d, quantities[d] ?? 0])), [date]: units })

  return (
    <div className="w-full space-y-1 pl-8 text-sm text-slate-600">
      <p className="flex items-center gap-1"><PackagePlus className="h-4 w-4 text-violet-600" /> Distro per delivery{total > 0 && <span className="text-violet-800"> · {total} units, taken off those orders</span>}</p>
      <div className="flex flex-wrap gap-2">
        {dates.map(date => (
          <label key={date} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
            <span className="text-xs">{prettyDate(date)}</span>
            <UnitsInput value={quantities[date] ?? 0} onChange={units => set(date, units)} />
          </label>
        ))}
      </div>
    </div>
  )
}

function UnitsInput({ value, onChange }: { value: number; onChange: (units: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const units = text.trim() === '' ? 0 : Number(text)
    if (Number.isFinite(units) && units !== value) onChange(Math.max(0, Math.round(units)))
    setText(null)
  }
  return (
    <input
      inputMode="numeric"
      className="h-8 w-12 rounded-md border px-1 text-center tabular-nums"
      placeholder="0"
      value={text ?? (value ? String(value) : '')}
      onFocus={() => setText(value ? String(value) : '')}
      onChange={event => setText(event.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    />
  )
}

function LiftInput({ value, placeholder, onChange }: { value: number | null; placeholder: string; onChange: (lift: number | null) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const trimmed = text.trim()
    if (trimmed === '') onChange(null)
    else if (/^-?\d+$/.test(trimmed) && Number(trimmed) !== value) onChange(Number(trimmed))
    setText(null)
  }
  return (
    <label className="flex items-center gap-1 text-sm text-slate-600">
      Lift
      <input
        inputMode="numeric"
        className="h-9 w-24 rounded-lg border px-2 text-center tabular-nums"
        placeholder={placeholder}
        value={text ?? (value === null ? '' : String(value))}
        onFocus={() => setText(value === null ? '' : String(value))}
        onChange={event => setText(event.target.value.replace(/[^\d-]/g, ''))}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      %
    </label>
  )
}
