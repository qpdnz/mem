#!/usr/bin/env sh
# orchestra_init.sh — deterministic run-directory + capability probe.
#
# WHY THIS EXISTS: the conductor model (may be sonnet) must NOT decide where to
# write artifacts, whether codex exists, or whether this is a git repo. Those
# decisions leak model variance into the run. This script resolves them once,
# deterministically, and prints a machine-readable block the conductor copies
# verbatim into 00_plan.md.
#
# Usage:  sh orchestra_init.sh [run_root_base]
#   run_root_base  optional. The conductor passes "<scratchpad>/orchestra" here
#                  (scratchpad = the session's "Scratchpad Directory" from its
#                  own system prompt). If given and writable it wins; otherwise
#                  fall back to $TMPDIR -> $HOME -> cwd (last resort only).
# Output (stdout, KEY=VALUE lines, stable order):
#   ORCHESTRA_RUN_DIR=<abs path to created run dir>
#   ORCHESTRA_RUN_ROOT=<abs path to parent that holds all runs>
#   CODEX_AVAILABLE=yes|no
#   CODEX_VERSION=<string or "none">
#   GIT_REPO=yes|no
#   WORKTREE_OK=yes|no          # git repo AND `git worktree` usable
#   OS=windows|macos|linux|unknown
#   WRITE_BASE=scratchpad|tmp|home|cwd   # which candidate won for the run root
#
# Exit code is always 0 unless it truly cannot create ANY writable dir (rare);
# a degraded-but-usable environment still exits 0 so the pipeline proceeds.

set -u

# --- OS detection (no reliance on `uname -o`, which differs on Git Bash) ---
os="unknown"
case "$(uname -s 2>/dev/null)" in
  Linux*)  os="linux" ;;
  Darwin*) os="macos" ;;
  MINGW*|MSYS*|CYGWIN*) os="windows" ;;
  *) # Windows Git Bash sometimes reports odd strings; fall back to env sniff
     if [ -n "${WINDIR:-}" ] || [ -n "${SYSTEMROOT:-}" ]; then os="windows"; fi ;;
esac

# --- codex probe ---
codex_available="no"
codex_version="none"
if command -v codex >/dev/null 2>&1; then
  # `codex --version` prints e.g. "codex-cli 0.142.3"; keep it short & tolerant.
  v="$(codex --version 2>/dev/null | head -n1 | tr -d '\r')"
  if [ -n "$v" ]; then
    codex_available="yes"
    codex_version="$v"
  fi
fi

# --- git repo probe ---
git_repo="no"
worktree_ok="no"
if command -v git >/dev/null 2>&1; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git_repo="yes"
    # worktree add requires a repo with at least one commit; probe cheaply.
    if git rev-parse --verify HEAD >/dev/null 2>&1; then
      worktree_ok="yes"
    fi
  fi
fi

# --- run root: [arg1] -> $TMPDIR/orchestra-run -> ~/.orchestra-run -> cwd/.orchestra-run ---
# arg1 (the session scratchpad, passed by the conductor) wins when writable, so
# artifacts land where the session already keeps temp files. OS temp is next so
# the target project is NOT polluted (SKILL.md §1 forbids writing run artifacts
# inside the project). Home next; cwd is the LAST resort only.
base_arg="${1:-}"
stamp="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo run)"
# add the PID as a suffix to avoid same-second collisions
suffix="$$"

write_base="tmp"
run_root=""
for cand in ${base_arg:+"$base_arg"} "${TMPDIR:-/tmp}/orchestra-run" "${HOME:-/tmp}/.orchestra-run" "$(pwd)/.orchestra-run"; do
  if mkdir -p "$cand" 2>/dev/null && [ -w "$cand" ]; then
    run_root="$cand"
    case "$cand" in
      "$base_arg") write_base="scratchpad" ;;
      "${TMPDIR:-/tmp}/orchestra-run") write_base="tmp" ;;
      "${HOME:-/tmp}/.orchestra-run") write_base="home" ;;
      *) write_base="cwd" ;;
    esac
    break
  fi
done

if [ -z "$run_root" ]; then
  echo "ORCHESTRA_FATAL=no_writable_dir"
  exit 1
fi

run_dir="$run_root/$stamp-$suffix"
# Artifacts are flat files inside the run dir (00_plan.md, 01_checklist.md,
# 10_proposal_A.md, ... , 40_ledger.md). SKILL.md §1 is the authoritative
# filename table.
mkdir -p "$run_dir" 2>/dev/null

# Resolve to absolute where possible (Git Bash lacks realpath sometimes).
abspath() {
  # $1 is a dir that already exists
  ( cd "$1" 2>/dev/null && pwd ) || echo "$1"
}
run_dir_abs="$(abspath "$run_dir")"
run_root_abs="$(abspath "$run_root")"

echo "ORCHESTRA_RUN_DIR=$run_dir_abs"
echo "ORCHESTRA_RUN_ROOT=$run_root_abs"
echo "CODEX_AVAILABLE=$codex_available"
echo "CODEX_VERSION=$codex_version"
echo "GIT_REPO=$git_repo"
echo "WORKTREE_OK=$worktree_ok"
echo "OS=$os"
echo "WRITE_BASE=$write_base"
exit 0
