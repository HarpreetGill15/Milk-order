import { describe, expect, it } from 'vitest'
import { detectBrand, detectSize, nameLooksLikeCode, normalizeCode, normalizeName, parseIdentity } from './item-detect'

describe('item detection', () => {
  it.each([
    ['LACTANTIA 2L 2%', '2L'], ['Beatrice 4 L Homo', '4L'], ['LACT 1L SKIM', '1L'],
    ['Beatrice Cream 35% 1L', 'Cream'], ['Lactantia 10% Half & Half 473ml', 'Cream'], ['Chocolate 500ml', 'Other'],
    ['LACT 2L 3.25%', '2L'],
  ])('%s → %s', (name, size) => expect(detectSize(name)).toBe(size))

  it('detects brand', () => {
    expect(detectBrand('LACTANTIA 2L')).toBe('Lactantia')
    expect(detectBrand('Béatrice 4L')).toBe('Béatrice')
    expect(detectBrand('BEATRICE 4L')).toBe('Béatrice')
    expect(detectBrand('Natrel 2L')).toBe('Other')
  })

  it('normalizes names for matching', () => {
    expect(normalizeName('  Béatrice   2L-2% ')).toBe(normalizeName('BEATRICE 2L 2%'))
  })
})

describe('BDMS report names', () => {
  it.each([
    ['0005530011001 12088501 Beatr.milk 2% 2l 2000ML', { upc: '0005530011001', vendorCode: '12088501', name: 'Beatr.milk 2% 2L' }],
    ['0005974993646 27870601 Selection whipping cream 35% 473ml 473M', { upc: '0005974993646', vendorCode: '27870601', name: 'Selection whipping cream 35% 473ml' }],
    ['Lactantia 2L 2%', { upc: '', vendorCode: '', name: 'Lactantia 2L 2%' }],
  ])('%s', (text, expected) => expect(parseIdentity(text)).toEqual(expected))

  it.each([
    ['Beatr.milk 2% 2L', 'Béatrice', '2L'], ['Beatr.homogenize milk 4L', 'Béatrice', '4L'],
    ['Beatr.part.skim 1% choc.milk 1L', 'Béatrice', '1L'], ['Selection 10% coffee cream 1L', 'Selection', 'Cream'],
    ['Selection 5% cof.cr. 1L', 'Selection', 'Cream'], ['Selection whipping cream 35% 473ml', 'Selection', 'Cream'],
    ['Irrs.eggnog 2% M.F. 1L', 'Other', '1L'],
  ])('%s → %s %s', (name, brand, size) => {
    expect(detectBrand(name)).toBe(brand)
    expect(detectSize(name)).toBe(size)
  })

  it('compares codes without leading zeros', () => {
    expect(normalizeCode('0005530011001')).toBe(normalizeCode('5530011001'))
    expect(nameLooksLikeCode('0005530011001')).toBe(true)
    expect(nameLooksLikeCode('Beatr.milk 2%')).toBe(false)
  })
})
