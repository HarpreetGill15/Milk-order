import { addDays, format, parseISO, startOfWeek } from 'date-fns'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const toIso = (date: Date) => format(date, 'yyyy-MM-dd')
export const fromIso = (iso: string) => parseISO(iso)
export const todayIso = () => toIso(new Date())
export const addDaysIso = (iso: string, days: number) => toIso(addDays(fromIso(iso), days))
export const dayOfWeek = (iso: string) => fromIso(iso).getDay()
export const sundayOf = (iso: string) => toIso(startOfWeek(fromIso(iso), { weekStartsOn: 0 }))
export const prettyDate = (iso: string) => format(fromIso(iso), 'EEE MMM d')

/** Sunday of the last full Sun–Sat week before today — the usual week a fresh sales report covers. */
export const lastFullWeekStart = () => addDaysIso(sundayOf(todayIso()), -7)
