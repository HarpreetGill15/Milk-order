import type { PhotoReading, PhotoRow } from './photo-report'

/**
 * Instructions copied into the Claude app together with the photos. Claude replies with the same
 * JSON shape /api/read-report returns, which the user pastes back into Milk Order. (The server
 * prompt in api/read-report.ts says the same things; keep them in step.)
 */
export const CLAUDE_APP_PROMPT = `Transcribe the attached photos of my store's BDMS screen into JSON for my milk ordering app.

The photos show one of two reports for the dairy vendor LACTALIS CANADA INC:

1. "Item Sales by Vendor 7 Days" (window may say "Movement By Date"). Each row: 13-digit UPC, 8-digit vendor code, description, size (e.g. "2l 2000ML"), units sold on Sun, Mon, Tue, Wed, Thu, Fri, Sat, then Unit Sold (the row total) and Sales ($). Days with no sales are BLANK, so a row may show only a few numbers: put each number under the day column it sits under (by its horizontal position), and use 0 for blank days. The seven days must add up to Unit Sold, so re-check any row that doesn't.

2. "Order Sheet by Vendor": Status Code (the 13-digit UPC), Description, size, Cost, Size, Price, Margin, Replenishment, Current Inventory, Sold. No vendor code and no daily sales: vendor_code null, all days 0, units_sold null.

Rules:
- Copy UPCs digit for digit, keeping leading zeros.
- Sizes use a lowercase letter l for litres ("2l 2000ML"); "21 2000ML" or "11 1000ML" means 2l or 1l.
- discontinued is true when the size starts with DISC.
- One entry per row, top to bottom. Skip the vendor heading, totals, "No Order" rows and rows you can't read.
- date_from / date_to from the "Date: YYYY/MM/DD to YYYY/MM/DD" line as YYYY-MM-DD, or null if not visible.

Reply with ONLY one \`\`\`json code block holding an array with one object per photo, like this:
[{"report_type":"sales_7_days","date_from":null,"date_to":null,"rows":[
{"upc":"0005530011000","vendor_code":"12088001","description":"Beatr.homogenize milk","size":"2l 2000ML","sun":1,"mon":0,"tue":0,"wed":0,"thu":3,"fri":4,"sat":3,"units_sold":11,"discontinued":false}
]}]
report_type is "sales_7_days" or "order_sheet". Put each row on its own line.`

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const int = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? Math.round(number) : 0
}

function normalizeRow(raw: Record<string, unknown>): PhotoRow | null {
  const upc = String(raw.upc ?? '').replace(/\D/g, '')
  const description = String(raw.description ?? '').trim()
  if (!upc && !description) return null
  const size = String(raw.size ?? '').trim()
  // Accept either sun…sat fields or a 7-number "days" array.
  const dayArray = Array.isArray(raw.days) ? raw.days : null
  const days = Object.fromEntries(DAYS.map((day, i) => [day, int(dayArray ? dayArray[i] : raw[day])])) as Record<(typeof DAYS)[number], number>
  const unitsSold = raw.units_sold === null || raw.units_sold === undefined || raw.units_sold === '' ? null : int(raw.units_sold)
  const vendor = raw.vendor_code === null || raw.vendor_code === undefined ? '' : String(raw.vendor_code).replace(/\D/g, '')
  return { upc, vendor_code: vendor || null, description, size, ...days, units_sold: unitsSold, discontinued: raw.discontinued === true || /^disc\b/i.test(size) }
}

function normalizeReading(raw: unknown): PhotoReading | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { rows?: unknown }).rows)) return null
  const value = raw as Record<string, unknown> & { rows: unknown[] }
  const rows = value.rows.flatMap(row => (row && typeof row === 'object' ? [normalizeRow(row as Record<string, unknown>)] : [])).filter((row): row is PhotoRow => row !== null)
  const date = (field: unknown) => (typeof field === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(field) ? field : null)
  let type = value.report_type
  if (type !== 'sales_7_days' && type !== 'order_sheet') {
    // Missing or unknown type: any sales numbers means it's the 7-day report.
    type = rows.some(row => row.units_sold !== null || DAYS.some(day => row[day] > 0)) ? 'sales_7_days' : 'order_sheet'
  }
  return { report_type: type as PhotoReading['report_type'], date_from: date(value.date_from), date_to: date(value.date_to), rows }
}

/** JSON candidates in a pasted reply: ```json blocks if there are any, else the outermost [...] / {...}. */
function candidates(text: string): string[] {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1])
  if (fenced.length) return fenced
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  return start >= 0 && end > start ? [text.slice(start, end + 1)] : []
}

/** Reads what the user pasted from the Claude app: the whole reply, the code block, or bare JSON. */
export function parsePastedReadings(text: string): { readings: PhotoReading[]; error: string | null } {
  const readings: PhotoReading[] = []
  for (const candidate of candidates(text)) {
    let value: unknown
    try { value = JSON.parse(candidate) } catch { continue }
    for (const raw of Array.isArray(value) && !(value as unknown[]).some(v => v && typeof v === 'object' && 'upc' in v) ? value : [value]) {
      const reading = normalizeReading(raw)
      if (reading) readings.push(reading)
    }
  }
  if (readings.length === 0) {
    return { readings, error: text.trim() ? "Couldn't find the report data in what was pasted. Copy Claude's whole reply (or its code block) and paste again." : 'Paste Claude\'s reply first.' }
  }
  return { readings, error: null }
}
