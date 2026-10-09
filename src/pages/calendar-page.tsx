import { AlertTriangle, Plus, RotateCcw, Trash2, Truck } from 'lucide-react'
import { useState } from 'react'
import { Button, Card } from '../components/button'
import { DayNotes } from '../components/day-notes'
import { deleteEvent, deleteScheduleChange, newId, saveEvent, saveScheduleChange, setHolidayValue } from '../data/api'
import { useEvents, useHolidaySettings, usePlanner } from '../data/hooks'
import { addDaysIso, prettyDate, todayIso } from '../lib/dates'
import { HOLIDAYS, offsetLabel, resolveHolidayDay, type BoostSource, type HolidayDef } from '../lib/holidays'
import type { Planner } from '../lib/planner'
import { regularOrderDate } from '../lib/schedule'
import { cn } from '../lib/utils'

const DAYS_SHOWN = 21

export function CalendarPage() {
  const { planner, loading } = usePlanner()
  if (loading) return <p className="text-slate-500">Loading…</p>
  return (
    <div className="space-y-4">
      <DeliveryDays planner={planner} />
      <Holidays planner={planner} />
      <Events />
    </div>
  )
}

/** Day before `date` that the store is open — the default order day for an added delivery. */
function defaultOrderDate(planner: Planner, date: string) {
  let day = addDaysIso(date, -1)
  for (let i = 0; i < 7 && planner.calendar.isClosed(day); i++) day = addDaysIso(day, -1)
  return day
}

function DeliveryDays({ planner }: { planner: Planner }) {
  const today = todayIso()
  const dates = Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysIso(today, i))
  const { schedule, calendar } = planner

  const remove = (date: string) => {
    // On a regular delivery day, record "no delivery"; anywhere else just drop the added one.
    const regularWouldDeliver = regularOrderDate(date) !== null && !calendar.isClosed(date)
    void (regularWouldDeliver ? saveScheduleChange({ date, delivery: false }) : deleteScheduleChange(date))
  }

  return (
    <Card className="space-y-3">
      <div>
        <h1 className="text-lg font-bold">Delivery days</h1>
        <p className="text-sm text-slate-500">Regular: Mon, Wed, Fri, Sat (ordered the day before; Monday's on Friday). Deliveries on closed holidays drop off automatically. When the supplier moves a delivery, remove it here and add the new day.</p>
      </div>
      <ul className="divide-y">
        {dates.map(date => {
          const delivery = schedule.deliveryOn(date)
          const missing = schedule.missingReason(date)
          const plans = schedule.plansFor(date)
          const closed = calendar.isClosed(date)
          return (
            <li key={date} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 py-2', closed && 'bg-red-50/50')}>
              <div className="w-28 shrink-0">
                <p className="font-semibold">{prettyDate(date)}</p>
                {plans.length > 0 && <p className="text-xs font-medium text-brand-700">Order day → {plans.map(p => prettyDate(p.deliveryDate).slice(0, 3)).join(' + ')}</p>}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <DayNotes marks={calendar.marks(date)} />
                {plans.length > 0 && closed && <p className="flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3 w-3" />Store closed on an order day — move those deliveries' order day.</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {delivery ? (
                  <>
                    <span className={cn('flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold', delivery.changed ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800')}>
                      <Truck className="h-3 w-3" /> Delivery{delivery.changed ? ' (changed)' : ''}
                    </span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      ordered
                      <input
                        type="date"
                        className="h-8 rounded-lg border px-1 text-xs"
                        value={delivery.orderDate}
                        max={date}
                        onChange={event => event.target.value && void saveScheduleChange({ date, delivery: true, orderDate: event.target.value })}
                      />
                    </label>
                    <Button variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => remove(date)}>Remove</Button>
                  </>
                ) : (
                  <>
                    {missing === 'removed' && <span className="text-xs text-slate-500">Delivery removed</span>}
                    {missing === 'closed' && <span className="text-xs text-slate-500">No delivery — closed</span>}
                    {missing === 'removed' && <Button variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => void deleteScheduleChange(date)}><RotateCcw className="h-3 w-3" /> Undo</Button>}
                    <Button variant="secondary" className="min-h-8 px-2 text-xs" onClick={() => void saveScheduleChange({ date, delivery: true, orderDate: defaultOrderDate(planner, date) })}>
                      <Plus className="h-3 w-3" /> Add delivery
                    </Button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** The next time this holiday comes around (or the current one, if it's in progress). */
function nextOccurrence(holiday: HolidayDef, today: string) {
  const year = Number(today.slice(0, 4))
  const lastOffset = Math.max(...holiday.days.map(day => day.offset))
  const thisYear = holiday.dateFor(year)
  return addDaysIso(thisYear, lastOffset) >= today ? thisYear : holiday.dateFor(year + 1)
}

const SOURCE_LABEL: Record<BoostSource, string> = { default: 'starting guess', learned: 'learned from your sales', set: 'set by you' }

function Holidays({ planner }: { planner: Planner }) {
  const { holidaySettings } = useHolidaySettings()
  const today = todayIso()
  const upcoming = HOLIDAYS.map(holiday => ({ holiday, date: nextOccurrence(holiday, today) })).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Ontario holidays</h2>
        <p className="text-sm text-slate-500">
          Closed days forecast 0 sales. Boosts raise the forecast for milk and cream around each holiday. They start as guesses;
          once the holiday week (plus a few normal weeks around it) from a past year is uploaded, the app uses what you actually sold.
          Type your own number to override either.
        </p>
      </div>
      {upcoming.map(({ holiday, date }) => (
        <div key={holiday.id} className="rounded-xl border p-3">
          <p className="font-semibold">{holiday.name} <span className="font-normal text-slate-500">· {prettyDate(date)}</span></p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr><th className="py-1 pr-2">Day</th><th className="px-2">Store</th><th className="px-2">Milk</th><th className="px-2">Cream</th></tr>
              </thead>
              <tbody>
                {holiday.days.map(base => {
                  const value = resolveHolidayDay(holiday, base, holidaySettings, planner.learned)
                  const learned = planner.learned[holiday.id]?.[String(base.offset)]
                  return (
                    <tr key={base.offset} className="border-t">
                      <td className="py-1.5 pr-2">
                        <p className="font-medium">{offsetLabel(holiday, base.offset)}</p>
                        <p className="text-xs text-slate-400">{prettyDate(addDaysIso(date, base.offset))}</p>
                      </td>
                      <td className="px-2">
                        <button
                          className={cn('rounded-full px-2 py-1 text-xs font-semibold', value.closed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800')}
                          onClick={() => void setHolidayValue(holiday.id, base.offset, 'closed', !value.closed)}
                        >
                          {value.closed ? 'Closed' : 'Open'}
                        </button>
                      </td>
                      {(['milk', 'cream'] as const).map(category => {
                        const source = category === 'milk' ? value.milkSource : value.creamSource
                        return (
                          <td key={category} className="px-2">
                            {value.closed ? <span className="text-xs text-slate-400">—</span> : (
                              <div className="flex items-center gap-1">
                                <PercentInput value={value[category]} onChange={next => void setHolidayValue(holiday.id, base.offset, category, next)} />
                                {source === 'set' && (
                                  <button title="Go back to learned / starting value" className="text-slate-400 hover:text-slate-700" onClick={() => void setHolidayValue(holiday.id, base.offset, category, null)}>
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <span className={cn('text-[11px]', source === 'learned' ? 'text-violet-700' : 'text-slate-400')} title={learned?.[category] ? `Learned: ${learned[category]!.boost}% from ${learned[category]!.samples} past holiday(s)` : undefined}>
                                  {SOURCE_LABEL[source]}{source === 'learned' && learned?.[category] ? ` (${learned[category]!.samples}×)` : ''}
                                </span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  )
}

function PercentInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text !== null && /^-?\d+$/.test(text) && Number(text) !== value) onChange(Number(text))
    setText(null)
  }
  return (
    <span className="flex items-center">
      <input
        inputMode="numeric"
        className="h-8 w-14 rounded-lg border text-center tabular-nums"
        value={text ?? (value > 0 ? `+${value}` : String(value))}
        onFocus={event => { setText(String(value)); event.target.select() }}
        onChange={event => setText(event.target.value.replace(/[^\d-]/g, ''))}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      <span className="ml-0.5 text-xs text-slate-500">%</span>
    </span>
  )
}

function Events() {
  const { events } = useEvents()
  const today = todayIso()
  const [draft, setDraft] = useState({ name: '', start: today, end: today, closed: false, milk: 0, cream: 0 })
  const valid = draft.name.trim() && draft.start && draft.end && draft.end >= draft.start

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Special events</h2>
        <p className="text-sm text-slate-500">Anything else that changes sales: a promo, a storm, a local event, an extra closed day.</p>
      </div>
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-6"
        onSubmit={event => {
          event.preventDefault()
          if (!valid) return
          void saveEvent({ id: newId(), ...draft, name: draft.name.trim() })
          setDraft({ ...draft, name: '' })
        }}
      >
        <input className="col-span-2 h-10 rounded-lg border px-2" placeholder="Name, e.g. Cream promo" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <input type="date" className="h-10 rounded-lg border px-1" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value, end: e.target.value > draft.end ? e.target.value : draft.end })} />
        <input type="date" className="h-10 rounded-lg border px-1" value={draft.end} min={draft.start} onChange={e => setDraft({ ...draft, end: e.target.value })} />
        <label className="flex items-center gap-1 text-sm">Milk <input inputMode="numeric" className="h-10 w-14 rounded-lg border text-center" value={draft.milk} onChange={e => setDraft({ ...draft, milk: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} />%</label>
        <label className="flex items-center gap-1 text-sm">Cream <input inputMode="numeric" className="h-10 w-14 rounded-lg border text-center" value={draft.cream} onChange={e => setDraft({ ...draft, cream: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} />%</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.closed} onChange={e => setDraft({ ...draft, closed: e.target.checked })} /> Store closed</label>
        <Button type="submit" className="col-span-2 sm:col-span-1" disabled={!valid}><Plus className="h-4 w-4" /> Add</Button>
      </form>
      {events.length > 0 && (
        <ul className="divide-y text-sm">
          {events.map(event => (
            <li key={event.id} className="flex items-center gap-3 py-2">
              <span className="font-medium">{event.name}</span>
              <span className="text-slate-500">{prettyDate(event.start)}{event.end !== event.start ? ` – ${prettyDate(event.end)}` : ''}</span>
              <span className="text-slate-500">{event.closed ? 'closed' : `milk ${event.milk}% · cream ${event.cream}%`}</span>
              <button className="ml-auto text-slate-400 hover:text-red-600" aria-label="Delete event" onClick={() => void deleteEvent(event.id)}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
