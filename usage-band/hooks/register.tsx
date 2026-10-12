import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Usage } from '../types'

// 入力欄の下の段の右側（SessionMode の表示）に、5時間・1週間の使用量と回復までの時間を常に出す。
// 会話の枠を狭めないよう、行は増やさない（2026-10-11 倉田さんの選択で、入力欄の上の帯から移した）。
// データは Claude Code 自身が持っている使用量（$.session.usage と session.measure）だけを読む。
// ネット通信・ファイルの読み書き・コマンド実行はしない。

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, {
  limits: [],
  isStale: false,
} as Usage)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const LABEL: Record<string, string> = { five_hour: '5時間', seven_day: '1週間' }
// 下の段の表示用。デスクトップはこの場所の幅が決まっていて、長いと「…」で切られる（実測・約13文字分）。
// 枠の名前は大文字、残り時間は小文字にして見分ける（5H 29% 1h15m / 7D 15% 4d・2026-10-11 倉田さんと決定）
const SHORT: Record<string, string> = { five_hour: '5H', seven_day: '7D' }
const ORDER = ['five_hour', 'seven_day']
const WARN_AT = [80, 95]
const STORE_KEY = 'last'
const MINUTE = 60_000

/** 5時間・1週間の枠だけを、決まった順に並べる */
export const pick = (list: readonly Limit[]): Limit[] =>
  list
    .filter(one => one.kind in LABEL)
    .map(one =>
      one.resetsAt
        ? { kind: one.kind, percentUsed: one.percentUsed, resetsAt: one.resetsAt }
        : { kind: one.kind, percentUsed: one.percentUsed },
    )
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

/** 使用率に応じた色（テーマの色名なので、ライトでもダークでも読める） */
export const tone = (percent: number) =>
  percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'

/**
 * 回復までの残り時間を短く（1h23m ／ 45m ／ 2d5h・倉田さんの指定）。タイムゾーンに左右されないよう残りで出す。
 * isDaysOnly は週の枠用: 1日以上なら日数だけ（4d）にして幅を節約する
 */
export const untilReset = (resetsAt: string | undefined, nowMs: number, isDaysOnly = false): string => {
  if (!resetsAt || !nowMs) return ''
  const ms = Date.parse(resetsAt) - nowMs
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return '回復済み'
  const minutes = Math.ceil(ms / MINUTE)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return isDaysOnly ? `${days}d` : `${days}d${hours}h`
  if (hours > 0) return minutes % 60 === 0 ? `${hours}h` : `${hours}h${minutes % 60}m`
  return `${minutes}m`
}

/**
 * 80%・95% を新しく超えた枠の知らせ文（枠ごとに一番高いものだけ）。
 * seen は「もう知らせた」の記録。下回ったら記録を消し、次に超えた時にまた知らせる。
 * isQuiet の時は記録だけして知らせない（開いた直後に、前から超えていた分を鳴らさないため）。
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
      out.push(`${LABEL[one.kind]}の使用量が${top}%を超えました（いま${one.percentUsed}%）`)
    }
  }
  return out
}

// 「もう知らせた」の記録と、最初の受け取りが済んだか（読み込み直すとリセットされる）
const seen = new Set<string>()
let isSeeded = false

/** 「今」を進めて、回復までの時間を数え直す */
async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
}

/** 受け取った使用量を表示・保存し、新しく超えたしきい値を知らせる */
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
    // 1分ごとに回復までの時間を数え直す
    await tick($)
    $.clock.every(MINUTE, () => {
      void tick($)
    })

    const current = await $.session.usage()
    if (current.rateLimits.length > 0) {
      await take($, current.rateLimits)
    } else {
      // まだ最初の返事が来ていない時は、前回の値を「前回の値」と明記して出しておく
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

  // 例: 5H 29% 1h15m / 7D 15% 4d。元からある表示（focus など）は後ろに残す
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
          return (
            <Box key={one.kind} flexDirection="row">
              {i > 0 && <Text dimColor>{' / '}</Text>}
              <Text dimColor>{`${SHORT[one.kind]} `}</Text>
              <Text color={tone(one.percentUsed)}>{`${one.percentUsed}%`}</Text>
              {left !== '' && <Text dimColor>{` ${left}`}</Text>}
            </Box>
          )
        })}
        {isStale && <Text dimColor>（前回）</Text>}
        {modes.length > 0 && <Text dimColor>{` & ${modes.join(' & ')}`}</Text>}
      </Box>
    )
  })
}
