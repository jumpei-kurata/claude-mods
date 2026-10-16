/** One usage limit (5-hour or weekly) */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** The usage to show. isStale: this session has not received a fresh value yet (last known values) */
export type Usage = { limits: Limit[]; isStale: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage; now: number }
  }
}
