import { describe, expect, it } from 'vitest'
import { parseSalesLines, parseSalesTable } from './sales-parse'

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
      { name: 'LACTANTIA 2L 2%', days: [5, 6, 7, 8, 9, 10, 11], total: 56, mismatch: false },
      { name: 'BEATRICE 4L HOMO', days: [1, 2, 3, 4, 5, 6, 7], total: 28, mismatch: false },
    ])
    expect(report.weekStart).toBeNull()
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
  it('splits trailing numbers from the name', () => {
    const report = parseSalesLines([
      'Store 123 Week of 09/20/2026',
      'Item Sun Mon Tue Wed Thu Fri Sat Total',
      'LACTANTIA 2L 3.25% 4 5 6 7 8 9 10 49',
      'BEATRICE CREAM 35% 1L 1 0 2 0 1 0 3 7',
      'TOTAL 5 5 8 7 9 9 13 56',
    ])
    expect(report.weekStart).toBe('2026-09-20')
    expect(report.rows).toEqual([
      { name: 'LACTANTIA 2L 3.25%', days: [4, 5, 6, 7, 8, 9, 10], total: 49, mismatch: false },
      { name: 'BEATRICE CREAM 35% 1L', days: [1, 0, 2, 0, 1, 0, 3], total: 7, mismatch: false },
    ])
  })

  it('keeps extra leading numbers in the name and accepts reports without totals', () => {
    const report = parseSalesLines(['MILK 1 2 3 4 5 6 7 8 36', 'NO TOTAL 1 1 1 1 1 1 1'])
    expect(report.rows[0]).toMatchObject({ name: 'MILK 1', days: [2, 3, 4, 5, 6, 7, 8], total: 36, mismatch: true })
    expect(report.rows[1]).toMatchObject({ name: 'NO TOTAL', total: null, mismatch: false })
  })
})
