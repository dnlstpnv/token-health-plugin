import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, Timer } from 'claude-code'

import type { Live, Reading } from '../types'

const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [])
const live = atom({ plugin: 'token-weather', key: 'live' } as const, null)

const HISTORY = 8
const BAR_WIDTH = 20
const TICK_MS = 120
const BARS = '▁▂▃▄▅▆▇█'
const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
// Roughly how many characters of streamed text make one token
const CHARS_PER_TOKEN = 4

const weather = (percent: number) =>
  percent >= 75
    ? { label: 'Storm', color: 'magenta' }
    : percent >= 50
      ? { label: 'Showers', color: 'yellow' }
      : { label: 'Clear', color: 'green' }

const k = (tokens: number) => `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`

const record = async ($: EngineInterface, context: SessionContextUsage) => {
  if (context.tokens === undefined) return
  const reading: Reading = { tokens: context.tokens, window: context.window }
  await update($, readings, list => [...list, reading].slice(-HISTORY))
}

// Context bar: █ filled at the last measure, ▓/▒ pulsing for what streams now, ░ free
const bar = (now: Reading, extra: number, frame: number) => {
  const cells = (tokens: number) => Math.min(BAR_WIDTH, Math.round((tokens / now.window) * BAR_WIDTH))
  const filled = cells(now.tokens)
  const growing = Math.max(extra > 0 ? 1 : 0, cells(now.tokens + extra) - filled)
  const free = Math.max(0, BAR_WIDTH - filled - growing)
  return { filled: '█'.repeat(filled), growing: (frame % 2 ? '▓' : '▒').repeat(growing), free: '░'.repeat(free) }
}

// The turn the band animates; the module's own, so a reload starts it over
const turn = { timer: undefined as Timer | undefined, startedAt: 0, doneTokens: 0, streamedChars: 0, phase: 'thinking', frame: 0 }

async function tick($: EngineInterface) {
  turn.frame += 1
  const snapshot: Live = {
    frame: turn.frame,
    seconds: Math.floor(((await $.clock.now()) - turn.startedAt) / 1000),
    tokens: turn.doneTokens + Math.round(turn.streamedChars / CHARS_PER_TOKEN),
    phase: turn.phase,
  }
  await update($, live, () => snapshot)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await record($, (await $.session.usage()).context)
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await record($, e.context)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    turn.timer?.cancel()
    Object.assign(turn, { startedAt: await $.clock.now(), doneTokens: 0, streamedChars: 0, phase: 'thinking', frame: 0 })
    await update($, live, () => ({ frame: 0, seconds: 0, tokens: 0, phase: 'thinking' }))
    turn.timer = $.clock.every(TICK_MS, () => void tick($))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    for await (const chunk of next(e)) {
      if (chunk.kind === 'thinking') {
        turn.phase = 'thinking'
        turn.streamedChars += chunk.text.length
      } else if (chunk.kind === 'text') {
        turn.phase = 'writing'
        turn.streamedChars += chunk.text.length
      } else if (chunk.kind === 'tool') {
        turn.phase = chunk.name
      } else if (chunk.kind === 'input') {
        turn.streamedChars += chunk.json.length
      } else if (chunk.kind === 'stop') {
        turn.doneTokens += chunk.usage?.output_tokens ?? Math.round(turn.streamedChars / CHARS_PER_TOKEN)
        turn.streamedChars = 0
      }
      yield chunk
    }
  })

  on('turn.complete', async ($, e, next) => {
    turn.timer?.cancel()
    turn.timer = undefined
    await update($, live, () => null)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, readings)
    const now = list.at(-1)
    const current = await read($, live)
    if (e.props.hasSurvey || (now === undefined && current === null)) return next(e)

    const { Box, Text } = $.ui.resolve(e)

    if (current !== null && e.props.isWorking) {
      const base = now ?? { tokens: 0, window: 200_000 }
      const percent = Math.round(((base.tokens + current.tokens) / base.window) * 100)
      const { label, color } = weather(percent)
      const { filled, growing, free } = bar(base, current.tokens, current.frame)

      return (
        <Box key="weather">
          <Text color={color}>{`${SPINNER[current.frame % SPINNER.length]} `}</Text>
          <Text bold color={color}>{label}</Text>
          <Text>{`  ${percent}%  `}</Text>
          <Text color={color}>{filled}</Text>
          <Text color={color} dimColor>{growing}</Text>
          <Text dimColor>{free}</Text>
          <Text dimColor>{`  (${current.seconds}s · ↓ ${current.tokens.toLocaleString('en-US')} tokens · ${current.phase})`}</Text>
        </Box>
      )
    }

    if (now === undefined) return next(e)

    const percent = Math.round((now.tokens / now.window) * 100)
    const { label, color } = weather(percent)
    const spark = list
      .map(r => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / r.window) * BARS.length))])
      .join('')
    const prev = list.at(-2)
    const delta = prev === undefined ? undefined : now.tokens - prev.tokens

    return (
      <Box key="weather">
        <Text bold color={color}>{label}</Text>
        <Text>{`  ${percent}% of context`}</Text>
        <Text dimColor>{`  ${k(now.tokens)} / ${k(now.window)}  last turns `}</Text>
        <Text color={color}>{spark}</Text>
        {delta === undefined ? null : (
          <Text dimColor>{`  ${delta >= 0 ? '▲ +' : '▼ -'}${k(Math.abs(delta))} last turn`}</Text>
        )}
      </Box>
    )
  })
}
