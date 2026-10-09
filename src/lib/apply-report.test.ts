import { describe, expect, it } from 'vitest'
import type { Item } from '../types'
import { applyReport, applyReports, autoMatches, completeDaysFor } from './apply-report'
import type { ParsedSalesRow } from './sales-parse'

const row = (name: string, upc: string, sun: number, vendorCode = ''): ParsedSalesRow =>
  ({ name, upc, vendorCode, days: [sun, 0, 0, 0, 0, 0, 0], total: sun, mismatch: false })
const badItem: Item = { id: 'bad', name: '0005530011001', aliases: [], brand: 'Other', size: 'Other', orderStep: 1, code: '', vendorCode: '', walkOrder: 0, safetyStock: 0, active: true }

describe('applyReport', () => {
  it('repairs an item that was named after its UPC and fills in its codes', () => {
    const rows = [row('Beatr.milk 2% 2L', '5530011001', 3, '12088501')]
    const result = applyReport([badItem], rows, autoMatches([badItem], rows), { weekStart: '2026-09-20', fileName: 'a.pdf', today: '2026-10-09' })
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0]).toMatchObject({ id: 'bad', name: 'Beatr.milk 2% 2L', brand: 'Béatrice', size: '2L', orderStep: 9, code: '5530011001', vendorCode: '12088501' })
    expect(result.week.rows).toEqual([{ itemId: 'bad', days: [3, 0, 0, 0, 0, 0, 0], total: 3 }])
    expect(result.updatedCount).toBe(1)
  })

  it('marks days after the upload date as incomplete', () => {
    expect(completeDaysFor('2026-10-04', '2026-10-06')).toEqual([true, true, false, false, false, false, false])
  })
})

describe('applyReports', () => {
  it('matches items created by an earlier file in later files', () => {
    const result = applyReports([], [
      { rows: [row('Selection coffee cream 10% 1L', '5974990403', 4)], weekStart: '2026-09-27', fileName: 'b.pdf' },
      { rows: [row('Selection coffee cream 10% 1L', '5974990403', 6)], weekStart: '2026-09-20', fileName: 'a.pdf' },
    ], '2026-10-09')
    expect(result.newCount).toBe(1)
    expect(result.changed).toHaveLength(1)
    expect(result.weeks.map(w => [w.weekStart, w.rows[0].itemId])).toEqual([
      ['2026-09-20', result.changed[0].id],
      ['2026-09-27', result.changed[0].id],
    ])
  })
})
