import { addDaysIso, dayOfWeek } from './dates'

/**
 * Regular deliveries: weekday (0 = Sun) → how many days before it the order is placed.
 *   Mon ← Fri,  Wed ← Tue,  Fri ← Thu,  Sat ← Fri
 */
export const REGULAR_DELIVERIES: Record<number, number> = { 1: 3, 3: 1, 5: 1, 6: 1 }

/** A one-off change to the regular schedule for a date (e.g. holiday weeks). */
export interface ScheduleChange {
  /** Delivery date — also the document id. */
  date: string
  /** false = no delivery that day; true = delivery that day (ordered on `orderDate`). */
  delivery: boolean
  orderDate?: string
}

export interface Delivery {
  deliveryDate: string
  orderDate: string
  /** Comes from a ScheduleChange rather than the regular pattern. */
  changed: boolean
}

export interface DeliveryPlan {
  deliveryDate: string
  /** Dates this delivery has to last through: up to the day before the next delivery. */
  coversDates: string[]
  changed: boolean
}

/** [from, to) as ISO dates. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = from; date < to; date = addDaysIso(date, 1)) dates.push(date)
  return dates
}

export const regularOrderDate = (date: string): string | null => {
  const gap = REGULAR_DELIVERIES[dayOfWeek(date)]
  return gap === undefined ? null : addDaysIso(date, -gap)
}

export interface Schedule {
  deliveryOn: (date: string) => Delivery | null
  /** Why a regular delivery day has none: removed by hand, or the store is closed. */
  missingReason: (date: string) => 'removed' | 'closed' | null
  plansFor: (orderDate: string) => DeliveryPlan[]
  isOrderDay: (date: string) => boolean
  nextOrderDay: (from: string) => string
  previousOrderDay: (before: string) => string
}

const SEARCH_DAYS = 21

export function createSchedule(changes: ScheduleChange[], isClosed: (date: string) => boolean): Schedule {
  const byDate = new Map(changes.map(change => [change.date, change]))

  const deliveryOn = (date: string): Delivery | null => {
    const change = byDate.get(date)
    const regular = regularOrderDate(date)
    if (change) {
      if (!change.delivery) return null
      return { deliveryDate: date, orderDate: change.orderDate ?? regular ?? addDaysIso(date, -1), changed: true }
    }
    // A regular delivery can't come on a day the store is closed.
    if (!regular || isClosed(date)) return null
    return { deliveryDate: date, orderDate: regular, changed: false }
  }

  const missingReason = (date: string) => {
    if (!regularOrderDate(date) || deliveryOn(date)) return null
    return byDate.get(date)?.delivery === false ? 'removed' as const : 'closed' as const
  }

  const nextDeliveryAfter = (date: string): string | null => {
    for (let d = addDaysIso(date, 1), i = 0; i < SEARCH_DAYS; d = addDaysIso(d, 1), i++) if (deliveryOn(d)) return d
    return null
  }

  const plansFor = (orderDate: string): DeliveryPlan[] => {
    const plans: DeliveryPlan[] = []
    for (let d = orderDate, i = 0; i < SEARCH_DAYS; d = addDaysIso(d, 1), i++) {
      const delivery = deliveryOn(d)
      if (!delivery || delivery.orderDate !== orderDate) continue
      const next = nextDeliveryAfter(d) ?? addDaysIso(d, 7)
      plans.push({ deliveryDate: d, coversDates: datesBetween(d, next), changed: delivery.changed })
    }
    return plans
  }

  const isOrderDay = (date: string) => plansFor(date).length > 0
  const step = (from: string, direction: 1 | -1) => {
    let date = from
    for (let i = 0; i < 60; i++) {
      if (isOrderDay(date)) return date
      date = addDaysIso(date, direction)
    }
    return from
  }

  return {
    deliveryOn,
    missingReason,
    plansFor,
    isOrderDay,
    nextOrderDay: from => step(from, 1),
    previousOrderDay: before => step(addDaysIso(before, -1), -1),
  }
}
