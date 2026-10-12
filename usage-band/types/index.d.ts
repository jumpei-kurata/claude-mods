/** 使用量の枠1つ（5時間 or 1週間） */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** 表示する使用量。isStale は「このセッションではまだ最新を受け取っていない＝前回の値」 */
export type Usage = { limits: Limit[]; isStale: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage; now: number }
  }
}
