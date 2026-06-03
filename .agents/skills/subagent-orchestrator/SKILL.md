---
name: subagent-orchestrator
description: "General subagent orchestration skill. Use when Codex should decide whether to split a task across explorer/worker agents, manage ownership boundaries, keep heavy verification commands under the parent agent, or coordinate multiple `.plan/`, UI, data, generation, adapter, service, documentation, or configuration changes. When this skill is invoked directly or by another skill, treat that as an explicit delegation request for available subagent tools."
---

# Subagent Orchestrator

サブエージェントは並列の補助役として使い、作業全体の所有者にはしない。
親エージェントが project rule、機能境界、責務分離、依存方向、統合、検証、最終報告を持つ。

## Core Rules

- `.notes/**` は探索・確認・参照・編集・コミットしない。
- project-local naming / module / build / verification rule を最優先する。
- この skill がユーザー指定、他 skill 経由、または作業条件によって読み込まれた時点で、subagent / delegation の明示依頼として扱う。
- 作業内容が使う条件に当たり、`spawn_agent` などの subagent tool が利用可能なら、ユーザーが別途「サブエージェントを使って」と書いていなくても spawn する。
- `would-use` は subagent tool が存在しない、起動自体が禁止されている、または並行作業が危険な場合だけ使う。明示文言が無いことだけを理由にしない。
- サブエージェントを開始した場合、最終報告前に ledger を確認し、完了・不要・失敗・scope 外の agent を閉じる。
- ユーザーの明確な停止・中断・キャンセル指示がある場合だけ作業を止める。追加指示は停止ではなく再計画として扱う。

## Use Decision

使う条件:

- 複数 plan、複数 feature、または UI / data / generation / adapter / service / docs / config などで所有範囲を分けられる。
- explorer の読み取り専用調査が親の直近作業と並行して進む。
- worker の所有範囲を exact file / module / role で切れる。
- heavy verification を親だけが持てば、並列化による cache / process / file conflict を避けられる。

使わない条件:

- 単一 file の小修正、または親が手元で直す方が早い。
- 直近 blocker が親の次作業を止めており、agent 待ちだけになる。
- 単一 type、密結合 module、共有 alias、build 設定など conflict しやすい。
- 作業ツリーや外部プロセスが危険な並行状態。
- subagent tool が存在しない、または現在の tool policy が spawn 全般を許していない。

## Generic Roles

project-local role / prefix がある場合はそれに従う。無い場合は次で分ける。

- Core Logic: domain state、calculation、validation、format、factory、state operation。
- Data Definition: saved data、schema、config、DTO。原則 field-only。
- Adapter: UI、I/O、external API、framework 固有型との変換。
- Service: orchestration、use case、workflow、background job。
- Registration: route、handler、plugin、dependency injection、startup config。
- Generation Source: generator、schema、source config。generated output だけを単独 owner にしない。
- Documentation: docs、plans、examples、migration notes。
- Read-only Analysis: ownership、dependency、call graph、rule discovery。

## Control Loop

1. spawn 前に短い制御計画を作る。
   - 親が持つ直近のクリティカルパス。
   - agent に渡せる独立作業。
   - worker ごとの exact ownership。
   - explorer ごとの読み取り専用質問。
   - verification command の所有者と実行タイミング。
   - 統合に必要な出力形式。
2. 目的が明確な少数の agent だけを spawn する。
3. agent 実行中、親は重ならない作業を進める。
4. agent 結果が本当に必要な場面だけ待つ。
5. 返ってきた変更や調査結果を親が確認し、統合と検証を行う。
6. 最終回答前に ledger を棚卸しし、開いた agent を残さない。

## Verification Management

format、lint、type check、build、test、run、external service access など副作用や時間の重い command は親エージェントが所有する。subagent の通常作業にはしない。

verification policy:

- `none`: 検証 command を実行しない。探索、diff、静的レビューで進める。
- `after-integration`: worker 変更を統合後に狭い検証を一回だけ走らせる。
- `behavior-run`: runtime 挙動変更を統合後に app run / UI flow を行う。
- `broad-final`: public API、build 設定、複数 app、生成 index、またはユーザー明示時だけ広い検証を行う。

タイミング規則:

- worker が編集中の間は、返却 error が次の blocker である場合を除き heavy command を走らせない。
- 同じ workspace で複数 agent に重い command を並列実行させない。
- 小さい編集ごとに検証 command を走らせない。
- project-local alias がある場合は、それを優先する。
- active build、watcher、run session、他 task がある場合は、新しい command が安全か確認する。

## Delegation Rules

- explorer は、期待する出力が明確な読み取り専用質問に使う。
- worker は、書き込み範囲が分離された bounded な実装作業に使う。
- 同じ未解決質問や同じ file ownership を複数 agent に割り当てない。
- architecture 判断、最終 API、conflict 解決、検証 ownership は親が持つ。
- generator/source config を所有する task でない限り、generated artifact の直接編集を頼まない。
- 変更では、feature、role directory、exact file list による ownership を優先する。
- package manifest、lockfile、generated index、shared alias は単一 owner にする。
- project rule が明示的に許可しない限り、subagent に heavy verification や test 追加を任せない。

## Prompt Contract

worker prompt に入れる内容:

```text
Agent name: <短い作業名>
目的: <具体的な実装結果>。
所有範囲: <files/modules/responsibility> だけを編集する。
境界: <触ってはいけない file/area> は編集しない。
Role: <Core Logic | Data Definition | Adapter | Service | Registration | Generation Source | Documentation>。
協調: 他 agent やユーザーの無関係な変更を revert しない。
ルール: <project-local rules, .notes 除外, naming/build/verification rules>。
Verification policy: <none | after-integration | behavior-run | broad-final>。明示 command がない限り重い検証 command を実行しない。
最終回答: changed files、実装要約、検証、未解決 risk。
```

explorer prompt に入れる内容:

```text
Agent name: <短い調査名>
質問: <具体的な codebase 質問>。
範囲: <files/modules/search area> を調査する。ファイルは編集しない。
ルール: <project-local rules, .notes 除外>。
最終回答: findings、file path、line reference、不確実な点。
```

## Integration

親 thread で小さい ledger を保つ。

```text
Agent task name | Type | Role | Scope | Status | Needed by
```

agent 完了後:

- final answer と changed files を確認してから受け入れる。
- scope 外変更は取り込まないか、親が分離する。
- conflict は親 thread で解消し、owner を一つに決める。
- 統合後の blast radius に合う検証だけを走らせる。
- 結果を消費した agent は閉じる。

## Failure Handling

- agent が scope 外へ drift したら、interrupt または close して親が手元で続ける。
- 2 agent が conflict したら、owner を一つ選び、親が統合を解決する。
- task が blocker になったら、追加 spawn を止め、親が blocking work を手元で行う。
- agent result が noisy なら、次の prompt は scope を小さくし、output format を厳しくする。
