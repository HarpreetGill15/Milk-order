import { useEffect, useMemo, useState } from 'react'
import type { CustomEvent, HolidaySetting } from '../lib/holidays'
import { createPlanner } from '../lib/planner'
import type { ScheduleChange } from '../lib/schedule'
import type { Count, Item, Promo, SalesWeek, SavedOrder } from '../types'
import { store, type CollectionName } from './store'

function useCollection<T>(name: CollectionName): { data: T[]; loading: boolean } {
  const [state, setState] = useState<{ data: T[]; loading: boolean }>({ data: [], loading: true })
  useEffect(() => store.subscribe(name, docs => setState({ data: docs as T[], loading: false })), [name])
  return state
}

export function useItems() {
  const { data, loading } = useCollection<Item>('items')
  const items = useMemo(() => [...data].sort((a, b) => a.walkOrder - b.walkOrder || a.name.localeCompare(b.name)), [data])
  return { items, loading }
}

export function useSalesWeeks() {
  const { data, loading } = useCollection<SalesWeek>('salesWeeks')
  const weeks = useMemo(() => [...data].sort((a, b) => b.weekStart.localeCompare(a.weekStart)), [data])
  return { weeks, loading }
}

export function useCounts() {
  const { data, loading } = useCollection<Count>('counts')
  const counts = useMemo(() => [...data].sort((a, b) => b.date.localeCompare(a.date)), [data])
  return { counts, loading }
}

export function useOrders() {
  const { data, loading } = useCollection<SavedOrder>('orders')
  return { orders: data, loading }
}

export function useScheduleChanges() {
  const { data, loading } = useCollection<ScheduleChange>('scheduleChanges')
  return { changes: data, loading }
}

export function useHolidaySettings() {
  const { data, loading } = useCollection<HolidaySetting>('holidaySettings')
  return { holidaySettings: data, loading }
}

export function useEvents() {
  const { data, loading } = useCollection<CustomEvent>('events')
  const events = useMemo(() => [...data].sort((a, b) => a.start.localeCompare(b.start)), [data])
  return { events, loading }
}

export function usePromos() {
  const { data, loading } = useCollection<Promo>('promos')
  return { promos: data, loading }
}

/** Everything the order math needs: items, history, counts, schedule changes, holidays, promos and past orders. */
export function usePlanner() {
  const { items, loading: itemsLoading } = useItems()
  const { weeks, loading: weeksLoading } = useSalesWeeks()
  const { counts, loading: countsLoading } = useCounts()
  const { changes, loading: changesLoading } = useScheduleChanges()
  const { holidaySettings, loading: settingsLoading } = useHolidaySettings()
  const { events, loading: eventsLoading } = useEvents()
  const { promos, loading: promosLoading } = usePromos()
  const { orders, loading: ordersLoading } = useOrders()
  const planner = useMemo(
    () => createPlanner({ items, weeks, counts, changes, holidaySettings, events, promos, orders }),
    [items, weeks, counts, changes, holidaySettings, events, promos, orders],
  )
  const loading = itemsLoading || weeksLoading || countsLoading || changesLoading || settingsLoading || eventsLoading || promosLoading || ordersLoading
  return { planner, items, weeks, counts, promos, orders, loading }
}
