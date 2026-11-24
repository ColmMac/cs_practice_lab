import type { Value } from '../../core/types'

/** Python-style repr of a string literal: prefers single quotes, like repr(). */
export function pyStr(s: string): string {
  const useDouble = s.includes("'") && !s.includes('"')
  const q = useDouble ? '"' : "'"
  let out = ''
  for (const ch of s) {
    if (ch === '\\') out += '\\\\'
    else if (ch === q) out += `\\${q}`
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch.charCodeAt(0) < 32) out += `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
    else out += ch
  }
  return q + out + q
}

/** Formats a Value the way Python's repr() would (what exam answers are written in). */
export function formatPythonValue(v: Value): string {
  switch (v.k) {
    case 'none':
      return 'None'
    case 'bool':
      return v.v ? 'True' : 'False'
    case 'int':
    case 'float':
      return v.v
    case 'str':
      return pyStr(v.v) + (v.truncated ? '…' : '')
    case 'list':
      return `[${items(v.items, v.truncated)}]`
    case 'tuple':
      return v.items.length === 1 && !v.truncated ? `(${items(v.items)},)` : `(${items(v.items, v.truncated)})`
    case 'set':
      return v.items.length === 0 ? 'set()' : `{${items(v.items, v.truncated)}}`
    case 'frozenset':
      return v.items.length === 0 ? 'frozenset()' : `frozenset({${items(v.items, v.truncated)}})`
    case 'dict': {
      const body = v.entries.map(([k, x]) => `${formatPythonValue(k)}: ${formatPythonValue(x)}`).join(', ')
      return `{${body}${v.truncated ? ', …' : ''}}`
    }
    case 'object': {
      const body = Object.entries(v.fields)
        .map(([k, x]) => `${k}=${formatPythonValue(x)}`)
        .join(', ')
      return `${v.type}(${body})`
    }
    case 'cycle':
      return '[...]'
    case 'opaque':
      return v.repr
  }
}

function items(list: Value[], truncated?: number): string {
  return list.map(formatPythonValue).join(', ') + (truncated ? ', …' : '')
}
