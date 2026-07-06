#!/usr/bin/env sh
# codex_ask.sh — invoke codex headlessly and capture ONLY the final answer.
#
# WHY THIS EXISTS: two portability hazards, solved deterministically so the
# conductor (possibly sonnet) never hand-rolls a fragile codex call.
#   1. codex's plain stdout interleaves a banner (workdir/model/session id) and a
#      "tokens used" footer around the answer. VERIFIED: `codex exec -o <FILE>`
#      (--output-last-message) writes ONLY the final assistant message to <FILE>,
#      clean of banner/footer. So we use the official flag, not a self-rolled
#      stdout parser.
#   2. On Windows Git Bash, heredocs / inline-quoted prompts hit quoting and
#      arg-length problems. VERIFIED fix: deliver the prompt as a FILE piped to
#      codex's stdin ('-').
#
# Usage:
#   sh codex_ask.sh <prompt_file> <out_file> [timeout_seconds] [cwd_dir] [effort]
#
#   <prompt_file>  file whose CONTENTS are the task for codex (self-contained;
#                  codex cannot see this chat or any skill file).
#   <out_file>     where the clean final answer is written (trailing newline added).
#   timeout_secs   optional, default 600. Enforced only if `timeout` exists.
#   cwd_dir        optional codex working root (-C). Point at the repo when codex
#                  must read code; the prompt then uses paths relative to it.
#                  Pass "" to skip -C while still setting a later argument.
#   effort         optional reasoning effort, default xhigh (pinned so user-config
#                  drift cannot silently weaken breaker/judge calls). Use medium
#                  for lightweight second opinions.
#
# Exit codes:
#   0  success, clean answer in <out_file>
#   2  usage / missing prompt file
#   3  codex not found            -> caller degrades this role to a fresh opus
#   5  timeout or codex nonzero exit; diagnostic stdout at <out_file>.log

set -u

prompt_file="${1:-}"
out_file="${2:-}"
timeout_secs="${3:-600}"
cwd_dir="${4:-}"
effort="${5:-xhigh}"

if [ -z "$prompt_file" ] || [ -z "$out_file" ]; then
  echo "usage: sh codex_ask.sh <prompt_file> <out_file> [timeout_seconds] [cwd_dir] [effort]" >&2
  exit 2
fi
if [ ! -f "$prompt_file" ]; then
  echo "prompt file not found: $prompt_file" >&2
  exit 2
fi
if ! command -v codex >/dev/null 2>&1; then
  echo "CODEX_UNAVAILABLE" >&2
  exit 3
fi

log_file="$out_file.log"

# Assemble the flag list. -m and reasoning effort are pinned (do not depend on
# user config drift); --color never keeps any incidental stdout parse-clean;
# -s read-only makes codex a thinker/critic that cannot write files. -C only
# when a cwd was given.
set -- exec --skip-git-repo-check -s read-only -m gpt-5.5 \
  -c "model_reasoning_effort=$effort" --color never -o "$out_file" -
if [ -n "$cwd_dir" ]; then
  set -- exec --skip-git-repo-check -s read-only -m gpt-5.5 \
    -c "model_reasoning_effort=$effort" --color never -C "$cwd_dir" -o "$out_file" -
fi

# Prompt via stdin from a FILE (Windows-safe). Plain stdout is only a diagnostic
# log; the real answer is what codex writes to $out_file via -o.
if command -v timeout >/dev/null 2>&1; then
  timeout "$timeout_secs" codex "$@" < "$prompt_file" > "$log_file" 2>&1
  rc=$?
else
  codex "$@" < "$prompt_file" > "$log_file" 2>&1
  rc=$?
fi

# codex writes -o with no trailing newline; add one so downstream `cat`/reads and
# file concatenation behave. Only if the file exists and is non-empty.
if [ -s "$out_file" ]; then
  # Append a newline iff the last byte isn't already one.
  last_byte="$(tail -c1 "$out_file" 2>/dev/null | od -An -tu1 2>/dev/null | tr -d ' ')"
  if [ "$last_byte" != "10" ]; then
    printf '\n' >> "$out_file"
  fi
fi

if [ "$rc" -ne 0 ]; then
  echo "CODEX_EXIT=$rc (diagnostic log: $log_file)" >&2
  # If -o produced nothing usable, surface the log so a human/agent can salvage.
  if [ ! -s "$out_file" ]; then
    cp "$log_file" "$out_file" 2>/dev/null
  fi
  exit 5
fi

# Success only if we actually captured an answer.
if [ ! -s "$out_file" ]; then
  echo "CODEX_EMPTY (no answer captured; log: $log_file)" >&2
  exit 5
fi

rm -f "$log_file" 2>/dev/null
exit 0
