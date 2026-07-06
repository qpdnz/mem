# codex CLI レシピ (orchestra 用)

codex = OpenAI GPT 系モデルを呼ぶ外部 CLI。オーケストラでの役割は「異モデル視点の注入」。
Claude 系と失敗モードが異なるため、同一モデルの偽の合意・測定不能な成功条件・儀式化した
プロンプト・移植性欠陥の検出に効く。「作る人」ではなく「壊す人 / 矛盾を見つける人 /
第二意見を出す人」として使う。

## 推奨経路: scripts/codex_ask.sh を使う (手打ちの codex exec より優先)

移植性の穴 (Windows Git Bash の heredoc/クォート地獄、stdout のバナー/フッター混入、
timeout・exit code の縮退分岐) を 1 箇所に閉じ込めた正規ラッパーがある。**指揮者は原則
これを使い、生の `codex exec` を手打ちしない**:

```bash
# 1) 純粋なタスク文だけをファイルに書く (出力コントラクト等はスクリプトが付ける):
printf '%s\n' "<codex への依頼本文 (自己完結。prompts.md の雛形で組む)>" \
  > <RUN_DIR>/codex_<役割>_prompt.md
# 2) 呼ぶ (第3引数=timeout秒 省略時600 / 第4引数=codex作業ルート -C、不要なら "" /
#    第5引数=reasoning effort 省略時 xhigh)。パスは引用符で囲む:
sh "<SKILL_DIR>/scripts/codex_ask.sh" \
   "<RUN_DIR>/codex_<役割>_prompt.md" \
   "<RUN_DIR>/codex_<役割>_answer.md" \
   600 "<repoルート絶対パス or ''>" xhigh
echo "codex_ask exit=$?"
# 3) 後続 agent には codex_<役割>_answer.md のパスを渡す (生 stdout/.log は渡さない)。
```

exit code: 0=成功 / 3=codex 不在 (その役割を opus に縮退) / 5=timeout・異常終了
(.log を確認して **1 回だけ再試行**、再失敗でその役割を opus 代替)。スクリプトは
`-o`(公式の最終メッセージ出力)で
バナー・フッターを除いた回答だけを answer ファイルに書き、末尾改行を保証する。
**実測確認済み**: `codex exec -o <FILE>` は最終メッセージのみをクリーンに出力する。

以下は、スクリプトを使えない/挙動を理解したい場合の**素の recipe** (参考)。
通常は上のラッパーを使うこと。

- 向く役割: 設計・成果物の破壊レビュー、diff レビュー、Claude 審査への第二意見、
  受入基準の曖昧さ検出、ログの独立分析。
- 向かない役割: 指揮者、初期偵察 (遅い)、read-only での実装、最終報告の主筆。

## 存在確認と縮退

存在確認は `orchestra_init.sh` の `CODEX_AVAILABLE` で済んでいる (手打ち不要)。ただし
`--version` は認証切れ・モデル利用不可を検出できないため、**その run の最初の
codex_ask.sh 呼び出しが実質の smoke test を兼ねる**: exit 3/5 や空応答が返ったら、その時点で
codex を「不在」扱いに切り替える。

縮退: その役割を opus subagent (プロンプト冒頭に「あなたは異モデル的視点を演じる懐疑的
レビュアー」と明示) で代替し、最終報告に「codex 不在のため Claude のみで実行 —
clean 判定は degraded-clean (単一モデル系、盲点相関リスク高)」と明記する。黙って縮退しない。

## codex への文脈の渡し方 (重要)

RUN_DIR は通常 `-C` (codex の作業ルート) の**外**にあるため、codex に RUN_DIR 内のファイルを
「Read せよ」と指示しても読めないことがある。**00_plan / 01_checklist / 台帳抜粋など RUN_DIR
由来の文脈は、プロンプトファイルに本文を逐語で貼り込む** (パス参照させない)。対象コードは
`-C` に repo ルートを渡し、プロンプトには相対パスを書いて読ませる。

既知の癖: 回答の末尾に短いメモ行 (例: `memo: ...`) が付くことがある。本文と矛盾しなければ
無視してよい。

## 基本レシピ (読み取り専用コンサル / レビュー — これが既定)

プロンプトは必ずファイルに書いてから stdin へパイプする (heredoc は PowerShell で動かず、
引数渡しは Windows のクォートで壊れる。ファイル経由なら両シェルで同一に動く):

```bash
# 1) プロンプトを書く: <RUN_DIR>/codex_<役割>_prompt.md (自己完結、下記「プロンプトの書き方」)
# 2) 実行 (Bash)。パスは空白対策で必ず引用符で囲む:
cat "<RUN_DIR>/codex_<役割>_prompt.md" | codex exec -C "<対象ディレクトリ>" \
  --skip-git-repo-check -s read-only -m gpt-5.5 \
  -c model_reasoning_effort=xhigh --color never \
  -o "<RUN_DIR>/codex_<役割>_answer.md" -
```

```powershell
# PowerShell の場合 (変数化して引用符で囲む):
$p = "<RUN_DIR>/codex_<役割>_prompt.md"; $t = "<対象ディレクトリ>"; $a = "<RUN_DIR>/codex_<役割>_answer.md"
Get-Content -Raw -LiteralPath $p | codex exec -C "$t" `
  --skip-git-repo-check -s read-only -m gpt-5.5 `
  -c model_reasoning_effort=xhigh --color never -o "$a" -
```

- **`-o` で最終回答だけをファイルへ**。stdout の思考ログ・進捗・hook ノイズを parse しない。
  後続 agent にはこの answer ファイルのパスを渡して原文を読ませる。
- `-m gpt-5.5` を明示する (ユーザー config 依存にしない)。`--color never` はパース前提の保険。
- `-C <dir>` が codex の作業ルート。read-only でもそのディレクトリのファイルは読める。
  コードを読ませたいときは repo ルートを指定し、プロンプトには相対パスを書く。
- `--skip-git-repo-check` は常に付ける (git repo 外でも動くように)。

## reasoning effort

- codex_ask.sh は effort を **xhigh に固定**している (第 5 引数で変更可。ユーザー config の
  変化で破壊レビューの推論強度が silently 落ちるのを防ぐ)。
- 軽い役割 (形式チェック等) だけ第 5 引数に `medium` を渡して下げる。

## 実行時間・並列・タイムアウト

- xhigh は 1 本数分かかる。**他に並列で進める Claude 側作業があるときは run_in_background で
  起動**して並走させ、完了通知後に `-o` ファイルを読む。並走相手がいないとき (light の P5 など、
  codex の結果待ちが次の一手のとき) は foreground で呼んで完了を待ってよい (待ちぼうけの
  background より単純)。
- codex の同時実行は **2 本まで** (CODEX_HOME・レート制限の競合を避ける)。出力ファイル名は
  役割ごとに分ける。
- 10 分で終わらなければ打ち切り、その役割を opus で代替して縮退を明記する。

## 書き込みが必要な場合 (稀: codex に修正をさせるとき)

`-s workspace-write` に変えるだけ (書けるのは -C 配下のみ)。同一ディレクトリへの
workspace-write 並列は禁止 (git worktree で分離してから)。
`--dangerously-bypass-approvals-and-sandbox` はこの skill では使わない。

## 構造化出力が要るとき

採点表など機械処理する出力は `--output-schema <schema.json>` で JSON Schema に強制できる。
schema ファイルも RUN_DIR に書いてから渡す。

## プロンプトの書き方 (codex 特有)

- codex はこの会話も skill ファイルも読めない。**ユーザー要求 / 勝利条件・受入チェックリスト /
  禁止事項 / 対象ファイルパス (または diff・ログの全文) / 出力形式 / 「未検証なら未検証と書け」**
  を全文埋め込む。
- 破壊レビューでは「最低 N 個指摘せよ」と書かない (幻覚を誘発する)。代わりに攻撃観点を固定し、
  指摘ゼロなら「試した攻撃観点と確認できなかった範囲の列挙」を要求する。
- 異モデル視点を明示すると盲点検出が効く:
  「あなたは異モデルの破壊レビュー担当。成果物を良く見せる必要はない。本番で壊れる前提で
  致命傷だけを探せ。各指摘は『引用 / 失敗シナリオ / 影響 / 最小修正 / 確信度』で出せ。」
- 出力言語を指定しないと英語になりがち。日本語成果物が欲しければ「日本語で」と書く。
