/**
 * Board wording checked on 2026-11-25 against AQA 8525 section 3.4.2 (text and symbol drawings), OCR J277 v3.1
 * section 2.4 (text only) and the SQA C816 75 and C816 76 course specifications (text search). See PLAN.md §18.4.
 */
import type { Guide } from './types.ts'

export const TRUTH_GUIDE: Guide = {
  path: '/truth-tables',
  title: 'How to build a truth table',
  intro: [
    'A truth table gives the output of a Boolean expression or logic circuit for every combination of inputs. 1 means True and 0 means False. With n inputs there are 2ⁿ rows: two inputs need 4 rows and three need 8.',
  ],
  steps: {
    heading: 'Method',
    blocks: [
      {
        ul: [
          ['Give each input a column, then add the rows by counting up in binary: 000, 001, 010 and so on to 111. The right-hand input changes on every row.'],
          ['Add a working column for each smaller part of the expression, starting inside the brackets.'],
          ['Fill one column at a time, using completed columns, and write the output last.'],
        ],
      },
    ],
  },
  topics: [
    {
      heading: 'Operators and precedence',
      blocks: [
        {
          p: [
            'NOT reverses a value. AND is 1 only when both inputs are 1. OR is 1 when at least one is 1. XOR is 1 when the two inputs differ. Work out brackets first, then NOT, then AND, then OR. This tool puts XOR between AND and OR; in your own work, bracket it so the meaning is clear.',
          ],
        },
      ],
    },
    {
      heading: 'Gate symbols and notation',
      blocks: [
        {
          p: [
            'AQA GCSE draws AND as a D shape, OR as a shield shape with a pointed output, XOR as the OR shape with a second curve at the back, and NOT as a triangle with a small circle at its tip. It writes AND as a dot, OR as +, XOR as ⊕ and NOT as a bar over the term. Here, type AND as · or &, and NOT as NOT, ! or ¬: a full stop and an overbar are not accepted.',
          ],
        },
        {
          p: [
            'OCR GCSE (J277) lists AND, OR and NOT, and asks you to recognise each gate symbol. The SQA National 5 and Higher Computing Science course specifications don’t list logic gates or truth tables.',
          ],
        },
      ],
    },
    {
      heading: 'Adders',
      blocks: [
        {
          p: [
            'A half adder has sum = A XOR B and carry = A AND B. A full adder adds a carry in, C: sum is A XOR B XOR C, and carry out is 1 when at least two inputs are 1. Both are in the Example menu.',
          ],
        },
      ],
    },
  ],
  workedExample: {
    heading: 'Worked example: Q = A OR B AND NOT C',
    blocks: [
      { p: ['NOT C comes first, then B AND (NOT C), and OR last.'] },
      {
        table: {
          caption: 'All eight rows, with a working column for each step',
          head: ['A', 'B', 'C', 'NOT C', 'B AND NOT C', 'Q'],
          rows: [
            ['0', '0', '0', '1', '0', '0'],
            ['0', '0', '1', '0', '0', '0'],
            ['0', '1', '0', '1', '1', '1'],
            ['0', '1', '1', '0', '0', '0'],
            ['1', '0', '0', '1', '0', '1'],
            ['1', '0', '1', '0', '0', '1'],
            ['1', '1', '0', '1', '1', '1'],
            ['1', '1', '1', '0', '0', '1'],
          ],
        },
      },
      { p: ['So Q is 1 if A is 1, or if B is 1 and C is 0.'] },
      {
        example: {
          href: '/truth-tables?expr=Q+%3D+A+OR+B+AND+NOT+C',
          text: 'Open this example, then set Intermediate columns to On',
        },
      },
    ],
  },
  examTips: {
    heading: 'Exam tips',
    blocks: [
      {
        ul: [
          ['Count your rows before working out any outputs, so no combination is missing or repeated.'],
          ['(A OR B) AND C differs from A OR B AND C, so copy every bracket.'],
          ['NOT (A AND B) matches (NOT A) OR (NOT B), not (NOT A) AND (NOT B).'],
        ],
      },
    ],
  },
  faq: [
    {
      question: 'What order should the rows of a truth table be in?',
      answer:
        'Count up in binary from all zeros to all ones, with the first input as the left-hand bit. This order makes a missing row easy to spot. If a question gives the rows, keep them.',
    },
    {
      question: 'Is AND done before OR?',
      answer:
        'Yes, by the usual convention: brackets first, then NOT, then AND, then OR. Add brackets whenever the order could be misread.',
    },
    {
      question: 'What is the difference between OR and XOR?',
      answer: 'They differ only when both inputs are 1. OR then gives 1, and XOR gives 0.',
    },
  ],
}
