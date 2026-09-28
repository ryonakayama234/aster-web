# aster-web

Asterをブラウザから実行・観測するための薄いWebクライアント。

## Goal

最初の完成点はチャットUIではなく、Asterの実際のAgent Runを1本 end-to-end で観測すること。

```text
Browser
  ↓ POST /jobs / GET /jobs/{job_id}
Aster Service (127.0.0.1)
  ↓ allowlisted recipe
Aster Agent Runtime
  ↓
Tool → Observation → State → Evaluator
  ↓
trajectory / evaluation / Run evidence
```

初回recipeはAster PR #18で追加中の `agent-calculate-store-v0`。固定された `40 + 2 → total` の経路を使い、calculator、memory.put、memory.get、stopの違いをstep単位で表示する。

Aster PR: https://github.com/ryonakayama234/Aster/pull/18

## Responsibility boundary

Asterが実行・評価・記録の正本。aster-webは開始・取得・表示・比較を担当する。

Web側でtask success、reward、confidence、state changeを再計算しない。Job IDとRun IDを分離し、canonical evidenceがない値を推測しない。

詳細は [AGENTS.md](AGENTS.md) を参照。

## First slice

現在のfeature branchには次を実装している。

1. TypeScript + React + Viteの最小アプリ。
2. Service URLとBearer tokenをページメモリで設定。
3. `/capabilities` と `/recipes` を読み、schemaと固定recipeを検査。
4. `agent-calculate-store-v0` のJobを開始。
5. 二重POSTを止め、前の通信完了後に次のpollを行う。
6. `accepted / running / completed / failed / interrupted` を区別。
7. Job ID / Run IDを別表示。
8. canonical Agent bundleのtrajectory、state before/after、observation、evaluationを表示。
9. API response schemaとterminal stateのunit test。

自由task入力、remote access、学習UIはこの縦切りが成立してから追加する。

## Local architecture

初期段階ではAster ServiceをWSL2/Linux側で起動し、同じPCのブラウザから接続する。

```text
aster-web dev server: http://localhost:5173
Aster Service:        http://127.0.0.1:8765
```

Aster ServiceはBearer tokenを要求し、localhost bindを維持する。

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

Aster側でPR #18相当のServiceを起動し、表示された接続キーをWebへ入力する。tokenはlocalStorage等へ永続化しない。

## Status

- repository contract: implemented on main
- Aster Service `agent.run`: PR #18, CI pytest / Pyright passed, not merged yet
- React/Vite Agent console: implemented on `feat/agent-run-console`
- aster-web tests/build: not executed in the current remote editing environment
- real browser → WSL Aster Service → Agent run: not verified yet
