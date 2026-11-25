/**
 * Board lists checked on 2026-11-25 against AQA 8525 sections 3.1.3 and 3.1.4, OCR J277 v3.1 section 2.1.3 and
 * the SQA C816 75 and C816 76 course specifications. See PLAN.md §18.4.
 */
import type { Guide } from './types.ts'

export const SORTING_GUIDE: Guide = {
  path: '/sorting-visualizer',
  title: 'Sorting and searching in exam answers',
  intro: [
    'Exam questions often ask you to show a list part-way through a sort, or the items a search checks. AQA GCSE names linear search, binary search, bubble sort and merge sort. OCR GCSE names those four and insertion sort. SQA Higher lists linear search among its standard algorithms.',
  ],
  steps: {
    heading: 'What changes on each pass',
    blocks: [
      {
        ul: [
          ['Bubble sort: one pass is one trip along the unsorted part, comparing neighbours and swapping any in the wrong order. For ascending order, the largest item left moves to its final place.'],
          ['Insertion sort: one pass takes the next item and puts it into place among the sorted items on its left. Items to its right do not move.'],
          ['Merge sort: split the list into single items, then merge neighbouring sorted lists. This tool shows each level of merging as one step in its table.'],
        ],
      },
    ],
  },
  topics: [
    {
      heading: 'Linear and binary search',
      blocks: [
        {
          p: [
            'Linear search checks items from the start until it finds the target or reaches the end. It works on any list. Binary search needs a sorted list. It compares the middle item with the target, then keeps only the half that could hold it. Here positions start at 0 and mid = (low + high) DIV 2, so a half is rounded down. A question may count from 1 or round another way, so follow its rule.',
          ],
        },
      ],
    },
    {
      heading: 'Time complexity, worst case',
      blocks: [
        {
          ul: [
            ['Linear search: O(n).'],
            ['Binary search: O(log n).'],
            ['Bubble sort: O(n²). With an early stop, an already sorted list takes O(n).'],
            ['Insertion sort: O(n²), and O(n) for an already sorted list.'],
            ['Merge sort: O(n log n), but it needs extra memory for merging.'],
          ],
        },
      ],
    },
  ],
  workedExample: {
    heading: 'Worked example: bubble sort and binary search',
    blocks: [
      { p: ['Bubble sort the list 5, 2, 4, 1 into ascending order.'] },
      {
        table: {
          caption: 'The list after each bubble sort pass',
          head: ['Pass', 'List', 'Compares', 'Swaps'],
          rows: [
            ['Start', '5, 2, 4, 1', '', ''],
            ['1', '2, 4, 1, 5', '3', '3'],
            ['2', '2, 1, 4, 5', '2', '1'],
            ['3', '1, 2, 4, 5', '1', '1'],
          ],
        },
      },
      { example: { href: '/sorting-visualizer?data=5%2C2%2C4%2C1', text: 'Open this bubble sort' } },
      { p: ['Now search the sorted list 3, 9, 10, 23, 27, 38, 43, 82 for 43.'] },
      {
        table: {
          caption: 'Each binary search probe',
          head: ['Probe', 'Low', 'Mid', 'High', 'Value at mid'],
          rows: [
            ['1', '0', '3', '7', '23'],
            ['2', '4', '5', '7', '38'],
            ['3', '6', '6', '7', '43'],
          ],
        },
      },
      {
        example: {
          href: '/sorting-visualizer?algo=binary&data=3%2C9%2C10%2C23%2C27%2C38%2C43%2C82&target=43',
          text: 'Open this binary search',
        },
      },
    ],
  },
  examTips: {
    heading: 'Exam tips',
    blocks: [
      {
        ul: [
          ['Show the whole list after each pass, not only the items that moved.'],
          ['A bubble sort with an early stop ends after a pass with no swaps, or after n − 1 passes. Count the no-swap pass if it happens.'],
          ['In binary search, move low to mid + 1 or high to mid − 1, so the middle item is not checked again.'],
        ],
      },
    ],
  },
  faq: [
    {
      question: 'What counts as one pass of a bubble sort?',
      answer:
        'One trip through the unsorted part of the list from start to end, making every neighbouring comparison and any swaps. A single comparison or swap is not a pass.',
    },
    {
      question: 'Can binary search be used on an unsorted list?',
      answer:
        'No. It rules out half the list by assuming the items are in order, so on an unsorted list it can miss a value that is there. Sort the list first, or use linear search.',
    },
    {
      question: 'Is merge sort always faster than bubble sort?',
      answer:
        'No. Merge sort grows much more slowly as lists get longer, but on a short or already sorted list a bubble sort that stops early can need less work, and it uses less memory.',
    },
  ],
}
