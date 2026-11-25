import type { Guide } from './types.ts'

export const TRACE_GUIDE: Guide = {
  path: '/trace-table',
  title: 'How to complete a trace table',
  intro: [
    'A trace table records a dry run: you follow a program one line at a time and write down each value as it changes. It shows what an algorithm does and where it goes wrong. There is a column for each variable you are following, usually one for output, and sometimes one for the line number or a condition.',
  ],
  steps: {
    heading: 'Method',
    blocks: [
      {
        ul: [
          ['Copy the column headings from the question, in the same order.'],
          ['Start at the first line that runs. Do not skip ahead to what you expect to happen.'],
          ['When a line changes a variable, write the new value in its column, on a new row if the layout needs one.'],
          ['Leave a cell blank if its value has not changed, unless the question tells you to repeat it.'],
          ['Put printed text in the output column at the moment it is printed.'],
        ],
      },
    ],
  },
  topics: [
    {
      heading: 'Loops and conditions',
      blocks: [
        {
          p: [
            'A while loop tests its condition before every pass, including the last test, which is False and ends the loop. An if line only tests: it changes no variable, so on its own it usually adds no row. In Python, for i in range(3) gives i the values 0, 1 and 2, never 3. To see each test here, set Rows to Every line, or add the Condition column from the Columns menu.',
          ],
        },
      ],
    },
  ],
  workedExample: {
    heading: 'Worked example: linear search',
    blocks: [
      { p: ['This program looks along a list for 15 and stops when it finds it. The line numbers start at 1.'] },
      {
        code: `items = [4, 8, 15, 16, 23, 42]
target = 15
found = False
i = 0
while i < len(items) and not found:
    if items[i] == target:
        found = True
    else:
        i = i + 1
print(found, i)`,
      },
      {
        table: {
          caption: 'The completed table, with a value only where it changes',
          head: ['Line', 'items', 'target', 'found', 'i', 'Output'],
          rows: [
            ['1', '[4, 8, 15, 16, 23, 42]', '', '', '', ''],
            ['2', '', '15', '', '', ''],
            ['3', '', '', 'False', '', ''],
            ['4', '', '', '', '0', ''],
            ['9', '', '', '', '1', ''],
            ['9', '', '', '', '2', ''],
            ['7', '', '', 'True', '', ''],
            ['10', '', '', '', '', 'True 2'],
          ],
        },
      },
      {
        p: [
          'The values 4 and 8 do not match, so line 9 adds 1 to i twice. Then items[2] is 15, line 7 sets found to True, and the next loop test fails. i stays at 2 because the else branch does not run.',
        ],
      },
      { p: ['The tool adds a column for the watched expression i < len(items), which you don’t need.'] },
      { example: { href: '/trace-table?preset=linear-search', text: 'Open this example (it replaces the code in the editor)' } },
    ],
  },
  examTips: {
    heading: 'Common ways to lose marks',
    blocks: [
      {
        ul: [
          ['Running a loop one time too many, or one too few. Check the boundary value in the condition.'],
          ['Using a new value too early.'],
          ['Forgetting that list and string positions start at 0 in Python. Exam pseudocode may differ, so read the question.'],
          ['Changing the order or spelling of output.'],
          ['Ignoring the printed layout. If the question gives rows or headings, follow them rather than your own habit.'],
        ],
      },
    ],
  },
  faq: [
    {
      question: 'Do I write a row when a value doesn’t change?',
      answer:
        'Usually not. The common layout adds a value only when a variable changes or something is printed. Some questions ask for a row for every line or every pass, so follow the instructions and the table printed in your question.',
    },
    {
      question: 'Should a cell be blank or repeat the last value?',
      answer:
        'A blank usually means the value is unchanged. In this tool, Exam blanks shows a value only where it changes, and Carry forward repeats the current value in every row.',
    },
    {
      question: 'How can I practise without seeing the answers?',
      answer:
        'Run a program, then choose Study mode. Cells are hidden for you to fill in, and you can check your answers, ask for a hint or reveal one cell at a time.',
    },
  ],
}
