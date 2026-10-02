import type { RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const measure = (tokens: number) => ({
  context: { tokens, window: 200_000, percent: Math.round((tokens / 200_000) * 100) },
  rateLimits: [],
  changed: ['context' as const],
})

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

test('band reports fill, weather and last-turn delta', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  // stands in for the engine's own band when the mod passes
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'engine') as RenderElement)

  await $.session.measure(measure(36_000))
  await $.session.measure(measure(134_400))
  await $.session.measure(measure(161_100))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-weather', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Storm' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /81% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /161\.1k \/ 200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▲ \+26\.7k last turn/ })).toBeDefined()
    await ui.unmount()
  }
})

test('band stays empty before the first reading', async ($, on) => {
  // stands in for the engine's own band when the mod passes
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'engine') as RenderElement)
  const ui = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /of context/ })).toBeUndefined()
  await ui.unmount()
})

test('band animates the running turn and clears when it ends', async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    yield { kind: 'thinking' as const, index: 0, text: 'x'.repeat(400) }
    yield { kind: 'text' as const, index: 1, text: 'y'.repeat(2_740) }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  on('turn.complete', () => ({ text: '' }))
  // stands in for the engine's own band when the mod passes
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, {}, 'engine') as RenderElement)

  await $.session.measure(measure(161_100))
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
    // drain the stream as the engine would
  }
  await clock.advance(23_040)

  const working = { ...BAND, props: { ...BAND.props, isWorking: true } }
  const ui = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', ...working })
  expect(await ui.find({ type: 'Text', text: /23s · ↓ 785 tokens · writing/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Storm' })).toBeDefined()
  await ui.unmount()

  await $.turn.complete({ reason: 'answer', turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' } as never)
  const idle = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', ...working })
  expect(await idle.find({ type: 'Text', text: /tokens ·/ })).toBeUndefined()
  await idle.unmount()
})
