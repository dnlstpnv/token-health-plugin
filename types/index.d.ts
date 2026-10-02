export type Reading = { tokens: number; window: number }

/** The running turn, as the band animates it; null between turns. */
export type Live = {
  frame: number
  seconds: number
  /** Output tokens so far: exact for finished steps, estimated for the one streaming. */
  tokens: number
  phase: string
}

declare module 'claude-code' {
  interface PluginState {
    'token-weather': { readings: Reading[]; live: Live | null }
  }
}
