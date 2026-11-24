import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8')

describe('static hosting config', () => {
  it('_redirects is a single well-formed SPA fallback rule', () => {
    const rules = read('_redirects').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    expect(rules).toHaveLength(1)
    expect(rules[0]!.trim().split(/\s+/)).toEqual(['/*', '/index.html', '200'])
  })

  it('_headers still has its /* block with the CSP', () => {
    const lines = read('_headers').split(/\r?\n/)
    expect(lines[0]!.trim()).toBe('/*')
    expect(lines.some((l) => /^\s+Content-Security-Policy:/.test(l))).toBe(true)
  })
})
