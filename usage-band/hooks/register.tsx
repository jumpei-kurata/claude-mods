import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Usage } from '../types'

// Shows the 5-hour and weekly usage, and the time until each resets, in the SessionMode slot
// next to the prompt. It adds no row of its own, so the conversation keeps its height.
// It reads only the usage Claude Code already has ($.session.usage and session.measure):
// no network calls, no file access, no commands.

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, {
  limits: [],
  isStale: false,
} as Usage)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const LABEL: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly' }
// The desktop app gives this slot a fixed width and cuts longer text with "…" (about 13 characters),
// so the label is short: limit names in capitals, times in lower case (5H 29% 1h15m / 7D 15% 4d).
const SHORT: Record<string, string> = { five_hour: '5H', seven_day: '7D' }
const ORDER = ['five_hour', 'seven_day']
const WARN_AT = [80, 95]
const STORE_KEY = 'last'
const MINUTE = 60_000

/** Keeps only the 5-hour and weekly limits, 5-hour first */
export const pick = (list: readonly Limit[]): Limit[] =>
  list
    .filter(one => one.kind in LABEL)
    .map(one =>
      one.resetsAt
        ? { kind: one.kind, percentUsed: one.percentUsed, resetsAt: one.resetsAt }
        : { kind: one.kind, percentUsed: one.percentUsed },
    )
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

/** Colour by usage (theme colour names, readable in light and dark) */
export const tone = (percent: number) =>
  percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'

/**
 * Time left until the limit resets, kept short (1h23m / 45m / 2d5h). Counted as time left,
 * so the time zone doesn't matter. isDaysOnly is for the weekly limit: whole days only (4d)
 * once a day or more is left, to save width.
 */
export const untilReset = (resetsAt: string | undefined, nowMs: number, isDaysOnly = false): string => {
  if (!resetsAt || !nowMs) return ''
  const ms = Date.parse(resetsAt) - nowMs
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return '' // after the reset, no time is shown (and the usage shows 0%, see shownPercent)
  const minutes = Math.ceil(ms / MINUTE)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return isDaysOnly ? `${days}d` : `${days}d${hours}h`
  if (hours > 0) return minutes % 60 === 0 ? `${hours}h` : `${hours}h${minutes % 60}m`
  return `${minutes}m`
}

/**
 * The usage to show. Once the reset time has passed but no new value has arrived yet,
 * show 0% instead of the old value (the next reply brings the real one).
 */
export const shownPercent = (one: Limit, nowMs: number): number => {
  const at = one.resetsAt ? Date.parse(one.resetsAt) : NaN
  return nowMs && !Number.isNaN(at) && at <= nowMs ? 0 : one.percentUsed
}

/**
 * Messages for limits that newly passed 80% or 95% (only the highest one per limit).
 * seen records what was already announced; dropping below a threshold clears it,
 * so the next time it is passed it is announced again.
 * With isQuiet, it only records and announces nothing (so opening a session
 * doesn't announce thresholds that were already passed before).
 */
export const crossings = (list: readonly Limit[], seen: Set<string>, isQuiet: boolean): string[] => {
  const out: string[] = []
  for (const one of list) {
    let top = 0
    for (const at of WARN_AT) {
      const key = `${one.kind}:${at}`
      if (one.percentUsed < at) {
        seen.delete(key)
        continue
      }
      if (!seen.has(key)) {
        seen.add(key)
        top = at
      }
    }
    if (top > 0 && !isQuiet) {
      out.push(`${LABEL[one.kind]} usage passed ${top}% (now ${one.percentUsed}%)`)
    }
  }
  return out
}

// What was already announced, and whether the first value has arrived (reset on reload)
const seen = new Set<string>()
let isSeeded = false

/** Moves "now" forward so the time until reset is counted again */
async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
}

/** Shows and saves the usage it received, and announces thresholds newly passed */
async function take($: EngineInterface, raw: readonly Limit[]) {
  const limits = pick(raw)
  if (limits.length === 0) return
  await tick($)
  await update($, usage, () => ({ limits, isStale: false }))
  await $.store.set(STORE_KEY, { limits })
  for (const text of crossings(limits, seen, !isSeeded)) {
    $.ui.toast(text, { timeoutMs: 8000 })
  }
  isSeeded = true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Count the time until reset again every minute
    await tick($)
    $.clock.every(MINUTE, () => {
      void tick($)
    })

    const current = await $.session.usage()
    if (current.rateLimits.length > 0) {
      await take($, current.rateLimits)
    } else {
      // Before the first reply, show the last known values, marked as such
      const saved = (await $.store.get(STORE_KEY)) as { limits?: Limit[] } | undefined
      const limits = pick(saved?.limits ?? [])
      if (limits.length > 0) await update($, usage, () => ({ limits, isStale: true }))
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await take($, e.rateLimits)
    return next(e)
  })

  // e.g. 5H 29% 1h15m / 7D 15% 4d. The slot's own content (focus, etc.) stays after it
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { limits, isStale } = await read($, usage)
    if (limits.length === 0) return next(e)
    const nowMs = await read($, now)
    const { Box, Text } = $.ui.resolve(e)
    const modes = e.props.modes

    return (
      <Box flexDirection="row">
        {limits.map((one, i) => {
          const left = untilReset(one.resetsAt, nowMs, one.kind === 'seven_day')
          const percent = shownPercent(one, nowMs)
          return (
            <Box key={one.kind} flexDirection="row">
              {i > 0 && <Text dimColor>{' / '}</Text>}
              <Text dimColor>{`${SHORT[one.kind]} `}</Text>
              <Text color={tone(percent)}>{`${percent}%`}</Text>
              {left !== '' && <Text dimColor>{` ${left}`}</Text>}
            </Box>
          )
        })}
        {isStale && <Text dimColor> (last)</Text>}
        {modes.length > 0 && <Text dimColor>{` & ${modes.join(' & ')}`}</Text>}
      </Box>
    )
  })
}
