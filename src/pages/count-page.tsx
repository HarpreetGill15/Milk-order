import { ArrowLeft, ArrowRight, Ban, Check, LayoutList, Square, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Chip } from '../components/button'
import { Stepper } from '../components/stepper'
import { saveCountEntry } from '../data/api'
import { useCounts, useItems } from '../data/hooks'
import { prettyDate, todayIso } from '../lib/dates'
import { DEFAULT_FILTER, filterAndSort, SIZE_LABEL, type ItemFilter, type SortMode } from '../lib/item-filters'
import { cn } from '../lib/utils'
import { BRANDS, SIZES, type CountEntry, type Item } from '../types'

type View = 'single' | 'list'
const VIEW_KEY = 'milk-order:count-view'
const FILTER_KEY = 'milk-order:count-filter'

function loadLocal<T>(key: string, fallback: T): T {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? 'null') } } catch { return fallback }
}
function saveLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode — preference just isn't remembered */ }
}

export function CountPage() {
  const { items, loading } = useItems()
  const { counts } = useCounts()
  const [date, setDate] = useState(todayIso())
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'single'))
  const [filter, setFilter] = useState<ItemFilter>(() => loadLocal(FILTER_KEY, DEFAULT_FILTER))
  const [index, setIndex] = useState(0)

  useEffect(() => { saveLocal(FILTER_KEY, filter) }, [filter])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  const entries = counts.find(count => count.date === date)?.entries ?? {}
  const visible = useMemo(() => filterAndSort(items, filter), [items, filter])
  const allActive = items.filter(item => item.active)
  const countedVisible = visible.filter(item => entries[item.id]).length
  const countedAll = allActive.filter(item => entries[item.id]).length
  const safeIndex = Math.min(index, Math.max(0, visible.length - 1))

  const record = (item: Item, crates: number, units: number, noStock = false) => {
    const entry: CountEntry = { crates, units, total: crates * item.orderStep + units, noStock, countedAt: new Date().toISOString() }
    void saveCountEntry(date, item.id, entry)
  }
  const nextUncounted = () => {
    const after = visible.findIndex((item, i) => i > safeIndex && !entries[item.id])
    const any = after >= 0 ? after : visible.findIndex(item => !entries[item.id])
    if (any >= 0) setIndex(any)
  }

  if (loading) return <p className="text-slate-500">Loading…</p>
  if (items.length === 0) return <Card><p>No items yet. <Link className="font-semibold text-brand-600" to="/sales">Upload a sales report</Link> to create the item list.</p></Card>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input type="date" value={date} onChange={event => event.target.value && setDate(event.target.value)} className="h-10 rounded-xl border px-2 text-sm" />
        <div className="ml-auto flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
          <button className={cn('flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium', view === 'single' ? 'bg-brand-600 text-white' : 'text-slate-600')} onClick={() => setView('single')}><Square className="h-4 w-4" />One</button>
          <button className={cn('flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium', view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-600')} onClick={() => setView('list')}><LayoutList className="h-4 w-4" />List</button>
        </div>
      </div>

      <FilterBar filter={filter} onChange={next => { setFilter(next); setIndex(0) }} />

      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span className="font-semibold">{countedVisible} / {visible.length} counted</span>
          {visible.length !== allActive.length && <span className="text-slate-500">All items: {countedAll} / {allActive.length}</span>}
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${visible.length ? (countedVisible / visible.length) * 100 : 0}%` }} />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card><p className="text-slate-500">No items match these filters.</p></Card>
      ) : view === 'single' ? (
        <SingleItem
          item={visible[safeIndex]}
          entry={entries[visible[safeIndex].id]}
          position={`${safeIndex + 1} of ${visible.length}`}
          onRecord={record}
          onBack={safeIndex > 0 ? () => setIndex(safeIndex - 1) : undefined}
          onNext={safeIndex < visible.length - 1 ? () => setIndex(safeIndex + 1) : undefined}
          onNextUncounted={countedVisible < visible.length ? nextUncounted : undefined}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((item, i) => (
            <ListRow key={item.id} item={item} entry={entries[item.id]} onRecord={record} onOpen={() => { setIndex(i); setView('single') }} />
          ))}
        </div>
      )}
      <p className="text-center text-xs text-slate-400">Counting for {prettyDate(date)} · saves automatically</p>
    </div>
  )
}

function FilterBar({ filter, onChange }: { filter: ItemFilter; onChange: (filter: ItemFilter) => void }) {
  const sorts: [SortMode, string][] = [['walk', 'Walk order'], ['size', 'Size'], ['brand', 'Brand']]
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs font-semibold uppercase text-slate-400">Sort</span>
        {sorts.map(([value, label]) => <Chip key={value} active={filter.sort === value} onClick={() => onChange({ ...filter, sort: value })}>{label}</Chip>)}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs font-semibold uppercase text-slate-400">Brand</span>
        {(['All', ...BRANDS] as const).map(brand => <Chip key={brand} active={filter.brand === brand} onClick={() => onChange({ ...filter, brand })}>{brand}</Chip>)}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs font-semibold uppercase text-slate-400">Size</span>
        {(['All', ...SIZES] as const).map(size => <Chip key={size} active={filter.size === size} onClick={() => onChange({ ...filter, size })}>{size === 'All' ? 'All' : SIZE_LABEL[size]}</Chip>)}
      </div>
    </div>
  )
}

interface RecordProps { item: Item; entry: CountEntry | undefined; onRecord: (item: Item, crates: number, units: number, noStock?: boolean) => void }

function SingleItem({ item, entry, position, onRecord, onBack, onNext, onNextUncounted }: RecordProps & { position: string; onBack?: () => void; onNext?: () => void; onNextUncounted?: () => void }) {
  const crates = entry?.crates ?? 0
  const units = entry?.units ?? 0
  return (
    <Card className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold leading-tight">{item.name}</h2>
          <CountBadge entry={entry} />
        </div>
        <p className="mt-1 text-sm text-slate-500">{item.brand} · {SIZE_LABEL[item.size]} · {item.orderStep} per crate · {position}</p>
      </div>
      <Stepper label="Crates" value={crates} onChange={value => onRecord(item, value, units)} />
      <Stepper label="Units" value={units} onChange={value => onRecord(item, crates, value)} />
      <p className="text-center text-lg">= <span className="font-bold tabular-nums">{entry ? entry.total : 0}</span> units</p>
      <Button variant="secondary" className={cn('h-14 w-full text-base', entry?.noStock && 'bg-red-50 text-red-700 ring-red-200')} onClick={() => { onRecord(item, 0, 0, true); onNext?.() }}>
        <Ban className="h-5 w-5" /> No stock
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-14" disabled={!onBack} onClick={onBack}><ArrowLeft className="h-5 w-5" /> Back</Button>
        <Button className="h-14" disabled={!onNext} onClick={onNext}>Next <ArrowRight className="h-5 w-5" /></Button>
      </div>
      {!entry && <p className="text-center text-xs text-slate-400">Not counted yet — change a number or tap No stock.</p>}
      {onNextUncounted && <Button variant="ghost" className="w-full" onClick={onNextUncounted}><SkipForward className="h-4 w-4" /> Jump to next uncounted</Button>}
    </Card>
  )
}

function ListRow({ item, entry, onRecord, onOpen }: RecordProps & { onOpen: () => void }) {
  const crates = entry?.crates ?? 0
  const units = entry?.units ?? 0
  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <button className="text-left" onClick={onOpen}>
          <p className="font-semibold leading-tight">{item.name}</p>
          <p className="text-xs text-slate-500">{item.brand} · {SIZE_LABEL[item.size]} · {item.orderStep}/crate</p>
        </button>
        <CountBadge entry={entry} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Stepper size="sm" label="Crates" value={crates} onChange={value => onRecord(item, value, units)} />
        <Stepper size="sm" label="Units" value={units} onChange={value => onRecord(item, crates, value)} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">= <b className="tabular-nums">{entry ? entry.total : 0}</b> units</span>
        <Button variant="secondary" className={cn('min-h-9 px-3', entry?.noStock && 'bg-red-50 text-red-700 ring-red-200')} onClick={() => onRecord(item, 0, 0, true)}><Ban className="h-4 w-4" /> No stock</Button>
      </div>
    </Card>
  )
}

function CountBadge({ entry }: { entry: CountEntry | undefined }) {
  if (!entry) return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Not counted</span>
  if (entry.noStock) return <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">No stock</span>
  return <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><Check className="h-3 w-3" />Counted</span>
}
