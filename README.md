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

初回Agent recipeはAster mainへmerge済みの `agent-calculate-store-v0`。固定された `40 + 2 → total` の経路を使い、calculator、memory.put、memory.get、stopの違いをstep単位で表示する。

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

## Research Observatory

Aster #29 / aster-web #2 の最小vertical sliceとして、保存済みDecision研究をread-onlyで比較する画面を追加中です。

```text
Browser
  ↓ GET /experiments
Aster Service
  ↓ versioned public projection
committed research evidence
  ↓
Experiment → arm/seed → shared case
  ↓
target / selected Action / persisted correctness / target tokenization
```

初版は `decision-failure-audit-v0`。candidate scoreやlearning curveがcommit済みreportに無い場合は
`unavailable_from_committed_evidence` と表示し、Webで再計算しません。
この画面はsaved modelの新規実行ではなく、既存研究証拠を調べる観測系です。

## Status

- repository contract: implemented on main
- Aster Service fixed `agent.run`: PR #18 merged to Aster main
- React/Vite fixed Agent console: merged to aster-web main via PR #1
- Research Observatory: branch `feat/research-observatory-v0`, depends on Aster PR #47
- aster-web tests/build: this branch should run `npm test && npm run build` on the user/CI environment; remote GitHub editing itself does not execute npm
- real browser → WSL Aster Service → Research Observatory: not verified yet
