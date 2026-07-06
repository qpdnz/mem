# orchestra — lenses.md (PRINCIPLE ZONE)

This file is the **principle zone**: guidance to apply with judgment, not verbatim
scaffolding. The concrete, copy-me artifacts (lens *definitions* to paste into a
proposer prompt, the per-type *attack sets* to paste into a breaker prompt, the
prompt templates) live in `references/prompts.md`. This file explains how to
*flesh those out* so a capable model adds real coverage instead of restating the
template. Over-scripting these would cause overfitting — the opposite of the goal.

## Why a principle zone exists at all

The verbatim zone (decisions.md, prompts.md templates, codex.md) pins down the
places where model variance *breaks* quality: thresholds, evidence rules, output
capture, convergence. Everything else — what a smart model notices when it reads
the code, which risks matter for *this* task — should stay open, because pinning
it produces shallow, checkbox coverage. Trust the model here; verify it in P5.

## Recon foci (P1) — how to look, not what to list

prompts.md §3 fixes the recon output shape. Apply these principles to fill it well:
- **Partition, don't overlap.** Coverage is guaranteed by carving mutually
  exclusive scopes (code / config+docs / prior art / tests), never by two agents
  re-reading the same files. A silent gap in collection cannot be recovered by any
  later review, so bias scopes toward *completeness of the union*.
- **Surface contradictions, not just inventory.** The most valuable recon line is
  "X in file A contradicts Y in file B", because that is where the task's real
  difficulty hides. Note them even when unsure.
- **Follow the task's blast radius.** For an implement task, trace callers and
  data owners of the thing being changed; for investigate, trace the claim back to
  its source; for review, map every surface the change can touch.

## Proposal lenses (P2) — differ by method, not by name

prompts.md §4 gives the canonical lens definitions (A minimal-change, B
root-cause, C ops/evolution). The failure mode is two proposals that carry
different labels but the same idea. To keep them genuinely independent:
- A lens is a **different objective function**, and it should change *what gets
  optimized*, not just the wording. Minimal-change accepts more coupling to keep
  the diff tiny; root-cause accepts a larger diff to remove the underlying defect;
  ops/evolution accepts more upfront structure to make the 6-month change cheap.
- If two lenses would produce the same artifact for this task, that is a signal
  the task has one obvious answer — say so, and spend the proposal budget on
  stress-testing that single answer instead of manufacturing fake alternatives.
- Push each proposer to **name the trade-off its lens is deliberately paying**, so
  the P3 judge can weigh real differences rather than surface phrasing.

## Attack angles (P5) — widen past the fixed set

prompts.md §6 lists per-type attack sets to apply verbatim (none omitted). Beyond
completing that set, a strong breaker *widens*:
- **Attack the win-condition, not just the artifact.** Ask whether passing the
  checklist actually means the user's real need is met, or whether the checklist
  was gameable. A green checklist over the wrong target is a blocker finding.
- **Attack the shared premise.** When all proposals (same-family models) agree on
  an assumption, that agreement is a *correlated blind spot*, not evidence. The
  highest-value codex/opus-breaker move is to disprove the premise everyone shared.
- **Reproduce, don't speculate.** Prefer a finding you can back with a pasted
  command output or a `file:line` over a hypothetical. An evidence-free finding is
  discarded by the convergence rule (decisions.md §5) — so spend effort where you
  can produce evidence.
- **Escalate by consequence.** Rank what you find by what breaks in production
  (data loss > wrong output on a common input > unhandled rare edge > style), and
  let that ranking, not count, drive severity.

## The single guardrail for this zone

Judgment here is bounded by one hard rule from the verbatim zone: **every claim
carries evidence, and evidence-free findings/claims do not count.** Freedom in
*what* to notice, zero freedom in *asserting without proof*. That is what keeps
the principle zone from degrading reproducibility.
