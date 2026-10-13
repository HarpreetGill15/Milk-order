import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * POST { image: base64 JPEG/PNG/WebP, mediaType } → the report rows Claude reads off a photo of
 * the BDMS screen. Server-side so the Anthropic API key never reaches the phone.
 *
 * Env: ANTHROPIC_API_KEY (required). PHOTO_PIN (optional): when set, requests must send the same
 * value in the `x-photo-pin` header, so a stranger with the app link can't spend API credit.
 */

const nullable = (type: 'string' | 'integer') => ({ anyOf: [{ type }, { type: 'null' }] })
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['report_type', 'date_from', 'date_to', 'rows'],
  properties: {
    report_type: { type: 'string', enum: ['sales_7_days', 'order_sheet', 'other'] },
    date_from: { ...nullable('string'), description: 'Report start date as YYYY-MM-DD, or null if not visible' },
    date_to: { ...nullable('string'), description: 'Report end date as YYYY-MM-DD, or null if not visible' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['upc', 'vendor_code', 'description', 'size', ...DAYS, 'units_sold', 'discontinued'],
        properties: {
          upc: { type: 'string', description: 'The 13-digit code at the start of the row, exactly as printed, leading zeros kept' },
          vendor_code: { ...nullable('string'), description: '8-digit vendor code (sales report only), else null' },
          description: { type: 'string' },
          size: { type: 'string', description: 'Size column exactly as printed, e.g. "2l 2000ML", "473ml 473ML", "DISC 175G"' },
          ...Object.fromEntries(DAYS.map(day => [day, { type: 'integer', description: `Units sold on ${day}; 0 when the cell is blank` }])),
          units_sold: { ...nullable('integer'), description: 'Unit Sold column (sales report), null on an order sheet' },
          discontinued: { type: 'boolean', description: 'True when the size column starts with DISC' },
        },
      },
    },
  },
}

const SYSTEM = `You transcribe photos of a grocery store's BDMS back-office screen. The photos are taken with a phone pointed at a monitor, so expect glare, moiré, slight angles and rows cut off at the edges.

There are two report types, both for the dairy vendor LACTALIS CANADA INC:

1. "Item Sales by Vendor 7 Days" (the window may be titled "Movement By Date"). Each row: 13-digit UPC, 8-digit vendor code, description, size (e.g. "2l 2000ML"), then the units sold on each day in columns Sun, Mon, Tue, Wed, Thu, Fri, Sat, then Unit Sold (the row's total) and Sales in dollars. Days with no sales are left BLANK, so a row may show only two or three numbers. Put each number in the day whose column it sits under, judging by its horizontal position against the column headers or, when the headers are off-screen, against the numbers in the other rows. A blank day is 0. The seven days must add up to Unit Sold: re-check any row where they don't before answering.

2. "Order Sheet by Vendor". Columns: Status Code (the 13-digit UPC), Description, size, Cost, Size (pack), Price, Margin, Replenishment Level/Amount, Current Inventory, Sold. There is no vendor code and no daily sales: set vendor_code to null, every day to 0 and units_sold to null.

Rules:
- Copy UPCs digit for digit, keeping the leading zeros.
- Sizes use a lowercase letter l for litres: "2l 2000ML", "1.5l 1500ML". What looks like "21 2000ML" or "11 1000ML" is "2l" or "1l".
- discontinued is true when the size column starts with DISC.
- One entry per row, top to bottom. Skip the vendor heading row, totals, "No Order" rows, and rows cut off so badly that their numbers can't be read.
- date_from and date_to come from the "Date: YYYY/MM/DD to YYYY/MM/DD" line when it is visible; otherwise null.
- If the photo is not one of these reports, return report_type "other" with no rows.`

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'Photo reading is not set up yet: add ANTHROPIC_API_KEY in the Vercel project settings.' })
  const pin = process.env.PHOTO_PIN
  if (pin && req.headers['x-photo-pin'] !== pin) return res.status(401).json({ error: 'Wrong or missing store PIN.' })

  const { image, mediaType } = (req.body ?? {}) as { image?: unknown; mediaType?: unknown }
  if (typeof image !== 'string' || image.length < 100 || image.length > 6_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return res.status(400).json({ error: 'Send one photo as base64 (under ~4 MB).' })
  }
  if (!MEDIA_TYPES.includes(mediaType as MediaType)) return res.status(400).json({ error: 'Photo must be JPEG, PNG or WebP.' })

  const client = new Anthropic()
  try {
    const message = await client.beta.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as MediaType, data: image } },
            { type: 'text', text: 'Transcribe this report photo.' },
          ],
        }],
      })
      .finalMessage()

    if (message.stop_reason === 'refusal') return res.status(422).json({ error: "The photo couldn't be read. Try another photo." })
    if (message.stop_reason === 'max_tokens') return res.status(422).json({ error: 'The photo has too many rows to read at once. Take it in two halves.' })
    const text = message.content.find(block => block.type === 'text')
    if (!text || text.type !== 'text') return res.status(502).json({ error: 'No answer came back. Try again.' })
    return res.status(200).json(JSON.parse(text.text))
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'The ANTHROPIC_API_KEY in Vercel is not valid.' })
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Too many photos at once. Wait a minute and try again.' })
    if (error instanceof Anthropic.BadRequestError) return res.status(400).json({ error: `The photo was rejected: ${error.message}` })
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${error.status ?? ''}. Try again.` })
    if (error instanceof SyntaxError) return res.status(502).json({ error: 'The answer was not valid JSON. Try again.' })
    throw error
  }
}
