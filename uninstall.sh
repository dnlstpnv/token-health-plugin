#!/usr/bin/env bash
# Removes this folder from CLAUDE_CODE_PLUGIN_DIRS in ~/.claude/settings.json.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

[ -f "$SETTINGS" ] || { echo "nothing to do: $SETTINGS not found"; exit 0; }
cp "$SETTINGS" "$SETTINGS.bak"

python3 - "$SETTINGS" "$PLUGIN_DIR" <<'PY'
import json, os, sys
path, plugin = sys.argv[1], sys.argv[2]
settings = json.load(open(path))
env = settings.get("env", {})
dirs = [d for d in env.get("CLAUDE_CODE_PLUGIN_DIRS", "").split(os.pathsep) if d and d != plugin]
if dirs:
    env["CLAUDE_CODE_PLUGIN_DIRS"] = os.pathsep.join(dirs)
else:
    env.pop("CLAUDE_CODE_PLUGIN_DIRS", None)
    if not env:
        settings.pop("env", None)
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
print(f"uninstalled: {plugin}")
PY
