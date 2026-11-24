import type { Preset } from '../../core/language'

// M1 ships one preset so the app is usable on first visit; the full exam set arrives in M2.
export const pythonPresets: Preset[] = [
  {
    id: 'digit-sum',
    title: 'Digit sum (while, %, //)',
    description: 'Add up the digits of a number using modulo and integer division.',
    code: `n = 1234
total = 0
while n > 0:
    digit = n % 10
    total = total + digit
    n = n // 10
print(total)
`,
  },
  {
    id: 'factorial',
    title: 'Recursive factorial',
    description: 'Call rows, call depth and return values.',
    code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

result = fact(4)
print(result)
`,
  },
]
