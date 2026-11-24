import { describe, expect, it } from 'vitest'
import { editorChrome, PALETTES, type EditorPalette } from '../../src/components/editor/editorTheme'

// WCAG 2.x contrast, implemented from the spec: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
type RGB = [number, number, number]
const hex = (c: string): RGB => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB
const channel = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
/** rgba(r, g, b, a) drawn over an opaque background */
function over(rgba: string, bg: RGB): RGB {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgba)!
  const a = Number(m[4])
  return [1, 2, 3].map((i) => Math.round(Number(m[i]) * a + bg[i - 1]! * (1 - a))) as RGB
}

const WCAG_AA = 4.5
const TOKENS = ['foreground', 'keyword', 'string', 'number', 'comment', 'operator', 'definition', 'builtin', 'property', 'punctuation', 'invalid'] as const

/** Every background a code token can end up on: plain, active line, and either row-highlight over each. */
function backgrounds(p: EditorPalette): Record<string, RGB> {
  const bg = hex(p.background)
  const active = hex(p.activeLine)
  return {
    background: bg,
    'active line': active,
    'hovered row': over(p.hoverLine, bg),
    'selected row': over(p.selectedLine, bg),
    'hovered row on active line': over(p.hoverLine, active),
    'selected row on active line': over(p.selectedLine, active),
  }
}

describe.each(Object.entries(PALETTES))('editor palette: %s', (_name, p) => {
  const bgs = backgrounds(p)

  for (const token of TOKENS) {
    it(`${token} text is at least ${WCAG_AA}:1 on every background it can appear on`, () => {
      const fg = hex(p[token])
      const worst = Object.entries(bgs)
        .map(([name, bg]) => ({ name, r: ratio(fg, bg) }))
        .sort((a, b) => a.r - b.r)[0]!
      expect(worst.r, `${token} ${p[token]} on ${worst.name}: ${worst.r.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA)
    })
  }

  it('line numbers are legible on the gutter, and the active line number on its highlight', () => {
    expect(ratio(hex(p.gutterForeground), hex(p.gutterBackground))).toBeGreaterThanOrEqual(WCAG_AA)
    expect(ratio(hex(p.gutterActiveForeground), hex(p.activeLine))).toBeGreaterThanOrEqual(WCAG_AA)
  })

  it('selected text stays readable', () => {
    expect(ratio(hex(p.foreground), hex(p.selection))).toBeGreaterThanOrEqual(WCAG_AA)
  })

  it('the selected-row bar is visible against the page (non-text contrast, 3:1)', () => {
    expect(ratio(hex(p.selectedBar), hex(p.background))).toBeGreaterThanOrEqual(3)
  })

  it('the row highlights are distinguishable from each other and from the plain background', () => {
    const base = hex(p.background)
    expect(ratio(bgs['selected row']!, base)).toBeGreaterThan(ratio(bgs['hovered row']!, base))
    expect(bgs['hovered row']).not.toEqual(base)
  })
})

describe('the two palettes', () => {
  it('are really a light and a dark theme', () => {
    expect(luminance(hex(PALETTES.light.background))).toBeGreaterThan(0.8)
    expect(luminance(hex(PALETTES.dark.background))).toBeLessThan(0.1)
  })

  it('keep the same token colours distinct from each other (a keyword is not a string)', () => {
    for (const p of Object.values(PALETTES)) {
      const colours = [p.keyword, p.string, p.number, p.operator, p.definition, p.builtin]
      expect(new Set(colours).size).toBe(colours.length)
    }
  })
})

describe('editorChrome', () => {
  it('is a list of extensions (accessible name + per-theme row highlights)', () => {
    expect(Array.isArray(editorChrome)).toBe(true)
    expect(editorChrome.length).toBe(2)
  })
})
