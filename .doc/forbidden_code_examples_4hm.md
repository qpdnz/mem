# 禁止コード NG/OK 例集

このファイルは、このプロジェクトで禁止されている Rust / Bevy 実装パターンを NG / OK 例にした補助資料。

## この markdown の書き方

- 1項目は `## 番号. 禁止したいパターン名` で始める。
- 禁止したいパターン名は、具体 API 名、具体 UI 名、具体値名ではなく、再発防止したい抽象パターン名で書く。
- 各項目には必ず `❌NG:` と `✅OK:` の両方を書く。
- `❌NG:` には禁止したい code 例を fenced code block で書く。
- `✅OK:` には推奨する置き場所、定数化、呼び出し方、または修正後の code 例を fenced code block で書く。
- 補足は `理由:` に短く書く。NG だけ、OK だけ、説明だけの項目にしない。
- 具体的な値を書くと陳腐化するため、値そのものではなく `*_LITERAL` / `*_VALUE` / `Cons_*` のような抽象名で書く。

````markdown
## N. Abstract forbidden pattern name

❌NG:

```rust
// forbidden example using abstract placeholders
```

✅OK:

```rust
// preferred example using abstract placeholders
```

理由:

- なぜ禁止するか。
````

---
