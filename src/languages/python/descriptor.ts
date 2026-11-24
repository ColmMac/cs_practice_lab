import type { LanguageDescriptor } from '../../core/language'
import { formatPythonValue } from './format'
import { looseParsePython, parsePythonAnswer } from './literal'
import { PythonTraceRunner } from './PythonTraceRunner'
import { pythonPresets } from './presets'

export const pythonDescriptor: LanguageDescriptor = {
  id: 'python',
  label: 'Python',
  editorExtension: async () => (await import('@codemirror/lang-python')).python(),
  createRunner: () => new PythonTraceRunner(),
  presets: pythonPresets,
  formatValue: formatPythonValue,
  parseAnswer: parsePythonAnswer,
  looseParse: looseParsePython,
}
