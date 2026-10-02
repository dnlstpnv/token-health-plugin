# token-health-plugin

A Claude Code mod that shows how full the context window is, as weather, in a band above the prompt.

Between turns:

```
Storm  81% of context  161.1k / 200k  last turns ▁▃▆█  ▲ +26.7k last turn
```

While Claude works, the band animates:

```
✻ Storm  81%  ████████████████▓░░░  (23s · ↓ 785 tokens · writing)
```

| Part | Meaning |
| --- | --- |
| Weather | **Clear** (green) below 50%, **Showers** (yellow) from 50%, **Storm** (magenta) from 75% |
| `81% of context` | Input tokens of the last response against the model's context window |
| `161.1k / 200k` | The same figures in tokens |
| `last turns` | Fill after each of the last 8 turns, as a sparkline |
| `▲ +26.7k last turn` | Change since the previous turn; `▼` when it drops, e.g. after compaction |

While a turn runs:

| Part | Meaning |
| --- | --- |
| `✻` | Spinner, one frame every 120 ms |
| `████████████████` | Context filled at the last measure |
| `▓` / `▒` (pulsing) | Output streaming now, which the next request will carry as context |
| `░` | Free context |
| `23s` | Time since the turn started |
| `↓ 785 tokens` | Output tokens this turn: exact for finished model requests, estimated (4 characters per token) for the one streaming |
| `writing` | What the model is doing: `thinking`, `writing`, or the name of the tool it is calling |

Subagent output is not counted.

The idle figures come from the `session.measure` event, which fires after each turn and carries the same numbers the status line uses. The band stays hidden until the first response of a session and while a survey holds the band.

## Requirements

- Claude Code with function-hook plugins (built and tested on 2.1.287; the plugin API is early access and may change between releases)
- `python3` for the install scripts (preinstalled on macOS)

## Install

### Every session (recommended)

```bash
./install.sh
```

It validates the plugin, backs up `~/.claude/settings.json` to `settings.json.bak`, and adds this folder's absolute path to `env.CLAUDE_CODE_PLUGIN_DIRS`. Existing entries are kept. Start a new Claude Code session to load it.

The path is absolute, so moving the folder needs `./uninstall.sh` from the old location and `./install.sh` from the new one.

### One session only

```bash
claude --plugin-dir ~/Documents/token-health-plugin
```

### Uninstall

```bash
./uninstall.sh
```

## Customize

All settings are constants in `hooks/register.tsx`:

- `weather()` sets the thresholds, labels and colors
- `HISTORY` sets how many turns the sparkline keeps (default 8)
- `BAR_WIDTH`, `TICK_MS`, `SPINNER` and `CHARS_PER_TOKEN` shape the animation

In an interactive session the folder is watched, so saving a file reloads the mod with no restart. Run `claude --debug` to see why a hook failed or a band did not draw.

## Develop

```bash
claude plugin validate .   # manifest and hooks, as the engine reads them
claude plugin test .       # runs tests/*.test.ts
tsc -p .                   # type-check; needs one load first (see below)
```

`tsc` reads the API types from `.claude-plugin/types/`, which Claude Code writes when it loads the plugin. Load it once (install it, or run `claude --plugin-dir .`) before type-checking. That folder is git-ignored.

## Layout

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             names the hooks module
hooks/register.tsx           the mod
types/index.d.ts             $.state contract (readings history, running turn)
tests/weather.test.ts        tests
install.sh / uninstall.sh    register or remove the folder in ~/.claude/settings.json
```
