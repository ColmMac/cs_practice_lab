/**
 * Board wording checked on 2026-11-25 against AQA 8525 section 3.3, OCR J277 v3.1 section 1.2.4 and the SQA
 * C816 75 and C816 76 course specifications. See PLAN.md §18.4.
 */
import type { Guide } from './types.ts'

export const NUMBER_GUIDE: Guide = {
  path: '/number-systems',
  title: 'Number bases and two’s complement',
  intro: [
    'Denary uses ten digits, binary uses two (0 and 1), and hexadecimal uses sixteen (0 to 9, then A to F for 10 to 15). In an 8-bit binary number the place values, from the left, are 128, 64, 32, 16, 8, 4, 2 and 1.',
  ],
  steps: {
    heading: 'Converting between bases',
    blocks: [
      {
        ul: [
          ['Binary to denary: add the place values that have a 1 under them.'],
          ['Denary to binary: from 128 down, write 1 if the place value fits into what is left, then subtract it. Otherwise write 0.'],
          ['Binary to hex: split the byte into two groups of four bits and convert each group to one hex digit.'],
          ['Hex to denary: multiply the first of two digits by 16 and add the second.'],
        ],
      },
    ],
  },
  topics: [
    {
      heading: 'Two’s complement',
      blocks: [
        {
          p: [
            'Two’s complement stores negative integers by giving the top bit a negative weight: −128 in 8 bits, so the range is −128 to 127. To negate a number, invert every bit and then add 1. The AQA 8525 and OCR J277 GCSE specifications don’t mention two’s complement, and SQA National 5 covers positive integers only. It is part of SQA Higher.',
          ],
        },
      ],
    },
    {
      heading: 'Overflow and shifts',
      blocks: [
        {
          p: [
            'Overflow means a result does not fit in the bits available. For unsigned addition, it is a carry out of the top bit. In two’s complement, it is two positives giving a negative result, or two negatives giving a positive one; a carry out alone does not show it.',
          ],
        },
        {
          p: [
            'A logical shift moves every bit and fills the gap with 0. Each place left multiplies an unsigned number by 2, if no 1 is lost off the end. Each place right divides it by 2 and discards the remainder. AQA GCSE uses only logical shifts; OCR GCSE asks for both left and right. An arithmetic right shift copies the top bit instead, which keeps the sign.',
          ],
        },
      ],
    },
  ],
  workedExample: {
    heading: 'Worked example: −37 in 8 bits',
    blocks: [
      { p: ['37 is 32 + 4 + 1. Invert its bits, then add 1.'] },
      {
        table: {
          caption: 'Negating 37 with two’s complement',
          head: ['Step', 'Binary'],
          rows: [
            ['37', '00100101'],
            ['Invert every bit', '11011010'],
            ['Add 1', '11011011'],
          ],
        },
      },
      {
        p: [
          'Check it with the signed weights: −128 + 64 + 16 + 8 + 2 + 1 = −37. Read as unsigned, the same bits are 219, which is DB in hex (1101 is D and 1011 is B).',
        ],
      },
      { example: { href: '/number-systems?bits=00100101', text: 'Open 37 in the bit sandbox, then press Negate' } },
    ],
  },
  examTips: {
    heading: 'Exam tips',
    blocks: [
      {
        ul: [
          ['Write all the bits asked for, including leading zeros.'],
          ['Check whether the number is unsigned or two’s complement before you read the top bit.'],
          ['Show your place values and carries, as method marks may depend on the working.'],
          ['Check a conversion by converting the answer back.'],
        ],
      },
    ],
  },
  faq: [
    {
      question: 'How do I know whether a binary number is negative?',
      answer:
        'The bits alone do not say. The question tells you how to read them. In two’s complement a leading 1 means negative; in an unsigned number it is worth +128 in a byte.',
    },
    {
      question: 'Why is hexadecimal used?',
      answer:
        'One hex digit stands for exactly four bits, so a byte takes two digits. That is shorter than binary, easier for people to read and copy, and quick to convert back.',
    },
    {
      question: 'What happens when 100 and 50 are added in 8-bit two’s complement?',
      answer:
        '01100100 + 00110010 gives 10010110, which reads as −106. The true total, 150, is above 127, so the addition has overflowed.',
    },
  ],
}
