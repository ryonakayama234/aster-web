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

## Planned first slice

1. TypeScript + React + Viteの最小アプリを作る。
2. Service URLとBearer tokenをページメモリで設定する。
3. `/capabilities` と `/recipes` を読み、schemaを検査する。
4. `agent-calculate-store-v0` のJobを開始する。
5. `accepted / running / completed / failed / interrupted` をpollして表示する。
6. completed Runのtrajectory、state before/after、observation、evaluationを表示する。
7. API/state mappingのテストを追加する。

自由task入力、remote access、学習UIはこの縦切りが成立してから追加する。

## Local architecture

初期段階ではAster ServiceをWSL2/Linux側で起動し、同じPCのブラウザから接続する。

```text
aster-web dev server: http://localhost:5173
Aster Service:        http://127.0.0.1:8765
```

Aster ServiceはBearer tokenを要求し、localhost bindを維持する。

## Status

- repository contract: started
- Aster Service `agent.run`: PR #18, not merged yet
- React/Vite application: not scaffolded yet
- real browser Agent run: not verified yet
