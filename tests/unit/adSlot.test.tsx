import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { TruthTablePage } from '../../src/components/truth/TruthTablePage'
import { AD_LOAD_TIMEOUT_MS, AdSlot } from '../../src/components/ui/AdSlot'
import { houseCard } from '../../src/components/ui/houseCards'
import { useProjector } from '../../src/components/ui/projector'
import { useAdsAllowed, type Ads } from '../../src/components/ui/useAdsAllowed'
import { isAdsenseSlot } from '../../src/config/site'
import { SITE_PATHS } from '../../src/app/tools'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { defaultWorkspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

vi.mock('../../src/components/editor/CodeEditor', () => ({ CodeEditor: () => <textarea aria-label="Code editor" /> }))

const CLIENT = 'ca-pub-0000000000000000'
const SLOT = '1234567890'

const ads = (show: Ads['show'], retire = () => {}): Ads => ({ show, retire })
const units = () => document.querySelectorAll('ins.adsbygoogle')
const slots = () => screen.queryAllByTestId('ad-slot')
const house = () => screen.queryByTestId('house-card')

function enableAds() {
  vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT)
  vi.stubEnv('VITE_ADSENSE_SLOT', SLOT)
}

/** The loader as it is once the real script has run: `push` is counted. */
function loader() {
  const push = vi.fn()
  window.adsbygoogle = Object.assign([] as unknown[], { loaded: true, push })
  return push
}

const tick = (ms = 1) => act(() => vi.advanceTimersByTimeAsync(ms))

const slot = (value: Ads = ads('ad'), path = '/truth-tables') => (
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <AdSlot ads={value} />
    </MemoryRouter>
  </StrictMode>
)

beforeEach(() => {
  vi.stubEnv('VITE_ADSENSE_CLIENT', '')
  vi.stubEnv('VITE_ADSENSE_SLOT', '')
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  delete window.adsbygoogle
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('AdSlot', () => {
  beforeEach(() => vi.useFakeTimers())

  it('without the env vars shows the house card, with no <ins> and nothing queued', async () => {
    render(slot())
    await tick(AD_LOAD_TIMEOUT_MS + 1)
    expect(house()).toBeInTheDocument()
    expect(units()).toHaveLength(0)
    expect(window.adsbygoogle).toBeUndefined()
    expect(screen.queryByText('Advertisement')).not.toBeInTheDocument()
  })

  it.each([
    ['no slot', CLIENT, ''],
    ['a malformed slot', CLIENT, 'abc'],
    ['no client', '', SLOT],
  ])('needs both values: %s shows the house card', (_, client, id) => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', client)
    vi.stubEnv('VITE_ADSENSE_SLOT', id)
    render(slot())
    expect(units()).toHaveLength(0)
    expect(house()).toBeInTheDocument()
  })

  it('with both set renders one fixed-height unit and pushes exactly once under StrictMode', async () => {
    enableAds()
    const push = loader()
    render(slot())
    await tick(AD_LOAD_TIMEOUT_MS + 1)
    expect(units()).toHaveLength(1)
    const unit = units()[0] as HTMLElement
    expect(unit).toHaveAttribute('data-ad-client', CLIENT)
    expect(unit).toHaveAttribute('data-ad-slot', SLOT)
    expect(unit).toHaveAttribute('data-full-width-responsive', 'false')
    expect(unit).not.toHaveAttribute('data-ad-format')
    expect(unit).toHaveAttribute('data-adtest', 'on') // tests run as a dev build
    expect([unit.style.display, unit.style.width, unit.style.height]).toEqual(['block', '100%', '100px'])
    expect(screen.getByText('Advertisement')).toBeInTheDocument()
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('asks for non-personalised ads before the request goes', async () => {
    enableAds()
    const flags: unknown[] = []
    loader().mockImplementation(() => flags.push(window.adsbygoogle!.requestNonPersonalizedAds))
    render(slot())
    await tick()
    expect(flags).toEqual([1])
  })

  it('skips a unit AdSense has already taken', async () => {
    enableAds()
    const push = loader()
    render(slot())
    units()[0]!.setAttribute('data-adsbygoogle-status', 'done')
    await tick()
    expect(push).not.toHaveBeenCalled()
  })

  const box = () => slots()[0]!.className

  it('swaps to the house card, in the same box, when the unit is unfilled; a filled one stays', async () => {
    enableAds()
    loader()
    render(slot())
    const before = box()
    await tick()
    await act(async () => units()[0]!.setAttribute('data-ad-status', 'filled'))
    expect(units()).toHaveLength(1)
    await act(async () => units()[0]!.setAttribute('data-ad-status', 'unfilled'))
    expect(units()).toHaveLength(0)
    expect(house()).toBeInTheDocument()
    expect(box()).toBe(before)
    expect(before).toContain('h-[122px]')
  })

  it('falls back when the loader never loads (blocked)', async () => {
    enableAds()
    render(slot())
    await tick(AD_LOAD_TIMEOUT_MS - 1)
    expect(units()).toHaveLength(1)
    await tick(2)
    expect(units()).toHaveLength(0)
    expect(house()).toBeInTheDocument()
  })

  it('falls back at once when the loader script errors', async () => {
    enableAds()
    const script = document.createElement('script')
    script.type = 'text/plain' // never fetched
    script.setAttribute('src', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=x')
    document.head.append(script)
    render(slot())
    await act(async () => void script.dispatchEvent(new Event('error')))
    script.remove()
    expect(house()).toBeInTheDocument()
  })

  it('falls back when push throws', async () => {
    enableAds()
    loader().mockImplementation(() => {
      throw new Error('adblock')
    })
    render(slot())
    await tick()
    expect(house()).toBeInTheDocument()
  })

  it('renders nothing while suppressed, and the house card does not ask for an advert', async () => {
    enableAds()
    const push = loader()
    const view = render(slot(ads('none')))
    expect(slots()).toHaveLength(0)
    view.rerender(slot(ads('house')))
    await tick()
    expect(house()).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('never sends a request from a unit that is suppressed before the next tick', async () => {
    enableAds()
    const push = loader()
    const retire = vi.fn()
    const view = render(slot(ads('ad', retire)))
    view.rerender(slot(ads('none', retire)))
    await tick(AD_LOAD_TIMEOUT_MS + 1)
    expect(push).not.toHaveBeenCalled()
    expect(retire).not.toHaveBeenCalled()
  })

  it('retires the visit once a requested unit has gone', async () => {
    enableAds()
    loader()
    const retire = vi.fn()
    const view = render(slot(ads('ad', retire)))
    await tick()
    expect(retire).not.toHaveBeenCalled()
    view.rerender(slot(ads('none', retire)))
    expect(retire).toHaveBeenCalledTimes(1)
  })

  it('mounts only the placement for the current width', () => {
    const wide = (matches: boolean) =>
      vi.stubGlobal('matchMedia', () => ({ matches, addEventListener() {}, removeEventListener() {} }))
    for (const matches of [true, false]) {
      wide(matches)
      render(
        <MemoryRouter>
          <AdSlot ads={ads('ad')} at="desktop" className="is-desktop" />
          <AdSlot ads={ads('ad')} at="phone" className="is-phone" />
        </MemoryRouter>,
      )
      expect(slots()).toHaveLength(1)
      expect(slots()[0]).toHaveClass(matches ? 'is-desktop' : 'is-phone')
      cleanup()
    }
  })
})

describe('useAdsAllowed', () => {
  it('only gives the house card once a mode has hidden the slot', () => {
    const hook = renderHook(({ off }) => useAdsAllowed(off), { initialProps: { off: false } })
    expect(hook.result.current.show).toBe('ad')
    hook.rerender({ off: true })
    expect(hook.result.current.show).toBe('none')
    hook.rerender({ off: false })
    expect(hook.result.current.show).toBe('house')
  })

  it('starts retired on a page that opens suppressed, and retire() has the same effect', () => {
    const opened = renderHook(({ off }) => useAdsAllowed(off), { initialProps: { off: true } })
    opened.rerender({ off: false })
    expect(opened.result.current.show).toBe('house')

    const used = renderHook(() => useAdsAllowed(false))
    act(() => used.result.current.retire())
    expect(used.result.current.show).toBe('house')
  })
})

describe('house cards and slot IDs', () => {
  it('each route has a fixed card that never links to itself', () => {
    for (const path of SITE_PATHS) {
      expect(houseCard(path).to, path).not.toBe(path)
      expect(houseCard(path)).toBe(houseCard(path))
    }
  })

  it('a slot ID is digits only', () => {
    expect(isAdsenseSlot('0000000000')).toBe(true)
    for (const bad of [undefined, '', ' 123 ', 'ca-pub-1', '12a']) expect(isAdsenseSlot(bad)).toBe(false)
  })
})

describe('pages hide the slot', () => {
  const mountTrace = async () => {
    setRunnerOverride(new FakeTraceRunner(traces.digitSum, 'python'))
    useStore.setState({ ...defaultWorkspace('x = 1\n'), result: null, ranSig: null, study: null, shared: null, challenge: null })
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('table', { name: 'Trace table' })
  }
  afterEach(() => {
    useStore.getState().cancelScheduledRerun()
    setRunnerOverride(null)
    if (useProjector.getState().on) useProjector.getState().toggle()
  })

  const nothingAdLike = () => {
    expect(slots()).toHaveLength(0)
    expect(units()).toHaveLength(0)
    expect(screen.queryByText('Advertisement')).not.toBeInTheDocument()
  }

  it('trace table: gone in Study mode, and the house card afterwards', async () => {
    enableAds()
    await mountTrace()
    expect(units()).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Study mode' }))
    nothingAdLike()
    await act(async () => useStore.getState().exitStudy())
    expect(units()).toHaveLength(0)
    expect(house()).toBeInTheDocument()
  })

  it.each(['review', 'starting', 'active', 'unreproducible'] as const)('trace table: gone in a %s challenge', async (stage) => {
    enableAds()
    await mountTrace()
    await act(async () =>
      useStore.setState({ challenge: { stage, spec: { steps: 1, executionKey: 'k' }, checkedOnce: false, hidNothing: false } }),
    )
    nothingAdLike()
  })

  it('trace table: gone in projector mode', async () => {
    enableAds()
    await mountTrace()
    await act(async () => useProjector.getState().toggle())
    nothingAdLike()
  })

  it('truth tables: gone in Study mode', async () => {
    enableAds()
    render(<TruthTablePage />, { wrapper: MemoryRouter })
    expect(units()).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Study mode' }))
    nothingAdLike()
  })
})
