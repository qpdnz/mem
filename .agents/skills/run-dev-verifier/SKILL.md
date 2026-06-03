---
name: run-dev-verifier
description: "General plan execution and runtime verification skill. Use when Codex must execute `.plan/` tasks, continue implementation work, verify application behavior, run a local app, check UI flows, preserve existing dev-run settings, or decide whether static validation is insufficient. Discover project-local commands instead of assuming one fixed command."
---

# Run Dev Verifier

`.plan/` や実装依頼を、静的確認だけで終わらせず、必要な実行経路まで検証するためのスキル。
特定の言語、フレームワーク、command は仮定しない。各 workspace のルール、alias、README、設定を読んで、最小で正しい検証を選ぶ。

## Required Behavior

- `.notes/**` は読まない、列挙しない、編集しない、コミットしない。
- ユーザー指定の検証 command があれば最優先する。
- 次に project-local rule、README、config、task runner、build script、package script、alias を確認する。
- dev-run command は存在する場合だけ使う。存在しない project で固定 command として扱わない。
- fast dev setting、custom build cache、linker flag、run alias が既にある場合は維持する。check を通す目的で削除・迂回しない。
- runtime バグ、UI 操作後のバグ、アプリ挙動が対象なら、静的レビューや compile だけで成功扱いしない。
- 実行環境が無い、UI 操作できない、同時実行が危険などで runtime 検証できない場合は、未検証として制限と次の exact command を報告する。
- ユーザーが「質問しないで」「勝手に進めて」など不在前提を示したら、安全な仮定を置いて進め、仮定と残リスクを最後にまとめる。

## Plan Intake

1. ユーザーが特定の `.plan/*.md` を指定した場合は、そのファイルを最初に読む。
2. ユーザーが残 plan 実行、`.plan/` 実行、plan 継続を求めた場合は、`.plan/` 直下の有効な Markdown を直接列挙する。
3. 対象未指定なら、作業開始直後に確定した plan snapshot だけを今回の対象にする。
4. `.plan/done/**` はデフォルトで除外する。ユーザーが履歴として明示した場合だけ読む。
5. WIP / 作業中 / 進行中 / 保留を示す plan や、未コミット差分と衝突する plan は hold ledger に移す。
6. 未コミット差分があるだけで全停止しない。衝突しない plan は実行対象に残す。
7. `.plan/*.md` に未コミット差分がある plan 駆動作業では、途中の広い build/check/run を避け、統合後に必要な最終検証へ寄せる。
8. `.plan/` ファイル自体は、ユーザーまたは project rule が求めない限り移動・編集しない。

PowerShell での直接列挙:

```powershell
if (Test-Path -Path '.plan') { Get-ChildItem -Path '.plan' -File -Filter '*.md' }
```

## Command Discovery

検証 command は次の順で選ぶ。

1. ユーザーが明示した command。
2. `AGENTS.md`、project rule、README に書かれた command。
3. task runner、package script、Makefile、config、local alias の dev / check / test / run command。
4. app entrypoint が明確な場合の狭い run command。
5. 実行確認が不要な変更だけ、狭い static check / test command。

runtime 確認が必要なのに command が見つからない場合は、推測で広い command を連発せず、候補と根拠を報告する。

## Parallel Agent Intake

複数 plan、広い変更、UI / data / generation / adapter / service など独立分担できる境界がある場合は、`subagent-orchestrator` を読み、サブエージェント使用可否を作業内容から判定する。この skill が呼ばれていて分担条件に当たる場合は、subagent / delegation の明示依頼として扱う。

- subagent tool が利用可能で、現在の tool policy が spawn 全般を禁止していない場合は、ユーザーが別途「サブエージェントを使って」と書いていなくても spawn する。
- `would-use` は subagent tool が存在しない、起動自体が禁止されている、または並行作業が危険な場合だけ使う。
- 親 Codex が plan intake、統合、最終判断、検証 command を担当する。
- worker には exact file / module / role、重い検証を原則実行しない方針、所有範囲外を編集しない条件を渡す。
- サブエージェントや背景 thread を使った場合は、最終報告前に完了確認し、閉じられないものは id と理由を書く。

## Workflow

1. project entry rule と検証 command を探索する。
2. `.plan/` が依頼に含まれる場合、またはタスクが曖昧で `.plan/` がある場合は Plan Intake を行う。
3. `.notes/**` を除外して未コミット差分を確認する。
4. hold ledger と todo ledger を分ける。
5. 必要なら `subagent-orchestrator` に従って分担を判断する。
6. project-local 境界に従って変更を実装・統合する。
7. 変更後は、project rule が指定する format / lint / test / run command を選ぶ。
8. 同時実行中の build/watch/run session がないか確認してから、選んだ検証 command を実行する。
9. runtime 対象なら、起動ログ、エラー、要求された UI / user flow を可能な範囲で確認する。
10. ユーザーが起動維持を求めない限り、検証後はアプリを停止する。
11. 最終報告では、読んだ plan、完了 plan、保留 plan、変更、検証 command、runtime 確認可否、残リスクを正確に書く。

## Validation Rules

- static check だけで足りるか、runtime 起動が必要かを最初に分ける。
- project alias がある場合は正本にする。
- 長い build / run / test 系 command には十分な timeout を使う。
- 特定操作後の問題なら、その操作を検証経路に含める。
- 起動前に失敗した場合は、UI 挙動を検証済みと主張しない。
- dev-run 設定が原因で失敗する場合は、設定を黙って外さず、根本原因または blocker として扱う。

## Final Report

高信号の事実だけを書く。

- 読み取った `.plan/`、完了した `.plan/`、保留した `.plan/` と理由。
- サブエージェントを使った場合は ledger と統合状態。使えなかった場合は理由。
- 変更ファイル。
- 実行した command と結果。
- runtime / UI / user flow を実施したか。
- 置いた仮定、未実施、残るエラー・リスク。
