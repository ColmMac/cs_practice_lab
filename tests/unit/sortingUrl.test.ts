import { describe, expect, it } from 'vitest'
import { parseSortingUrl, sortingUrlParams } from '../../src/core/algorithms'

const parse = (q: string) => parseSortingUrl(new URLSearchParams(q))

describe('parseSortingUrl', () => {
  it('defaults to bubble sort with no overrides', () => {
    expect(parse('')).toEqual({ algo: 'bubble', data: null, target: null, quiz: false })
  })
  it('reads algo, data, target and quiz', () => {
    expect(parse('algo=binary&data=3,9,10&target=9&quiz=1')).toEqual({
      algo: 'binary',
      data: [3, 9, 10],
      target: 9,
      quiz: true,
    })
  })
  it('falls back for anything odd', () => {
    const s = parse('algo=__proto__&data=1,x&target=1.5&quiz=yes')
    expect(s).toEqual({ algo: 'bubble', data: null, target: null, quiz: false })
    expect(parse('data=1').data).toBeNull() // too short
    expect(parse('data=' + '1,'.repeat(13)).data).toBeNull() // too long
    expect(parse('data=5000,1').data).toBeNull() // out of range
  })
})

describe('sortingUrlParams', () => {
  const base: Parameters<typeof sortingUrlParams>[0] = { algo: 'bubble', data: [5, 1, 4, 2, 8], target: 4, search: false, quiz: false }
  it('leaves defaults out', () => {
    expect(sortingUrlParams(base)).toEqual({})
  })
  it('writes what differs, and the target only for searches', () => {
    expect(sortingUrlParams({ ...base, algo: 'linear', data: [1, 2], target: 2, search: true, quiz: true })).toEqual({
      algo: 'linear',
      data: '1,2',
      target: '2',
      quiz: '1',
    })
    expect(sortingUrlParams({ ...base, data: [1, 2], target: 2 })).toEqual({ data: '1,2' })
  })
  it('round-trips', () => {
    const q = new URLSearchParams(sortingUrlParams({ ...base, algo: 'binary', data: [3, 9, 10], target: 9, search: true, quiz: true }))
    expect(parseSortingUrl(q)).toEqual({ algo: 'binary', data: [3, 9, 10], target: 9, quiz: true })
  })
})
