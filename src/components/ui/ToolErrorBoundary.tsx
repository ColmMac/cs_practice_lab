import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { SITE_NAME } from '../../config/site'
import { Button } from './Button'
import { ChunkLoadError } from './chunkError'
import { ICON_BEFORE } from './icons'

export interface ToolReset {
  toolName: string
  /** This tool's own localStorage keys. Reset Tool removes these and nothing else. */
  storageKeys: readonly string[]
  /**
   * Clears what the tool holds in memory, before the keys go (or a store would write the bad state straight back).
   * `'restored'`: it put back state of the user's that those keys hold, so they must stay.
   */
  resetState?: () => 'restored' | void | Promise<'restored' | void>
}

interface Props extends ToolReset {
  children: ReactNode
  /** Test seam. */
  reload?: () => void
}

interface InnerProps extends Props {
  /** The address has no query or fragment: nothing left in it for a remounted tool to read. */
  bare: boolean
  goBare: () => void
}

interface State {
  failure: { error: unknown } | null
  /** 'busy': clearing. 'cleared': waiting for the router to show the bare address. */
  reset: 'idle' | 'busy' | 'cleared'
  attempt: number
}

class Boundary extends Component<InnerProps, State> {
  state: State = { failure: null, reset: 'idle', attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failure: { error }, reset: 'idle' }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // the console only: reporting it anywhere else would be a new third-party request
    console.error(`${this.props.toolName} crashed:`, error, info.componentStack)
  }

  componentDidUpdate(prevProps: InnerProps, prevState: State) {
    // Every tool route shares this instance. A panel that was ALREADY showing doesn't follow the user to another tool;
    // an error thrown by the new tool as it arrives has no previous failure, so it stays.
    if (prevProps.toolName !== this.props.toolName && prevState.failure && this.state.failure) {
      this.setState({ failure: null, reset: 'idle' })
    } else if (this.state.reset === 'cleared' && this.props.bare) {
      this.setState((s) => ({ failure: null, reset: 'idle', attempt: s.attempt + 1 }))
    }
  }

  private reload = () => (this.props.reload ?? (() => window.location.reload()))()

  private resetTool = async () => {
    if (this.state.failure?.error instanceof ChunkLoadError) return this.reload()
    if (this.state.reset !== 'idle') return
    this.setState({ reset: 'busy' })
    const { storageKeys, resetState, goBare } = this.props
    try {
      if ((await resetState?.()) !== 'restored') {
        for (const key of storageKeys) {
          try {
            localStorage.removeItem(key)
          } catch {
            /* storage unavailable: there is nothing stored to clear */
          }
        }
      }
    } catch (error) {
      console.error(`${this.props.toolName} could not be reset:`, error)
      return this.reload()
    }
    // a tool's state can also come from the URL (?expr=, #s=…)
    goBare()
    this.setState({ reset: 'cleared' })
  }

  /** Stable, so it takes focus once, when the heading appears. */
  private focusHeading = (el: HTMLHeadingElement | null) => el?.focus()

  render() {
    const { failure, reset, attempt } = this.state
    if (!failure) return <Fresh key={attempt}>{this.props.children}</Fresh>
    const stale = failure.error instanceof ChunkLoadError
    return (
      // a screen tall, like the loading line, so the footer isn't painted and then pushed away
      <main className="min-h-dvh p-4">
        <title>{`${this.props.toolName} | ${SITE_NAME}`}</title>
        <div role="alert" className="max-w-prose rounded border border-border bg-surface p-3">
          <h1 ref={this.focusHeading} tabIndex={-1} className="text-base font-semibold focus-visible:outline-2 focus-visible:outline-accent">
            {this.props.toolName} stopped working
          </h1>
          <p className="my-3 text-sm">
            {stale
              ? 'This page did not load. The site may have been updated since you opened it, or the connection dropped. Reset Tool reloads the page.'
              : 'Something went wrong in this tool. Reset Tool clears what it has saved on this device and starts it again. Your other tools and practice history are kept.'}
          </p>
          <Button variant="primary" onClick={() => void this.resetTool()} disabled={reset !== 'idle'}>
            <RotateCcw aria-hidden="true" className={ICON_BEFORE} />
            Reset Tool
          </Button>
        </div>
      </main>
    )
  }
}

/** Gives the boundary something to re-key, so a reset mounts the tool from nothing. */
function Fresh({ children }: { children: ReactNode }) {
  return children
}

/** Catches a crash (or a chunk that would not load) in one tool, and offers to reset only that tool. */
export function ToolErrorBoundary(props: Props) {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  return <Boundary {...props} bare={!search && !hash} goBare={() => void navigate(pathname, { replace: true })} />
}
