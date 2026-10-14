export type Size = '2L' | '1L' | '4L' | 'Cream' | 'Other'
export const SIZES: Size[] = ['2L', '1L', '4L', 'Cream', 'Other']

export type Brand = 'Lactantia' | 'Béatrice' | 'Selection' | 'Other'
export const BRANDS: Brand[] = ['Lactantia', 'Béatrice', 'Selection', 'Other']

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
  /** UPC from the sales report (the order sheet can print this or the vendor code as the barcode). */
  code: string
  /** Vendor / order code from the sales report. */
  vendorCode: string
  /** Position when walking the cooler (lower = counted first). */
  walkOrder: number
  /** Units that should always be left in the cooler when the next truck arrives, on top of forecast sales. */
  safetyStock: number
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
  /**
   * Per weekday (0 = Sun): false when the report was pulled before that day was over, so its
   * number is partial and must not be used for forecasting. Missing = all days complete.
   */
  completeDays?: boolean[]
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
  /** Hand-edited lines only; everything else follows the live suggestion. */
  lines: Record<string, OrderLine>
  savedAt: string
  /**
   * Set by "Mark as ordered": what was actually ordered, frozen (suggestions keep moving as counts
   * and sales come in). Used to work out what really sold between counts.
   */
  placed?: { at: string; quantities: Record<string, number> }
}

/**
 * Promo stock the warehouse sends for an ad without the store ordering it: `total` units spread
 * evenly over `deliveries` deliveries, starting with the delivery on `start`.
 */
export interface Distro {
  total: number
  deliveries: number
  start: string
}

/** Items in one week's flyer. Ad weeks run Thursday to Wednesday; the id is the Thursday's date. */
export interface Promo {
  weekStart: string
  /** itemId → promo settings; `lift` (% more sales) overrides the learned/default lift when set. */
  items: Record<string, { lift?: number | null; distro?: Distro | null }>
}
