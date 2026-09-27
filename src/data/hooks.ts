import { useEffect, useState } from 'react'
import type { Count, Item, SalesWeek, SavedOrder } from '../types'
import { store, type CollectionName } from './store'

function useCollection<T>(name: CollectionName): { data: T[]; loading: boolean } {
  const [state, setState] = useState<{ data: T[]; loading: boolean }>({ data: [], loading: true })
  useEffect(() => store.subscribe(name, docs => setState({ data: docs as T[], loading: false })), [name])
  return state
}

export function useItems() {
  const { data, loading } = useCollection<Item>('items')
  return { items: [...data].sort((a, b) => a.walkOrder - b.walkOrder || a.name.localeCompare(b.name)), loading }
}

export function useSalesWeeks() {
  const { data, loading } = useCollection<SalesWeek>('salesWeeks')
  return { weeks: [...data].sort((a, b) => b.weekStart.localeCompare(a.weekStart)), loading }
}

export function useCounts() {
  const { data, loading } = useCollection<Count>('counts')
  return { counts: [...data].sort((a, b) => b.date.localeCompare(a.date)), loading }
}

export function useOrders() {
  const { data, loading } = useCollection<SavedOrder>('orders')
  return { orders: data, loading }
}
