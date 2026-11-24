import { useEffect, useMemo, useState } from 'react'
import { useQuiz, type Quiz } from './useQuiz'
import {
  AlgorithmError,
  buildFrames,
  buildHistory,
  findListPreset,
  isSearch,
  LIST_PRESETS,
  parseList,
  parseTarget,
  runAlgorithm,
  sortedProblem,
  type AlgorithmId,
  type Frame,
  type HistoryTable,
  type Run,
} from '../../core/algorithms'

export const SPEEDS = { slow: 1400, normal: 800, fast: 300 } as const
export type Speed = keyof typeof SPEEDS

const START = LIST_PRESETS[0]!

export interface Sorting {
  algo: AlgorithmId
  search: boolean
  text: string
  targetText: string
  earlyExit: boolean
  presetId: string
  speed: Speed
  /** What is wrong with the list, the target or the combination; null when the run is valid. */
  listError: string | null
  targetError: string | null
  /** The list as numbers, when it parses (used by the "Sort the list" fix). */
  data: number[] | null
  run: Run | null
  /** The pass-by-pass table for the run; null when the input is invalid. */
  history: HistoryTable | null
  frames: Frame[]
  index: number
  frame: Frame
  playing: boolean
  /** Quiz mode: the player is replaced by questions, and the frame shown is where the current question starts. */
  quizOn: boolean
  quiz: Quiz
  /** True while questions are still being asked, so nothing that would give the answers away is shown. */
  quizActive: boolean
  setQuizOn: (b: boolean) => void
  atStart: boolean
  atEnd: boolean
  setAlgo: (a: AlgorithmId) => void
  setText: (t: string) => void
  setTargetText: (t: string) => void
  setEarlyExit: (b: boolean) => void
  setSpeed: (s: Speed) => void
  choosePreset: (id: string) => void
  sortTheList: () => void
  step: () => void
  back: () => void
  togglePlay: () => void
  reset: () => void
}

/** Inputs, the run they produce, and a player over its frames. Any input change goes back to the start. */
export function useSorting(): Sorting {
  const [algo, setAlgoState] = useState<AlgorithmId>('bubble')
  const [text, setTextState] = useState(START.data.join(', '))
  const [targetText, setTargetTextState] = useState(String(START.target))
  const [earlyExit, setEarlyExitState] = useState(true)
  const [speed, setSpeed] = useState<Speed>('normal')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [quizOn, setQuizOnState] = useState(false)

  const search = isSearch(algo)

  const parsedList = useMemo(() => parseList(text), [text])
  const parsedTarget = useMemo(() => parseTarget(targetText), [targetText])

  const { run, listError, targetError } = useMemo(() => {
    let listError: string | null = parsedList.ok ? null : parsedList.error
    const targetError = search && !parsedTarget.ok ? parsedTarget.error : null
    let run: Run | null = null
    if (parsedList.ok && !targetError) {
      try {
        run = runAlgorithm(algo, parsedList.value, {
          earlyExit,
          target: parsedTarget.ok ? parsedTarget.value : undefined,
        })
      } catch (e) {
        if (!(e instanceof AlgorithmError)) throw e
        listError = e.message
      }
    }
    return { run, listError, targetError }
  }, [algo, parsedList, parsedTarget, search, earlyExit])

  const frames = useMemo(() => (run ? buildFrames(run) : [EMPTY_FRAME]), [run])
  const history = useMemo(() => (run ? buildHistory(run) : null), [run])
  const quiz = useQuiz(run)
  const last = frames.length - 1
  const quizActive = quizOn && !quiz.finished && !quiz.unavailable
  const shown = quizOn ? (quiz.question ? Math.min(quiz.question.before, last) : last) : -1
  const at = Math.min(index, last)
  const isPlaying = playing && !quizOn && at < last

  useEffect(() => {
    if (!isPlaying) return
    const t = setInterval(() => setIndex((i) => Math.min(i + 1, last)), SPEEDS[speed])
    return () => clearInterval(t)
  }, [isPlaying, speed, last])

  const restart = () => {
    setIndex(0)
    setPlaying(false)
  }

  const data = parsedList.ok ? parsedList.value : null
  const presetId = LIST_PRESETS.find((p) => data && p.data.join(',') === data.join(','))?.id ?? 'custom'

  return {
    algo,
    search,
    text,
    targetText,
    earlyExit,
    presetId,
    speed,
    listError,
    targetError,
    data,
    run,
    history,
    frames,
    index: at,
    frame: frames[shown >= 0 ? shown : at]!,
    quizOn,
    quiz,
    quizActive,
    setQuizOn: (b) => {
      setQuizOnState(b)
      quiz.restart()
      restart()
    },
    playing: isPlaying,
    atStart: at === 0,
    atEnd: at >= last,
    setAlgo: (a) => {
      setAlgoState(a)
      restart()
    },
    setText: (t) => {
      setTextState(t)
      restart()
    },
    setTargetText: (t) => {
      setTargetTextState(t)
      restart()
    },
    setEarlyExit: (b) => {
      setEarlyExitState(b)
      restart()
    },
    setSpeed,
    choosePreset: (id) => {
      const p = findListPreset(id)
      if (!p) return
      setTextState(p.data.join(', '))
      if (p.target !== undefined) setTargetTextState(String(p.target))
      restart()
    },
    sortTheList: () => {
      if (!data || !sortedProblem(data)) return
      setTextState([...data].sort((a, b) => a - b).join(', '))
      restart()
    },
    step: () => {
      setPlaying(false)
      setIndex(Math.min(at + 1, last))
    },
    back: () => {
      setPlaying(false)
      setIndex(Math.max(at - 1, 0))
    },
    togglePlay: () => {
      if (isPlaying) return setPlaying(false)
      if (at >= last) setIndex(0)
      setPlaying(true)
    },
    reset: restart,
  }
}

const EMPTY_FRAME: Frame = {
  step: -1,
  cards: [],
  marks: [],
  caption: 'Fix the input above to see the steps.',
  comparisons: 0,
  swaps: 0,
  shifts: 0,
  pass: 0,
}
