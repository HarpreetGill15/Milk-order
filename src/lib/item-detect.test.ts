import { describe, expect, it } from 'vitest'
import { detectBrand, detectSize, normalizeName } from './item-detect'

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
