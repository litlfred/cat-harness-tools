#!/usr/bin/env bash
# Install the `beans` issue-tracker CLI — the litlfred/beans fork of
# https://github.com/hmans/beans, pinned in scripts/software.json.
#
# `beans` is the session work-plan + cross-agent coordination tracker used by
# this repo (data lives in `beans/`, see `skills/sdlc/sdlc-core/todo-manager.md`).
# Fresh cloud sandboxes do NOT ship it, so this script reinstalls it on demand.
#
# Usage:
#   scripts/install-beans.sh            # install if missing or not the pinned build
#   scripts/install-beans.sh --force    # reinstall even if present
#
# Why the fork: upstream's bean types end at `task`, and a Task here is a BPMN
# task, so the store's leaf type is `story` (owner, 2026-10-16). The fork adds
# that type and nothing else. `go install` cannot build it — its module path is
# still github.com/hmans/beans and its embedded web UI needs a frontend build —
# so the one route is the pinned, checksummed release binary, which
# ensure-software installs into ~/.local/bin.
set -euo pipefail

FORCE="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG="$(bun -e 'const s=(await Bun.file(process.argv[1]).json()).software.find(e=>e.name==="beans");console.log(s.github.tag)' "$HERE/software.json")"
WANT="${TAG#v}"

is_pinned() { "$1" version 2>/dev/null | head -1 | grep -qF "$WANT"; }

if [ "$FORCE" != "--force" ] && command -v beans >/dev/null 2>&1 && is_pinned "$(command -v beans)"; then
  echo "beans ${WANT} already installed: $(command -v beans)"
  exit 0
fi

# A beans that is not the pinned build would satisfy ensure-software's
# "present" rung, so take its directory off PATH for the install and replace
# the copy in ~/.local/bin, where ensure-software writes.
BIN="$HOME/.local/bin"
rm -f "$BIN/beans"
CLEAN_PATH=""
IFS=: read -ra DIRS <<< "$PATH"
for d in "${DIRS[@]}"; do
  if [ -x "$d/beans" ] && ! is_pinned "$d/beans"; then
    echo "NOTE: $d/beans is not ${WANT}; ignoring it for this install." >&2
    continue
  fi
  CLEAN_PATH="${CLEAN_PATH:+$CLEAN_PATH:}$d"
done

PATH="$CLEAN_PATH" bun run "$HERE/ensure-software.ts" beans

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "NOTE: add '$BIN' to your PATH:  export PATH=\"$BIN:\$PATH\"" >&2 ;;
esac
if command -v beans >/dev/null 2>&1 && [ "$(command -v beans)" != "$BIN/beans" ] && ! is_pinned "$(command -v beans)"; then
  echo "NOTE: $(command -v beans) comes before $BIN on PATH and is not ${WANT}." >&2
fi

echo "Installed: $("$BIN/beans" version 2>/dev/null | head -1)"
echo "Verify with:  beans list  &&  beans check"
