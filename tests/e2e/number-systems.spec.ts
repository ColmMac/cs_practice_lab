import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const bit = (page: import('@playwright/test').Page, index: number) =>
  page.getByRole('button', { name: new RegExp(`^bit ${index}, weight`) })

test('toggling bits updates the sum line and all four fields', async ({ page }) => {
  await page.goto('/number-systems')
  await expect(page.getByRole('heading', { level: 1, name: 'Number systems' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'bit 7, weight 128' })).toHaveAttribute('aria-pressed', 'false')

  for (const i of [6, 3, 0]) await bit(page, i).click()
  await expect(page.getByTestId('sum-line')).toHaveText('64 + 8 + 1 = 73')
  await expect(page.getByLabel(/^Denary \(unsigned\)/)).toHaveValue('73')
  await expect(page.getByLabel(/^Denary \(signed\)/)).toHaveValue('73')
  await expect(page.getByLabel(/^Binary/)).toHaveValue('01001001')
  await expect(page.getByLabel(/^Hex/)).toHaveValue('49')
})

test('editing any field updates the bits; bad input shows an error without clobbering them', async ({ page }) => {
  await page.goto('/number-systems')
  await page.getByLabel(/^Hex/).fill('0xFF')
  await expect(page.getByLabel(/^Binary/)).toHaveValue('11111111')
  await expect(page.getByLabel(/^Denary \(signed\)/)).toHaveValue('-1')
  await expect(page.getByLabel(/^Denary \(unsigned\)/)).toHaveValue('255')
  await expect(bit(page, 7)).toHaveAttribute('aria-pressed', 'true')

  await page.getByLabel(/^Denary \(unsigned\)/).fill('300')
  await expect(page.getByLabel(/^Denary \(unsigned\)/)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#num-unsigned-err')).toContainText('does not fit')
  await expect(bit(page, 7)).toHaveAttribute('aria-pressed', 'true') // bits untouched
  await expect(page.getByLabel(/^Binary/)).toHaveValue('11111111')

  await page.getByLabel(/^Binary/).fill('0b1000 0000')
  await expect(page.getByLabel(/^Denary \(signed\)/)).toHaveValue('-128')
  await expect(page.locator('#num-unsigned-err')).toHaveText('')
})

test('the signed view shows the top weight as negative', async ({ page }) => {
  await page.goto('/number-systems')
  await page.getByLabel(/^Binary/).fill('10000001')
  await page.getByRole('radiogroup', { name: 'Weights' }).getByRole('radio', { name: 'Signed', exact: true }).click()
  await expect(page.getByRole('button', { name: 'bit 7, weight -128' })).toBeVisible()
  await expect(page.getByTestId('sum-line')).toHaveText('-128 + 1 = -127')
})

test('shifts report the bit that fell out and the overflow flag', async ({ page }) => {
  await page.goto('/number-systems')
  await page.getByLabel(/^Binary/).fill('01000001')
  await page.getByRole('button', { name: 'Arithmetic left' }).click()
  await expect(page.getByLabel(/^Binary/)).toHaveValue('10000010')
  await expect(page.getByTestId('bit-out')).toHaveText('0')
  await expect(page.getByText(/^Overflow:/)).toBeVisible()

  await page.getByRole('button', { name: 'Arithmetic right' }).click()
  await expect(page.getByLabel(/^Binary/)).toHaveValue('11000001')
  await expect(page.getByTestId('bit-out')).toHaveText('0')

  await page.getByRole('button', { name: 'Logical right' }).click()
  await expect(page.getByLabel(/^Binary/)).toHaveValue('01100000')
  await expect(page.getByTestId('bit-out')).toHaveText('1')

  await page.getByRole('button', { name: 'Logical left' }).click()
  await expect(page.getByLabel(/^Binary/)).toHaveValue('11000000')
})

test('invert, negate (shows invert + 1) and clear', async ({ page }) => {
  await page.goto('/number-systems')
  await page.getByLabel(/^Denary \(unsigned\)/).fill('5')
  await page.getByRole('button', { name: 'Negate' }).click()
  await expect(page.getByLabel(/^Denary \(signed\)/)).toHaveValue('-5')
  await expect(page.getByLabel(/^Binary/)).toHaveValue('11111011')
  await expect(page.getByText('invert 00000101 → 11111010, then add 1')).toBeVisible()

  await page.getByRole('button', { name: 'Invert' }).click()
  await expect(page.getByLabel(/^Binary/)).toHaveValue('00000100')

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByLabel(/^Binary/)).toHaveValue('00000000')
  await expect(page.getByTestId('sum-line')).toHaveText('No bits set = 0')
})

test('the width toggle switches to 16 bits and back', async ({ page }) => {
  await page.goto('/number-systems')
  await page.getByLabel(/^Binary/).fill('11111111')
  await page.getByRole('radio', { name: '16-bit' }).click()
  await expect(page.getByRole('group', { name: '16-bit register' }).getByRole('button')).toHaveCount(16)
  await expect(page.getByLabel(/^Binary/)).toHaveValue('0000000011111111')
  await expect(page.getByLabel(/^Hex/)).toHaveValue('00FF')
  await page.getByLabel(/^Denary \(unsigned\)/).fill('65535')
  await expect(page.getByLabel(/^Hex/)).toHaveValue('FFFF')

  await page.getByRole('radio', { name: '8-bit' }).click()
  await expect(page.getByRole('group', { name: '8-bit register' }).getByRole('button')).toHaveCount(8)
  await expect(page.getByLabel(/^Hex/)).toHaveValue('FF')
})

test.describe('binary addition visualiser', () => {
  const openAdd = async (page: import('@playwright/test').Page) => {
    await page.goto('/number-systems')
    await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Addition' }).click()
    await expect(page.getByTestId('addition-table')).toBeVisible()
  }
  const fillOperands = async (page: import('@playwright/test').Page, a: string, b: string) => {
    await page.getByRole('textbox', { name: /^Operand A/ }).fill(a)
    await page.getByRole('textbox', { name: /^Operand B/ }).fill(b)
  }

  test('shows the carry row, operands and result in exam layout', async ({ page }) => {
    await openAdd(page)
    await fillOperands(page, '00100101', '00010010') // 37 + 18
    await expect(page.getByTestId('result-bit')).toHaveText(['0', '0', '1', '1', '0', '1', '1', '1'])
    await expect(page.getByTestId('verdict')).toContainText('37 + 18 = 55')
    await expect(page.getByTestId('verdict')).toContainText('No carry out')
    await expect(page.getByTestId('verdict')).toContainText('No overflow')
  })

  test('the overflow example flags signed overflow but not a carry out', async ({ page }) => {
    await openAdd(page)
    await fillOperands(page, '01111111', '00000001')
    await expect(page.getByTestId('result-bit')).toHaveText(['1', '0', '0', '0', '0', '0', '0', '0'])
    await expect(page.getByText('Overflow: two positives gave a negative.')).toBeVisible()
    await expect(page.getByText('No carry out')).toBeVisible()
    await expect(page.getByTestId('carry-out')).toHaveText('0')
  })

  test('the carry-out example explains the unsigned reading separately', async ({ page }) => {
    await openAdd(page)
    await page.getByRole('button', { name: 'Carry out' }).click()
    await expect(page.getByTestId('carry-out')).toHaveText('1')
    await expect(page.getByText(/^Carry out of the top column/)).toBeVisible()
    await expect(page.getByText(/^No overflow/)).toBeVisible() // -1 + 1 = 0 is fine when signed
  })

  test('step-through reveals one column at a time, right to left', async ({ page }) => {
    await openAdd(page)
    await fillOperands(page, '00000011', '00000001')
    await page.getByRole('button', { name: 'Step through' }).click()
    await expect(page.getByTestId('verdict')).toContainText('Finish the last column')
    await expect(page.getByTestId('result-bit')).toHaveText(['', '', '', '', '', '', '', ''])

    await page.getByRole('button', { name: 'Next column' }).click()
    await expect(page.getByTestId('step-text')).toHaveText('Column 0: 1 + 1 + carry 0 = 2, so write 0 and carry 1.')
    await expect(page.getByTestId('result-bit')).toHaveText(['', '', '', '', '', '', '', '0'])
    await page.getByRole('button', { name: 'Next column' }).click()
    await expect(page.getByTestId('step-text')).toHaveText('Column 1: 1 + 0 + carry 1 = 2, so write 0 and carry 1.')
    await expect(page.getByTestId('result-bit').nth(6)).toHaveAttribute('aria-current', 'step')

    await page.getByRole('button', { name: 'Previous column' }).click()
    await expect(page.getByTestId('result-bit')).toHaveText(['', '', '', '', '', '', '', '0'])

    await page.getByRole('button', { name: 'Show all' }).click()
    await expect(page.getByTestId('result-bit')).toHaveText(['0', '0', '0', '0', '0', '1', '0', '0'])
    await expect(page.getByTestId('verdict')).toContainText('3 + 1 = 4')
    await expect(page.getByRole('button', { name: 'Next column' })).toBeDisabled()
  })

  test('toggling operand bits updates the sum, and the width toggle keeps working', async ({ page }) => {
    await openAdd(page)
    await page.getByRole('button', { name: 'Operand A bit 0, weight 1' }).click()
    await page.getByRole('button', { name: 'Operand B bit 0, weight 1' }).click()
    await expect(page.getByRole('textbox', { name: /^Operand A/ })).toHaveValue('00000001')
    await expect(page.getByTestId('verdict')).toContainText('1 + 1 = 2')

    await page.getByRole('radio', { name: '16-bit' }).click()
    await expect(page.getByTestId('result-bit')).toHaveCount(16)
    await expect(page.getByRole('textbox', { name: /^Operand A/ })).toHaveValue('0000000000000001')
    await page.getByRole('button', { name: 'Signed overflow' }).click()
    await expect(page.getByRole('textbox', { name: /^Operand A/ })).toHaveValue('0111111111111111')
    await expect(page.getByText(/^Overflow: two positives/)).toBeVisible()
  })

  test('a bad operand shows an error and leaves the sum alone', async ({ page }) => {
    await openAdd(page)
    await fillOperands(page, '00000101', '00000001')
    await page.getByRole('textbox', { name: /^Operand A/ }).fill('123456789')
    await expect(page.getByRole('textbox', { name: /^Operand A/ })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('verdict')).toContainText('5 + 1 = 6')
  })
})

test.describe('practice mode', () => {
  const open = async (page: import('@playwright/test').Page) => {
    await page.goto('/number-systems')
    await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Practice' }).click()
    await expect(page.getByTestId('question')).toHaveCount(8)
  }
  const box = (page: import('@playwright/test').Page, n: number) => page.getByRole('textbox', { name: `Answer to question ${n}` })

  test('a right answer and a wrong one are graded, and the working appears only after checking', async ({ page }) => {
    await open(page)
    const first = page.getByTestId('question').first()
    expect(await first.getAttribute('data-kind')).toBe('dec2bin')
    const n = Number(/Convert (\d+) to/.exec((await first.getByTestId('prompt').textContent()) ?? '')![1])
    await expect(page.getByTestId('working')).toHaveCount(0)

    await box(page, 1).fill('0b ' + n.toString(2).padStart(8, '0'))
    await box(page, 2).fill('not a number')
    await page.getByRole('button', { name: 'Check answers' }).click()

    await expect(first.locator('[id^="study-msg-"]')).toContainText('Correct')
    await expect(page.getByTestId('question').nth(1).getByText(/Not correct/)).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Score:' })).toContainText('1 / 8')
    await expect(first.getByTestId('working')).toContainText('weight')
  })

  test('a missing leading zero is Almost, and feedback does not reveal the answer', async ({ page }) => {
    await open(page)
    const first = page.getByTestId('question').first()
    // Questions are random (the seed URL parameter arrives in N3.5): draw again until the number is below 128,
    // so that its binary form really has a leading zero to leave out.
    const read = async () => Number(/Convert (\d+) to/.exec((await first.getByTestId('prompt').textContent()) ?? '')![1])
    let n = await read()
    for (let i = 0; i < 40 && n >= 128; i++) {
      await page.getByRole('button', { name: 'New questions' }).click()
      n = await read()
    }
    expect(n).toBeLessThan(128)
    await box(page, 1).fill(n.toString(2))
    await page.getByRole('button', { name: 'Check answers' }).click()
    const msg = first.locator('[id^="study-msg-"]')
    await expect(msg).toContainText('Almost')
    await expect(msg).toContainText('all 8 bits')
    await expect(msg).not.toContainText(n.toString(2).padStart(8, '0'))
  })

  test('reveal shows the answer and the working; New questions clears answers; keyboard moves on', async ({ page }) => {
    await open(page)
    await box(page, 1).focus()
    await page.keyboard.press('Alt+r')
    await expect(page.getByTestId('revealed-cell')).toHaveCount(1)
    await expect(page.getByTestId('working')).toHaveCount(1)
    await expect(box(page, 2)).toBeFocused()

    await box(page, 2).fill('1')
    await page.keyboard.press('Enter')
    await expect(box(page, 3)).toBeFocused()
    await page.keyboard.press('Shift+Enter')
    await expect(box(page, 2)).toBeFocused()

    await page.getByRole('button', { name: 'New questions' }).click()
    await expect(page.getByTestId('revealed-cell')).toHaveCount(0)
    await expect(box(page, 2)).toHaveValue('')
  })
})
