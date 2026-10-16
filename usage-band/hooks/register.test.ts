import { describe, expect, test } from 'claude-code/testing'

import { crossings, pick, shownPercent, tone, untilReset } from './register'

const NOW = Date.parse('2026-10-11T10:00:00Z')

describe('計算', () => {
  test('回復までの残り時間を短く出す', () => {
    expect(untilReset('2026-10-11T12:13:00Z', NOW)).toBe('2h13m')
    expect(untilReset('2026-10-13T15:00:00Z', NOW)).toBe('2d5h')
    expect(untilReset('2026-10-11T10:05:00Z', NOW)).toBe('5m')
    expect(untilReset('2026-10-11T09:00:00Z', NOW)).toBe('')
    expect(untilReset(undefined, NOW)).toBe('')
  })

  test('回復の時刻を過ぎたら、次の値が届くまで 0% と出す', () => {
    expect(shownPercent({ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-11T09:00:00Z' }, NOW)).toBe(0)
    expect(shownPercent({ kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-11T12:00:00Z' }, NOW)).toBe(42)
    expect(shownPercent({ kind: 'five_hour', percentUsed: 42 }, NOW)).toBe(42)
  })

  test('週の枠は1日以上なら日数だけ', () => {
    expect(untilReset('2026-10-13T15:00:00Z', NOW, true)).toBe('2d')
    expect(untilReset('2026-10-12T09:00:00Z', NOW, true)).toBe('23h')
  })

  test('色は 50% で黄、80% で赤', () => {
    expect(tone(10)).toBe('success')
    expect(tone(50)).toBe('warning')
    expect(tone(80)).toBe('error')
  })

  test('5時間・1週間だけを、5時間を先に並べる', () => {
    const list = pick([
      { kind: 'spend_limit', percentUsed: 3 },
      { kind: 'seven_day', percentUsed: 90 },
      { kind: 'five_hour', percentUsed: 40 },
    ])
    expect(list.map(one => one.kind)).toEqual(['five_hour', 'seven_day'])
  })

  test('しきい値は新しく超えた時だけ・一番高いものを1回だけ知らせる', () => {
    const seen = new Set<string>()
    // 開いた直後（前から超えていた分）は鳴らさない
    expect(crossings([{ kind: 'seven_day', percentUsed: 85 }], seen, true)).toEqual([])
    // 同じ値では鳴らさない
    expect(crossings([{ kind: 'seven_day', percentUsed: 86 }], seen, false)).toEqual([])
    // 95% を超えたら1回だけ
    expect(crossings([{ kind: 'seven_day', percentUsed: 96 }], seen, false)).toEqual([
      '1週間の使用量が95%を超えました（いま96%）',
    ])
    expect(crossings([{ kind: 'seven_day', percentUsed: 97 }], seen, false)).toEqual([])
    // 一気に 0→95 超えでも、知らせは 95% の1件だけ
    expect(crossings([{ kind: 'five_hour', percentUsed: 99 }], seen, false)).toEqual([
      '5時間の使用量が95%を超えました（いま99%）',
    ])
  })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: 入力欄の下の段に使用量を出し、95% を超えたら知らせる`, async ($, on) => {
    const toasts: string[] = []
    on('clock.now', () => ({ value: NOW }))
    on('store.set', () => ({ value: undefined }))
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('session.measure', (_$, e) => ({ changed: e.changed }))

    const measure = (five: number, week: number) =>
      $.session.measure({
        context: { window: 200000 },
        rateLimits: [
          { kind: 'seven_day', percentUsed: week, resetsAt: '2026-10-13T15:00:00Z' },
          { kind: 'five_hour', percentUsed: five, resetsAt: '2026-10-11T12:13:00Z' },
        ],
        changed: ['rateLimits'],
      })

    await measure(42, 90)
    expect(toasts).toEqual([])

    const ui = await $.ui.mount({
      plugin: 'usage-band',
      surface,
      component: 'SessionMode',
      props: { modes: ['focus'] },
    })

    expect((await ui.find({ key: 'five_hour' }))?.text).toContain('42%')
    expect((await ui.find({ key: 'five_hour' }))?.text).toContain('5H')
    expect((await ui.find({ key: 'five_hour' }))?.text).toContain('2h13m')
    expect((await ui.find({ key: 'seven_day' }))?.text).toContain('7D')
    expect((await ui.find({ key: 'seven_day' }))?.text).toContain('90%')
    expect((await ui.find({ key: 'seven_day' }))?.text).toContain('2d')

    await measure(43, 96)
    expect(toasts).toEqual(['1週間の使用量が95%を超えました（いま96%）'])
    expect((await ui.find({ key: 'seven_day' }))?.text).toContain('96%')

    await ui.unmount()
  })
}
