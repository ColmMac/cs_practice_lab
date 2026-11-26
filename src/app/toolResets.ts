import type { ToolReset } from '../components/ui/ToolErrorBoundary'

/**
 * What each tool's "Reset Tool" may clear. The keys are written out, not imported: their modules would pull the tools
 * into the entry chunk. A unit test checks them against the real constants.
 */
export const TOOL_RESETS = {
  traceTable: {
    toolName: 'Trace tables',
    storageKeys: ['tts:v1'],
    resetState: () => import('./TraceTableRoute').then((m) => m.resetTraceTool()),
  },
  truthTables: { toolName: 'Truth tables', storageKeys: ['hub:truth:last'] },
  // these two keep their state in the URL only, which every reset clears
  numberSystems: { toolName: 'Number systems', storageKeys: [] },
  sorting: { toolName: 'Sorting & searching', storageKeys: [] },
} satisfies Record<string, ToolReset>
