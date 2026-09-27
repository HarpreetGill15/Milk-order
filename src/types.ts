export type Size = '2L' | '1L' | '4L' | 'Cream' | 'Other'
export const SIZES: Size[] = ['2L', '1L', '4L', 'Cream', 'Other']

export type Brand = 'Lactantia' | 'Béatrice' | 'Other'
export const BRANDS: Brand[] = ['Lactantia', 'Béatrice', 'Other']

export interface Item {
  id: string
  /** Name exactly as it appears on the sales report — used to match future uploads. */
  name: string
  /** Other report spellings that should match this item (added when linking an unknown name). */
  aliases: string[]
  brand: Brand
  size: Size
  /** Units per crate/case. Orders are always rounded up to a multiple of this; counts use it for crates → units. */
  orderStep: number
  /** UPC or vendor code — printed as the barcode on the order sheet. */
  code: string
  /** Position when walking the cooler (lower = counted first). */
  walkOrder: number
  /** Extra units on top of the forecast: max(bufferMin, ceil(forecast × bufferPct / 100)). */
  bufferPct: number
  bufferMin: number
  active: boolean
}

/** Units sold per day, index 0 = Sunday … 6 = Saturday (same order as the sales report). */
export type WeekDays = [number, number, number, number, number, number, number]

export interface SalesWeek {
  /** ISO date (yyyy-MM-dd) of the Sunday the report starts on. Also the document id. */
  weekStart: string
  fileName: string
  uploadedAt: string
  rows: { itemId: string; days: WeekDays; total: number }[]
}

export interface CountEntry {
  crates: number
  units: number
  /** crates × orderStep + units, stored so later crate-size edits don't rewrite history. */
  total: number
  noStock: boolean
  countedAt: string
}

export interface Count {
  /** ISO date of the count — also the document id. */
  date: string
  entries: Record<string, CountEntry>
}

export interface OrderLine { suggested: number; final: number }

export interface SavedOrder {
  /** `${orderDate}_${deliveryDate}` */
  id: string
  orderDate: string
  deliveryDate: string
  lines: Record<string, OrderLine>
  savedAt: string
}
