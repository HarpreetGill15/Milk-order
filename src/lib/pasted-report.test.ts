import { describe, expect, it } from 'vitest'
import { parsePastedReadings } from './pasted-report'

const sales = '{"report_type":"sales_7_days","date_from":"2026-10-04","date_to":"2026-10-10","rows":[\n{"upc":"0005530011000","vendor_code":"12088001","description":"Beatr.homogenize milk","size":"2l 2000ML","sun":1,"mon":0,"tue":0,"wed":0,"thu":3,"fri":4,"sat":3,"units_sold":11,"discontinued":false}\n]}'

describe('parsePastedReadings', () => {
  it('reads a whole Claude reply with prose around the code block', () => {
    const { readings, error } = parsePastedReadings(`Here is the data:\n\n\`\`\`json\n[${sales}]\n\`\`\`\n\nLet me know if anything looks off.`)
    expect(error).toBeNull()
    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({ report_type: 'sales_7_days', date_from: '2026-10-04' })
    expect(readings[0].rows[0]).toMatchObject({ upc: '0005530011000', vendor_code: '12088001', sun: 1, thu: 3, units_sold: 11 })
  })

  it('reads bare JSON, a single object, and several code blocks', () => {
    expect(parsePastedReadings(sales).readings).toHaveLength(1)
    expect(parsePastedReadings(`\`\`\`json\n${sales}\n\`\`\`\nand\n\`\`\`json\n${sales}\n\`\`\``).readings).toHaveLength(2)
  })

  it('tolerates a days array, string numbers and a missing report type', () => {
    const { readings } = parsePastedReadings('{"rows":[{"upc":"0006820010077","description":"Beatr.0.25% buttermilk","size":"1l 1000ML","days":[0,0,0,0,0,0,0],"units_sold":null},{"upc":"5530011001","description":"Beatr.milk 2%","size":"2l 2000ML","days":["5","5",2,2,1,5,6],"units_sold":"26"}]}')
    expect(readings[0].report_type).toBe('sales_7_days')
    expect(readings[0].rows[1]).toMatchObject({ sun: 5, mon: 5, sat: 6, units_sold: 26, vendor_code: null })
  })

  it('marks DISC sizes as discontinued', () => {
    const { readings } = parsePastedReadings('{"report_type":"order_sheet","rows":[{"upc":"0005782517503","description":"Ast.Orig.peach fr.buttom yog.","size":"DISC 175G"}]}')
    expect(readings[0].rows[0].discontinued).toBe(true)
  })

  it('explains when nothing usable was pasted', () => {
    expect(parsePastedReadings('Sorry, I can only see part of the photo.').error).toMatch(/Couldn't find/)
    expect(parsePastedReadings('   ').error).toMatch(/Paste/)
  })
})
