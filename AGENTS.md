# aster-web

Asterを実行・観測・再生・比較するためのWebクライアント。

## Source of truth

- 実行意味論、Policy、Tool、RuntimeState、Evaluator、Reward、学習: `ryonakayama234/Aster`
- HTTP API: Asterの `docs/ServiceContract-v*.md`
- Webの表示状態、操作、可視化: このrepository

Web側はAsterの結果を作り直さない。canonical Run / Event / Artifact / trajectory / evaluationを観測し、UI上の解釈と実測証拠を区別する。

## 初期マイルストーン

最初は汎用チャットUIを作らない。

`agent-calculate-store-v0` を開始し、次の実測経路をブラウザで確認できることを完成条件にする。

```text
Job request
→ accepted / running
→ canonical Run
→ calculator
→ memory.put
→ memory.get
→ stop
→ evaluation
→ completed / failed / interrupted
```

calculatorの出力とmemoryの状態変更を同一視しない。`total=42` は成功した `memory.put` 後のstateからのみ表示する。

## Invariants

- Job IDとRun IDを同一視しない。
- `accepted` / `running` / `completed` / `failed` / `interrupted` を区別する。
- Run未作成時にJob情報からRunを捏造しない。
- task success、goal verification、reward、confidence等をWeb側で再計算しない。
- mock/demo値を実測値として表示しない。
- 欠けている情報を推測して補わず、未取得・未対応として表示する。
- requestへ任意shell、Python、module、filesystem pathを追加しない。
- Aster Serviceが公開するallowlisted recipeだけを実行する。
- Bearer tokenは永続保存せず、初期段階ではページメモリだけで扱う。
- UIの便利さを理由にAster Serviceのlocalhost / Origin / auth境界を黙って緩めない。

## Development

- TypeScriptを基本とし、API responseは境界で検査する。
- Asterのschema versionを検査し、未知versionを無言で解釈しない。
- pollingは前回通信完了後に次を開始し、古いresponseが新しい選択を上書きしないようにする。
- terminal Jobではpollingを停止する。
- 表示コンポーネントより、API client / state transition / evidence mappingを先にテストする。
- 変更は目的、制約、評価基準を明確にし、実装詳細は必要以上に固定しない。

## Initial pages

- Run: recipeを開始して状態とlive evidenceを見る。
- Runs: Serviceが返すJob履歴を見る。
- Inspect: 1 Runのtrajectory / state / evaluationをstep単位で調べる。

Replayや比較は、最初の実経路が成立した後に追加する。

## Not yet

初期段階では以下を実装済みとして扱わない。

- 自由task入力
- 任意Tool実行
- 学習済みDecisionModelの選択
- Intervention Learning
- Counterfactual Evaluation
- model promotion
- remote access / Cloudflare Tunnel
- corpus / tokenizer / pretrain workbenchの置換
