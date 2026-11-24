import type { Value } from '../types'
import { outputLines } from './grade'
import type { Truth } from './types'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const NOUN: Record<string, [string, string]> = {
  int: ['int', 'ints'],
  float: ['float', 'floats'],
  str: ['string', 'strings'],
  bool: ['bool', 'bools'],
  none: ['None', 'Nones'],
  list: ['list', 'lists'],
  tuple: ['tuple', 'tuples'],
  set: ['set', 'sets'],
  frozenset: ['frozenset', 'frozensets'],
  dict: ['dict', 'dicts'],
}

function items(list: Value[]): string {
  const kinds = new Set(list.map((v) => v.k))
  if (kinds.size === 1) {
    const [one, many] = NOUN[[...kinds][0]!] ?? ['item', 'items']
    return list.length === 1 ? `1 ${one}` : `${list.length} ${many}`
  }
  return plural(list.length, 'item')
}

/** A nudge that gives the SHAPE of the answer, not the answer: "a list of 4 ints", "a string of 5 characters". */
export function hintFor(truth: Truth): string {
  if (truth.kind === 'output') {
    const lines = outputLines(truth.text)
    const chars = lines.reduce((n, l) => n + l.length, 0)
    if (lines.length <= 1) return `text, ${plural(chars, 'character')}`
    return `${lines.length} lines of text, ${plural(chars, 'character')} in all`
  }
  const v = truth.value
  switch (v.k) {
    case 'none':
      return 'None'
    case 'bool':
      return 'True or False'
    case 'int':
      return 'a whole number (an int)'
    case 'float':
      return 'a decimal number (a float)'
    case 'str':
      return v.v.length === 0 ? 'an empty string' : `a string of ${plural(v.v.length, 'character')}`
    case 'list':
    case 'tuple':
    case 'set':
    case 'frozenset': {
      const name = NOUN[v.k]![0]
      return v.items.length === 0 ? `an empty ${name}` : `a ${name} of ${items(v.items)}`
    }
    case 'dict':
      return v.entries.length === 0 ? 'an empty dict' : `a dict with ${plural(v.entries.length, 'key')}`
    case 'object':
      return `a ${v.type} object`
    case 'cycle':
      return 'a list that contains itself'
    case 'opaque':
      return `a ${v.type}`
  }
}
