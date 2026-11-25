import type { Page } from '@playwright/test'

/**
 * Console errors, uncaught exceptions and CSP violations, collected from the moment the page starts loading. Call it
 * before the first `goto`. It also marks the visitor as welcomed.
 */
export async function watchForProblems(page: Page): Promise<string[]> {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  page.on('pageerror', (e) => problems.push(e.message))
  await page.exposeFunction('reportViolation', (v: string) => problems.push(v))
  await page.addInitScript(() => {
    localStorage.setItem('tts:welcomed', '1')
    document.addEventListener('securitypolicyviolation', (e) => {
      void (window as unknown as { reportViolation: (v: string) => void }).reportViolation(
        `CSP ${e.violatedDirective} ${e.blockedURI}`,
      )
    })
  })
  return problems
}
