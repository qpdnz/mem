# orchestra — decisions.md (VERBATIM ZONE)

This file is the **deterministic decision layer**. Every table here removes a
judgment call from the conductor so that a sonnet conductor and an opus conductor
resolve it identically. Do NOT paraphrase, "simplify", or exercise discretion
against these tables. Apply them literally. If a case is ambiguous, follow the
tie-break rule printed with each table — never invent your own threshold.

Table of contents:
1. Effort decision table (light / standard / deep)
2. Task-type → topology decision table
3. Degradation matrix (codex absent / no git / non-code / no timeout / Windows)
4. Scoring rubric anchors (5 axes × 0/50/100)
5. Convergence rule for the adversarial loop (authoritative copy)

---

## 1. Effort decision table

Effort is **computed from mechanical signals, never chosen by feel.** Extract the
signals from the user's `/orchestra` argument (and a 30-second look at the repo),
fill the four signals, then read the verdict. This is the single most important
table for reproducibility — the v0 design's biggest defect was letting the
conductor "decide" effort.

Signals to extract (answer each yes/no or a count):

| Signal | How to determine it |
|---|---|
| `WRITES_FILES` | Will satisfying the request modify or create files? (implement/refactor/fix/write-doc = yes; explain/analyze/answer = no) |
| `NEW_DESIGN` | Does it require inventing a non-trivial approach with >1 viable option? (new feature/architecture/algorithm = yes; mechanical edit/lookup = no) |
| `SURFACE` | Rough count of files or components in scope. 0 = pure Q&A, 1–2 = local, 3+ = broad. |
| `IRREVERSIBLE` | Does it touch prod config, deletes, migrations, security, money, or public API? yes/no |

Verdict (evaluate top-to-bottom; **first matching row wins**):

| # | Condition | Effort |
|---|---|---|
| 1 | `IRREVERSIBLE = yes` | **deep** |
| 2 | `NEW_DESIGN = yes` AND `WRITES_FILES = yes` | **deep** |
| 3 | `NEW_DESIGN = yes` AND `SURFACE >= 3` | **deep** |
| 4 | `WRITES_FILES = yes` AND `SURFACE >= 3` | **deep** |
| 5 | `NEW_DESIGN = yes` (any other case) | **standard** |
| 6 | `WRITES_FILES = yes` AND `SURFACE = 1–2` | **standard** |
| 7 | `SURFACE >= 3` (read-only, no design) | **standard** |
| 8 | everything else (pure Q&A, tiny lookup, 1-file read) | **light** |

**Override:** if the user's argument literally contains `+light` / `+deep` (or
the long forms `--effort=light|standard|deep`), that wins outright — skip the
table. `+claude-only` is orthogonal: it forces the codex-absent degradation (§3),
it does not change effort.

**Tie-break / ambiguity rule:** when unsure which signal value applies, choose
the value that yields the HIGHER effort (safety-side rounding). Under-orchestrating
a hard task is the expensive failure; over-orchestrating a simple one only wastes
tokens, which this skill explicitly tolerates.

What each effort level runs (agent budget, not vibes). Phase numbers match
SKILL.md / prompts.md (P0 plan+checklist, P1 recon, P2 propose, P3 review, P4
execute, P5 breaker loop, P6 PO gate):

| Effort | Phases executed | Proposals | Reviewers | Breaker rounds (cap) | Recon agents |
|---|---|---|---|---|---|
| **light** | P0 (簡易), P4, P5, P6 (skip recon/propose/review) | — (conductor drafts directly) | — | 1 (cross-model: codex via codex_ask.sh; opus only as fallback) | 0–1 (inline) |
| **standard** | P0–P6 all | per SKILL.md §5 playbook (design: opus×2 + codex×1) | 1 fresh opus | up to 2 (every round includes the cross-model breaker) | 1+ |
| **deep** | P0–P6 all | per SKILL.md §5 + lens C | 1 fresh opus | up to 3 (terminate only when opus AND codex are both clean on the same version) | 1–2 |

Casting per task type lives in SKILL.md §5 (this table budgets phases/rounds; it
does not override the playbook's model assignments). The cross-model breaker is
NON-OPTIONAL at every effort level — it is the correlated-blind-spot alarm, and
dropping it is exactly the degradation §3 row 1 must record.

Note: **light still runs P5 (one breaker round) and P6 (the PO gate)** — even a
direct answer gets adversarially checked and graded before it ships. Skipping the
gate is never allowed. light's P0 簡易 = 00_plan.md (short form) + 01_checklist.md
with at least 3 items (one from the quality axes); light's P6 = conductor
self-grades against the §4 anchors (no separate grader agent).

---

## 2. Task-type → topology decision table

Classify the task into exactly ONE type, then run only the phases marked ●.
Running phases that don't apply (e.g. "build evidence" on a pure doc task) is the
v0 defect this table fixes. Empty cell = skip that phase for this type.
**Precedence:** this table describes standard/deep. When effort = light, the §1
phase set (P0 簡易, P4, P5, P6) WINS over any ● in this table — e.g. light ×
investigate runs no recon subagent even though the investigate column marks P1.

| Phase \ Type | investigate | design | implement | review | document |
|---|:---:|:---:|:---:|:---:|:---:|
| P0 plan+checklist | ● | ● | ● | ● | ● |
| P1 recon | ● | ● | ● | ● | ● (lighter) |
| P2 propose (opus×2, lenses) | | ● | ● | | ● |
| P3 review+integrate | | ● | ● | ● | ● |
| P4 execute | ● (writer) | ● (spec/plan) | ● (code+evidence) | ● (findings) | ● (writer) |
| P5 breaker | ● | ● | ● | ● | ● |
| P6 PO gate | ● | ● | ● | ● | ● |

Per-type notes (what P4 "execute" produces, and the evidence it must attach):

- **investigate**: P4 = an opus writer producing an answer with every factual
  claim carrying a `file:line` or a pasted command output. No code is written.
  Skip P2 (no competing designs to weigh) unless the investigation itself has
  multiple plausible root-cause hypotheses worth racing.
- **design**: P4 = a written spec/plan (not code). Evidence = the chosen design's
  trade-off table vs. the runner-up. Build/lint evidence is N/A.
- **implement**: P4 = code changes. Evidence is MANDATORY: the build/typecheck/
  test/lint command actually run, with its real output pasted. "It should
  compile" is a P5 blocker finding. When the change is a bug fix, the claimed
  root cause must also carry evidence that it actually contributed to the
  observed symptom (a before/after repro, log, or trace) — "the code compiles"
  is not evidence the real bug was addressed. Absent that evidence,
  `30_evidence.md` must say so explicitly (`contribution unconfirmed`) rather
  than assert the fix.
- **review**: P2/P4 collapse — there is nothing to build; the "artifact" is the
  review findings themselves. Run recon → produce findings → breaker attacks the
  findings (are they real? evidenced? complete?) → PO gate.
- **document**: P4 = a writer producing the doc. Evidence = the doc's claims are
  traceable to source. No build step.

If the task genuinely spans two types (e.g. "design AND implement"), run it as
**implement** (the superset) — implement already contains a design step in P2.

---

## 3. Degradation matrix

Each row is an environmental condition detected by `orchestra_init.sh` (or
observed). Apply the stated fallback **and log the degradation in 00_plan.md**
under a `## degradations` heading, one line each. Never silently drop capability.

| Condition (signal) | What breaks | Fallback (verbatim) |
|---|---|---|
| `CODEX_AVAILABLE=no` (or first codex_ask.sh call exits 3/5, or `+claude-only`) | codex proposer/breaker/second-opinion | Replace every codex role with a **fresh opus subagent** carrying the same prompt. In P5, run 2 independent opus breakers with DIFFERENT lens instructions instead of opus+codex. Any resulting clean verdict is reported as **degraded-clean** (single-model family; correlated-blind-spot risk stays). Log: `degradation: codex absent -> opus-only, clean=degraded-clean`. |
| `GIT_REPO=no` or `WORKTREE_OK=no` | worktree isolation for parallel writes | Do NOT attempt `git worktree`. Force P4 to a **single serial writer** (no parallel file writes), so isolation is unnecessary. Log: `degradation: no git -> serial single-writer P4`. |
| task is **non-code** (writing/research/analysis with no repo) | build/lint evidence, file:line citations | Evidence standard shifts from `file:line`/command-output to **verbatim source quotes + URLs/document locations**. P5 still demands evidence, just of this form. Skip any "run the build" step. Log: `degradation: non-code -> source-quote evidence`. |
| `timeout` binary absent (some minimal Windows shells) | codex hard time cap | `codex_ask.sh` auto-detects this and runs codex without a cap. Keep codex prompts SMALL so they finish fast; if a codex call appears hung (>10 min wall), treat as `CODEX_UNAVAILABLE` for that call and degrade to opus. Log: `degradation: no timeout -> uncapped codex, opus on hang`. |
| `OS=windows` (Git Bash) | heredoc quoting, path separators, `realpath` | All codex prompts go through **files** via `codex_ask.sh` (never heredoc on the command line). Use forward-slash paths; they work in Git Bash. Do not rely on `realpath`. This is already handled by the scripts — do not hand-roll codex invocations. |
| Workflow tool absent | deterministic orchestration engine | Ignore it. This skill NEVER hard-depends on the Workflow tool. The phase checklist in SKILL.md is the orchestration engine. |
| Agent tool concurrency limit hit | parallel subagents queue/stall | Cap simultaneous Agent subagents at **3**. codex processes are a SEPARATE budget (max 2, per codex.md) and do not count against the 3 — e.g. standard design P2 = opus×2 (subagents) + codex×1 (separate) is legal. If a phase needs more subagents, run recon first, then proposers. Never fire >3 subagents at once. |

---

## 4. Scoring rubric anchors

The 5 quality axes are scored 0–100 each. To keep grading reproducible, each axis
has concrete anchors at 0 / 50 / 100. **Grade against these anchors, not against a
private sense of "good".** `01_checklist.md` (P0) must instantiate these anchors with
task-specific detail before any work starts; a vague rubric makes every downstream
phase vague.

| Axis | 0 (fails) | 50 (partial) | 100 (exemplary) |
|---|---|---|---|
| **単純性 Simplicity** | Solves it with unjustified moving parts; a reviewer asks "why so complex?" | Works but carries 1–2 removable pieces or an awkward abstraction. | No part can be removed without losing a required behavior; the shape is obvious in hindsight. |
| **効率性 Efficiency** | Wastes obvious work (redundant passes, needless calls, O(n²) where O(n) is trivial). | Reasonable but leaves a known cheaper path untaken. | Cost matches the problem; no reviewer names a materially cheaper approach. |
| **正確性 Correctness** | A claim/output is wrong, or a case that clearly matters is unhandled. | Right on the happy path; a real edge case is unaddressed or unverified. | Verified against evidence; edge cases enumerated and handled or explicitly out-of-scope. |
| **信頼性 Reliability** | Breaks under a plausible input/environment (empty, missing dep, Windows, no network). | Handles the common environment; one plausible failure mode is unguarded. | Degrades predictably under each anticipated failure; failures are logged, not silent. |
| **進化性 Evolvability** | Next change requires understanding the whole thing / copy-paste to extend. | Extendable with effort; some coupling or missing seam. | A newcomer can locate and make the next likely change safely; seams and intent are documented. |

**Aggregate & threshold:** report all 5 scores. The ship threshold is **every
axis ≥ 90 AND no open P5 blocker finding.** A single axis below 90 sends the work
back to P4 with the named gap. Do not average the axes to paper over a weak one —
a 70 in Correctness is not redeemed by a 100 in Simplicity.

**Who grades:** for standard/deep, the P6 grader is a FRESH opus subagent that did
not produce the artifact and is DIFFERENT from the P5 breakers (no self-grading, no
grader who is invested in their own critique). It receives `01_checklist.md`'s
instantiated rubric verbatim. For light, the conductor self-grades (budget rule,
decided in §1).

**Bound on the grade→fix loop:** if any axis scores <90, do ONE remediation pass
against the named gap, then regrade ONCE. If still <90, ship-block: report the
verdict honestly as below-bar with the named gap (do not iterate further, do not
inflate the score).

---

## 5. Convergence rule for the adversarial loop (authoritative)

This is the authoritative copy; SKILL.md and prompts.md point here. It fixes the
v0 defect where a fresh breaker could always invent one more nitpick (divergence)
or rubber-stamp to end the loop (hollowing).

Definitions (severity vocabulary is unified across ALL orchestra files —
SKILL.md, prompts.md, the ledger — as `blocker / major / medium / minor`):
- A **finding** MUST carry evidence (a `file:line`, a pasted command output, or —
  for non-code — a verbatim source quote). A finding without evidence is
  **discarded by the conductor and does not count**.
- **blocker** = the artifact is wrong, unsafe, or fails a checklist item.
- **major** = a real deficiency against the rubric/checklist that is not a blocker.
- **medium** = real but shippable: fix, or accept with a written reason, or spin
  off as a follow-up task. Never continues the loop.
- **minor** = preference/style with no rubric impact. Recorded at most; filtered.

Each round, every breaker receives **the full list of prior-round findings** and
the verdict contract from prompts.md §6: report only NEW blocker/major findings
with evidence, tag same-root-cause repeats as `repeat` (they do not count as new),
and end with exactly one of `verdict: clean` (with the attack-angle-by-angle
audit of what was checked — a clean without that audit is invalid) or
`verdict: non-clean`.

Loop control:
- Continue while a round yields **≥1 new blocker OR ≥1 new evidenced major**.
- **Terminate when a round yields zero new blocker AND zero new evidenced major**
  (medium/minor findings do not block termination).
- Hard cap by effort (light=1, standard=2, deep=3 rounds). If the cap is hit with
  open blocker findings, DO NOT ship — report the unresolved blocker(s) in P6 and
  stop with an explicit "below bar" verdict. Hitting the cap is not a pass.

This makes divergence impossible (minor is filtered, priors can't be re-raised)
and hollowing detectable (a clean verdict requires the auditable
attack-angle-by-angle audit).

The "full list of prior-round findings" handed to each breaker is the **指摘一覧**
table in `<RUN_DIR>/40_ledger.md` (see prompts.md §8). The conductor pastes those
rows verbatim into the round-N breaker prompt; breakers never re-derive them.

---

## 6. Canonical artifact filenames

**Authoritative filename table lives in SKILL.md §1** (`00_plan.md`,
`01_checklist.md`, `02_recon_<持ち場>.md`, `10_proposal_<A/B/C>.md`, `20_judge.md`,
`21_plan_final.md`, `30_draft.md` (investigate/document) / `30_evidence.md` (implement) / `30_findings.md` (review), `40_ledger.md`, `50_report.md`, and
`codex_<役割>_prompt.md` / `_answer.md`). Use those names exactly; this section
does not redefine them. The phase→file mapping in SKILL.md §1 is the contract; the
tables in this file (effort, topology, rubric, convergence) are the *decision*
layer that feeds those phases.

**RUN_DIR location is defined by SKILL.md §1** (scratchpad-first, OS-temp
fallback, never inside the target project). `scripts/orchestra_init.sh` provides a
*portable fallback resolver and capability probe* for environments where the
conductor cannot determine those on its own; when both apply, SKILL.md §1 wins for
placement and the script's `CODEX_AVAILABLE`/`GIT_REPO`/`WORKTREE_OK`/`OS` signals
feed the degradation matrix (§3).
