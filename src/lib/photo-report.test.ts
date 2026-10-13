import { describe, expect, it } from 'vitest'
import type { Item } from '../types'
import { catalogueFromPhotos, salesFromPhotos, type PhotoReading, type PhotoRow } from './photo-report'

const row = (upc: string, description: string, size: string, week: number[], unitsSold: number | null, extra: Partial<PhotoRow> = {}): PhotoRow => {
  const [sun, mon, tue, wed, thu, fri, sat] = week
  return { upc, vendor_code: '12088001', description, size, sun, mon, tue, wed, thu, fri, sat, units_sold: unitsSold, discontinued: false, ...extra }
}

describe('salesFromPhotos', () => {
  // Rows copied from the Oct 13 photo of the 7-day report.
  const page1: PhotoReading = { report_type: 'sales_7_days', date_from: '2026-10-04', date_to: '2026-10-10', rows: [
    row('0005530011000', 'Beatr.homogenize milk', '21 2000ML', [1, 0, 0, 0, 3, 4, 3], 11),
    row('0005530011101', 'Beatr.2% milk', '41 4000ML', [22, 29, 15, 26, 57, 51, 66], 266),
  ] }
  const page2: PhotoReading = { report_type: 'sales_7_days', date_from: null, date_to: null, rows: [
    row('5530011101', 'Beatr.2% milk', '41 4000ML', [22, 29, 15, 26, 57, 51, 60], 266), // misread copy from an overlapping photo
    row('0006820020290', 'Lactan.whipping cr.35%', '473ml 473M', [17, 49, 59, 46, 68, 78, 22], 339),
  ] }

  it('merges photos by UPC, keeping the copy that adds up', () => {
    const report = salesFromPhotos([page1, page2])!
    expect(report.weekStart).toBe('2026-10-04')
    expect(report.rows.map(r => [r.name, r.days.join(','), r.total, r.mismatch])).toEqual([
      ['Beatr.homogenize milk 2L', '1,0,0,0,3,4,3', 11, false],
      ['Beatr.2% milk 4L', '22,29,15,26,57,51,66', 266, false],
      ['Lactan.whipping cr.35% 473ml', '17,49,59,46,68,78,22', 339, false],
    ])
  })

  it('returns null when no photo is a sales report', () => {
    expect(salesFromPhotos([{ report_type: 'order_sheet', date_from: null, date_to: null, rows: [] }])).toBeNull()
  })
})

describe('catalogueFromPhotos', () => {
  it('lists order-sheet items, flags yogurt/discontinued and ones already on the list', () => {
    const items = [{ id: 'x', code: '0005530011001', vendorCode: '' }] as Item[]
    const reading: PhotoReading = { report_type: 'order_sheet', date_from: '2026-10-13', date_to: '2026-10-13', rows: [
      row('0005530011001', 'Beatr.milk 2%', '2l 2000ML', [0, 0, 0, 0, 0, 0, 0], null, { vendor_code: null }),
      row('0006820010077', 'Beatr.0.25% buttermilk', '1l 1000ML', [0, 0, 0, 0, 0, 0, 0], null, { vendor_code: null }),
      row('0005782517511', 'Ast.Orig.balkan plain yog.', 'DISC 175G', [0, 0, 0, 0, 0, 0, 0], null, { vendor_code: null, discontinued: true }),
      row('0006820044250', 'Ast.Orig.6% lact.f.plain balk.yog.', 'DISC 650G', [0, 0, 0, 0, 0, 0, 0], null, { vendor_code: null }),
    ] }
    expect(catalogueFromPhotos([reading], items).map(r => [r.name, r.suggestSkip, r.existingId])).toEqual([
      ['Beatr.milk 2% 2L', false, 'x'],
      ['Beatr.0.25% buttermilk 1L', false, null],
      ['Ast.Orig.balkan plain yog. DISC 175G', true, null],
      ['Ast.Orig.6% lact.f.plain balk.yog. DISC 650G', true, null],
    ])
  })
})
