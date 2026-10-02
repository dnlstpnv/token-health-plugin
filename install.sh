#!/usr/bin/env bash
# Registers this folder in CLAUDE_CODE_PLUGIN_DIRS inside ~/.claude/settings.json,
# so every Claude Code session (terminal and desktop) loads token-health-plugin.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }

if command -v claude >/dev/null; then
  claude plugin validate "$PLUGIN_DIR" >/dev/null || { echo "claude plugin validate failed" >&2; exit 1; }
fi

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] && cp "$SETTINGS" "$SETTINGS.bak"

python3 - "$SETTINGS" "$PLUGIN_DIR" <<'PY'
import json, os, sys
path, plugin = sys.argv[1], sys.argv[2]
settings = json.load(open(path)) if os.path.exists(path) and os.path.getsize(path) else {}
env = settings.setdefault("env", {})
dirs = [d for d in env.get("CLAUDE_CODE_PLUGIN_DIRS", "").split(os.pathsep) if d]
if plugin in dirs:
    print(f"already installed: {plugin}")
    sys.exit(0)
dirs.append(plugin)
env["CLAUDE_CODE_PLUGIN_DIRS"] = os.pathsep.join(dirs)
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
print(f"installed: {plugin}")
PY

echo "Start a new Claude Code session to load it."
