import { describe, expect, it } from 'vitest'
import { parseSalesCells, parseSalesLines, parseSalesTable, type PdfCell } from './sales-parse'

const cell = (x: number, text: string, width = 20): PdfCell => ({ x: x - width / 2, width, text })

/** Layout copied from the BDMS "Item Sales by Vendor 7 Days" screen: blank cells for days with no sales. */
const bdmsRows: PdfCell[][] = [
  [cell(460, 'Item Sales by Vendor 7 Days', 800)],
  [cell(100, 'Date:', 60), cell(310, '2026/09/20', 160), cell(430, 'to', 30), cell(560, '2026/09/26', 160)],
  [cell(1814, 'Unit', 60)],
  [cell(310, 'Description', 220), cell(1017, 'Sun'), cell(1127, 'Mon'), cell(1244, 'Tue'), cell(1343, 'Wed'), cell(1459, 'Thu'), cell(1577, 'Fri'), cell(1689, 'Sat'), cell(1809, 'Sold', 60), cell(1932, 'Sales', 70)],
  [cell(185, '0000202277', 180), cell(510, 'LACTALIS CANADA INC', 370)],
  [cell(175, '0005530011001', 180), cell(357, '12088501', 100), cell(530, 'Beatr.milk 2%', 180), cell(828, '2l 2000ML', 120), cell(1062, '3'), cell(1806, '3'), cell(1930, '$16.47', 70)],
  [cell(195, '0005530011100', 180), cell(373, '12087901', 100), cell(580, 'Beatr.homogenize milk', 250), cell(877, '4l 4000ML', 120), cell(1054, '23'), cell(1147, '4'), cell(1350, '6'), cell(1690, '12'), cell(1802, '45'), cell(1905, '$200.88', 70)],
  [cell(235, '0005974993646', 180), cell(415, '27870601', 100), cell(650, 'Selection whipping cream 35%', 300), cell(910, '473ml 473M', 120), cell(1060, '14'), cell(1138, '2'), cell(1790, '16'), cell(1860, '$63.84', 70)],
  [cell(235, '0005974995135', 180), cell(415, '30695601', 100), cell(570, 'Selection 5% cof.cr.', 220), cell(860, '1l 1000ML', 120), cell(1580, '7'), cell(1800, '6'), cell(1930, '$20.00', 70)],
  [cell(300, 'Vendor Total', 150), cell(1060, '40'), cell(1147, '6'), cell(1802, '70'), cell(1930, '$300.00', 70)],
]

describe('parseSalesCells (BDMS PDF)', () => {
  const report = parseSalesCells(bdmsRows)!

  it('reads codes, a clean name and puts each number under its own day', () => {
    expect(report.weekStart).toBe('2026-09-20')
    expect(report.rows[0]).toEqual({ upc: '0005530011001', vendorCode: '12088501', name: 'Beatr.milk 2% 2L', days: [3, 0, 0, 0, 0, 0, 0], total: 3, mismatch: false })
    expect(report.rows[1]).toMatchObject({ name: 'Beatr.homogenize milk 4L', days: [23, 4, 0, 6, 0, 0, 12], total: 45, mismatch: false })
    expect(report.rows[2]).toMatchObject({ name: 'Selection whipping cream 35% 473ml', days: [14, 2, 0, 0, 0, 0, 0], total: 16 })
    expect(report.rows[3]).toMatchObject({ name: 'Selection 5% cof.cr. 1L', days: [0, 0, 0, 0, 0, 7, 0], total: 6, mismatch: true })
  })

  it('skips the vendor heading and total rows', () => {
    expect(report.rows.map(row => row.name)).toHaveLength(4)
  })

  it('returns null when there is no Sun…Sat header', () => {
    expect(parseSalesCells([[cell(10, 'hello')]])).toBeNull()
  })
})

describe('parseSalesTable', () => {
  it('reads name, Sun…Sat and Total, skipping totals rows', () => {
    const report = parseSalesTable([
      ['Weekly Sales Report'],
      ['Item', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Total'],
      ['LACTANTIA 2L 2%', 5, 6, 7, 8, 9, 10, 11, 56],
      ['BEATRICE 4L HOMO', '1', '2', '3', '4', '5', '6', '7', '28'],
      ['Grand Total', 6, 8, 10, 12, 14, 16, 18, 84],
    ])
    expect(report.rows).toEqual([
      { upc: '', vendorCode: '', name: 'LACTANTIA 2L 2%', days: [5, 6, 7, 8, 9, 10, 11], total: 56, mismatch: false },
      { upc: '', vendorCode: '', name: 'BEATRICE 4L HOMO', days: [1, 2, 3, 4, 5, 6, 7], total: 28, mismatch: false },
    ])
  })

  it('handles a BDMS-style export: codes in their own columns, blank days, Unit Sold and Sales', () => {
    const report = parseSalesTable([
      ['Item Sales by Vendor 7 Days'],
      ['Date:', '2026/09/20', 'to', '2026/09/26'],
      ['Description', '', '', '', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Unit Sold', 'Sales'],
      ['0000202277', 'LACTALIS CANADA INC'],
      [5530011001, 12088501, 'Beatr.milk 2%', '2l 2000ML', 3, '', '', '', '', '', '', 3, 16.47],
    ])
    expect(report.weekStart).toBe('2026-09-20')
    expect(report.rows).toEqual([{ upc: '5530011001', vendorCode: '12088501', name: 'Beatr.milk 2% 2L', days: [3, 0, 0, 0, 0, 0, 0], total: 3, mismatch: false }])
  })

  it('handles date headers in any column order and flags total mismatches', () => {
    const report = parseSalesTable([
      ['Description', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-20', 'Total'],
      ['Cream 35%', 1, 1, 1, 1, 1, 1, 9, 99],
    ])
    expect(report.weekStart).toBe('2026-09-20')
    expect(report.rows[0].days).toEqual([9, 1, 1, 1, 1, 1, 1])
    expect(report.rows[0].mismatch).toBe(true)
  })

  it('warns when there is no day header', () => {
    expect(parseSalesTable([['a', 'b']]).warnings.length).toBe(1)
  })
})

describe('parseSalesLines', () => {
  it('splits trailing numbers from the name and ignores dollar amounts', () => {
    const report = parseSalesLines([
      'Store 123 Week of 09/20/2026',
      'Item Sun Mon Tue Wed Thu Fri Sat Total',
      'LACTANTIA 2L 3.25% 4 5 6 7 8 9 10 49 $120.50',
      'BEATRICE CREAM 35% 1L 1 0 2 0 1 0 3 7',
      'TOTAL 5 5 8 7 9 9 13 56',
    ])
    expect(report.weekStart).toBe('2026-09-20')
    expect(report.rows.map(row => [row.name, row.days, row.total])).toEqual([
      ['LACTANTIA 2L 3.25%', [4, 5, 6, 7, 8, 9, 10], 49],
      ['BEATRICE CREAM 35% 1L', [1, 0, 2, 0, 1, 0, 3], 7],
    ])
  })

  it('keeps extra leading numbers in the name and accepts reports without totals', () => {
    const report = parseSalesLines(['MILK 1 2 3 4 5 6 7 8 36', 'PLAIN MILK 1 1 1 1 1 1 1'])
    expect(report.rows[0]).toMatchObject({ name: 'MILK 1', days: [2, 3, 4, 5, 6, 7, 8], total: 36, mismatch: true })
    expect(report.rows[1]).toMatchObject({ name: 'PLAIN MILK', total: null, mismatch: false })
  })
})
