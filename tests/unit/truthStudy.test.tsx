import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { askableCells, buildTruthTable, gradeTruthAnswer, parseProgram, truthMasks } from '../../src/core/logic'
import { TruthTablePage } from '../../src/components/truth/TruthTablePage'

const table = (src: string, intermediates = false) => buildTruthTable(parseProgram(src), { intermediates })
const HALF_ADDER = 'S = A XOR B; C = A AND B'

describe('gradeTruthAnswer', () => {
  it('accepts 0/1/T/F/true/false in either case, whatever notation the table shows', () => {
    for (const w of ['1', 't', 'T', 'true', 'TRUE', ' 1 ']) expect(gradeTruthAnswer(w, true, 'TF').state).not.toBe('incorrect')
    for (const w of ['0', 'f', 'F', 'false', 'False']) expect(gradeTruthAnswer(w, false, '01').state).not.toBe('incorrect')
    expect(gradeTruthAnswer('1', true, '01')).toEqual({ state: 'correct' })
    expect(gradeTruthAnswer('F', false, 'TF')).toEqual({ state: 'correct' })
  })

  it('gives "Almost" for the right value in the other notation, and says which one the table uses', () => {
    expect(gradeTruthAnswer('T', true, '01')).toEqual({ state: 'close', message: 'Right value, but this table uses 0 and 1.' })
    expect(gradeTruthAnswer('true', false, 'TF').state).toBe('incorrect')
    expect(gradeTruthAnswer('0', false, 'TF')).toEqual({ state: 'close', message: 'Right value, but this table uses T and F.' })
  })

  it('marks a wrong value or unreadable text incorrect, and never puts the answer in the message', () => {
    expect(gradeTruthAnswer('0', true, '01')).toEqual({ state: 'incorrect' })
    expect(gradeTruthAnswer('', true, '01')).toEqual({ state: 'incorrect', message: 'No answer entered.' })
    const g = gradeTruthAnswer('maybe', true, '01')
    expect(g.state).toBe('incorrect')
    expect(g.message).toBe('Answer with 0, 1, T or F.')
    for (const [text, truth, n] of [['T', true, '01'], ['0', false, 'TF'], ['x', false, '01']] as const) {
      const m = gradeTruthAnswer(text, truth, n).message ?? ''
      expect(m).not.toMatch(truth ? /\bis true\b|=\s*1/i : /\bis false\b|=\s*0/i)
    }
  })
})

describe('truth-table masks', () => {
  const ha = table(HALF_ADDER)

  it('inputs are never asked', () => {
    const cols = new Set(askableCells(ha).map((c) => c.colKey))
    expect([...cols]).toEqual(['o0', 'o1'])
  })

  it('outputs only, and intermediates + outputs', () => {
    const t = table('Q = (A AND B) OR NOT C', true) // intermediates: A AND B, NOT C
    expect(truthMasks(t, { mask: 'outputs', percent: 50 }, 1).size).toBe(8)
    expect(truthMasks(t, { mask: 'intermediates', percent: 50 }, 1).size).toBe(24)
  })

  it('random: an exact share, the same for the same seed, different for another', () => {
    const t = table('Q = (A AND B) OR NOT C', true)
    const a = truthMasks(t, { mask: 'random', percent: 25 }, 12345)
    expect(a.size).toBe(6) // 25% of 24
    expect([...truthMasks(t, { mask: 'random', percent: 25 }, 12345)].sort()).toEqual([...a].sort())
    expect([...truthMasks(t, { mask: 'random', percent: 25 }, 999)].sort()).not.toEqual([...a].sort())
    expect(truthMasks(t, { mask: 'random', percent: 1 }, 7).size).toBe(1) // at least one when asked for something
  })
})

// ── the page ──
beforeEach(() => localStorage.clear())
afterEach(cleanup)

function mount(path = '/truth-tables?preset=half-adder') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TruthTablePage />
    </MemoryRouter>,
  )
}
const boxes = () => screen.queryAllByRole('textbox', { name: /^Row \d+, / }) as HTMLInputElement[]
const verdicts = () =>
  boxes().map((b) => {
    const id = b.getAttribute('aria-describedby')
    return id ? (document.getElementById(id)?.textContent ?? '') : ''
  })
const start = () => userEvent.setup().click(screen.getByRole('button', { name: /study mode/i }))
/** All 8 boxes are up and the first has focus. That happens a frame later: left pending, it steals focus mid-test. */
const started = () =>
  waitFor(() => {
    expect(boxes()).toHaveLength(8)
    expect(document.activeElement).toBe(boxes()[0])
  })

describe('Truth Table Study Mode', () => {
  it('hides the outputs (4 rows × S, C = 8 boxes), focuses the first, and Exit restores the table', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /study mode/i }))
    await started()
    await user.click(screen.getByRole('button', { name: 'Exit study mode' }))
    expect(boxes()).toHaveLength(0)
    expect(screen.getByRole('table', { name: 'Truth table' })).toHaveTextContent('1')
  })

  it('grades a right and a wrong answer, and the feedback never contains the answer', async () => {
    mount()
    await start()
    const user = userEvent.setup()
    await started()
    // Half adder rows A,B → S,C. The boxes go in DOM order: row 1 S, row 1 C, row 2 S, row 2 C...
    const [r1s, , r2s] = boxes()
    await user.type(r1s!, '0') // 0 XOR 0 = 0: right
    await user.type(r2s!, '0') // 0 XOR 1 = 1: wrong
    await user.click(screen.getByRole('button', { name: 'Check answers' }))
    const v = verdicts()
    expect(v[0]).toMatch(/Correct/)
    expect(v[2]).toMatch(/Not correct/)
    expect(v[1]).toMatch(/Not correct — No answer entered\./)
    expect(screen.getByText(/Score: 1 \/ 8/)).toBeInTheDocument()
  })

  it('"Almost" for the other notation; a revealed cell leaves the score', async () => {
    mount()
    await start()
    const user = userEvent.setup()
    await started()
    await user.type(boxes()[0]!, 'F') // right value, table is 0/1
    await user.click(screen.getByRole('button', { name: 'Reveal Row 1, S' }))
    await user.type(boxes()[0]!, 'F') // the next box: row 1 C = 0
    await user.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(verdicts()[0]).toMatch(/Almost — Right value, but this table uses 0 and 1\./)
    expect(screen.getByText(/1 revealed .not scored./)).toBeInTheDocument()
    expect(screen.getByText(/Score: 0.5 \/ 7/)).toBeInTheDocument()
  })

  it('keeps the keyboard contract: Enter/↓ next, Shift+Enter/↑ previous, Alt+H hint, Alt+R reveal, Space types', async () => {
    mount()
    await start()
    const user = userEvent.setup()
    await started()
    const first = boxes()[0]!
    first.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(boxes()[2]) // down the column: row 2 S (row 1 C sits between them in DOM order)
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(document.activeElement).toBe(first)
    await user.keyboard('{ArrowDown}{ArrowUp}')
    expect(document.activeElement).toBe(first)

    await user.keyboard('{Alt>}h{/Alt}')
    expect(first.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(first.getAttribute('aria-describedby')!)).toHaveTextContent(/Hint: a single truth value/)

    await user.keyboard(' 1')
    expect(first.value).toBe(' 1') // a typed Space reaches the box

    const before = boxes().length
    await user.keyboard('{Alt>}r{/Alt}')
    expect(boxes()).toHaveLength(before - 1)
    expect(screen.getAllByTestId('revealed-cell')).toHaveLength(1)
    expect(document.activeElement).toBe(boxes()[1]) // moved down the column to row 2 S (row 1 C is now first in DOM order)
  })

  it('Enter on the last box goes to Check answers', async () => {
    mount()
    await start()
    const user = userEvent.setup()
    await started()
    boxes()[boxes().length - 1]!.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Check answers' }))
  })

  it('changing the expression ends the session', async () => {
    mount()
    await start()
    const user = userEvent.setup()
    await started()
    await user.click(screen.getByRole('radio', { name: 'T / F' }))
    await waitFor(() => expect(boxes()).toHaveLength(0))
    expect(screen.queryByRole('region', { name: 'Study mode' })).toBeNull()
  })

  it('random mask shows the share control and "New random mask"', async () => {
    mount()
    await start()
    const user = userEvent.setup()
    await started()
    await user.click(screen.getByRole('radio', { name: 'Random' }))
    expect(boxes()).toHaveLength(4) // 50% of 8
    expect(screen.getByRole('button', { name: 'New random mask' })).toBeInTheDocument()
  })
})
