# 実装ログ: Phase 01 DB/セッション基盤刷新（データモデル移行）

作成日: 2026-02-18（JST）
対象手順書: `references/implementation_plans/260218_phase01_data_model_migration.md`

> ルール:
> - 秘匿情報は記録しない
> - ターミナル出力は本ファイル内に直接記録する
> - 失敗した試行も省略しない

## 進捗サマリ

- [x] 事前準備（コマンド確認・ブランチ作成）
- [x] Step 1: Firebaseローカル構成ファイル整備
- [x] Step 2: V2スキーマ/ビルダー/Invariant追加
- [x] Step 3: V1→V2変換と互換読み取り
- [x] Step 4: 画面コード書き込み経路V2化
- [x] Step 5: 移行CLIスクリプト実装
- [x] Step 6: テスト追加
- [x] Step 7: README/台帳更新
- [x] Step 8: 完了判定

---

## 1. 事前準備

### 実行コマンド/出力

```bash
$ command -v git rg node npm firebase java && node -v && npm -v && firebase --version && java -version
/usr/bin/git
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/path/rg
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/bin/node
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/bin/npm
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/bin/firebase
/usr/bin/java
v18.20.7
10.8.2
13.34.0
openjdk version "21.0.2" 2024-01-16
OpenJDK Runtime Environment (build 21.0.2+13-58)
OpenJDK 64-Bit Server VM (build 21.0.2+13-58, mixed mode, sharing)

$ git checkout -b feature/260218-phase01-data-model-migration
Switched to a new branch 'feature/260218-phase01-data-model-migration'

$ git status --short && git branch --show-current
?? references/implementation_logs/260218_phase01_data_model_migration.md
?? references/implementation_plans/260218_phase01_data_model_migration.md
feature/260218-phase01-data-model-migration
```

判定: Pass


---

## 2. Step 1 実施（Firebaseローカル構成ファイル整備）

### 変更内容

- 作成: `firebase.json`
- 作成: `firestore.rules`
- 作成: `firestore.indexes.json`
- `.firebaserc` は任意扱いのため未作成

### 実行コマンド/出力

```bash
$ ls -la firebase.json firestore.rules firestore.indexes.json || true
-rw-r--r--@ 1 yoshidont_mind  staff  310 Feb 18 19:25 firebase.json
-rw-r--r--@ 1 yoshidont_mind  staff   44 Feb 18 19:25 firestore.indexes.json
-rw-r--r--@ 1 yoshidont_mind  staff  249 Feb 18 19:25 firestore.rules

$ if [ -f .firebaserc ]; then ls -la .firebaserc; else echo '.firebaserc: (not created, optional)'; fi
.firebaserc: (not created, optional)

$ firebase emulators:start --only firestore --project demo-pokemon-card-game-online
i  emulators: Starting emulators: firestore
i  emulators: Detected demo project ID "demo-pokemon-card-game-online", emulated services will use a demo configuration and attempts to access non-emulated services for this project will fail.
i  firestore: Firestore Emulator logging to firestore-debug.log
✔  firestore: Firestore Emulator UI websocket is running on 9150.

┌─────────────────────────────────────────────────────────────┐
│ ✔  All emulators ready! It is now safe to connect your app. │
│ i  View Emulator UI at http://127.0.0.1:4000/               │
└─────────────────────────────────────────────────────────────┘

┌───────────┬────────────────┬─────────────────────────────────┐
│ Emulator  │ Host:Port      │ View in Emulator UI             │
├───────────┼────────────────┼─────────────────────────────────┤
│ Firestore │ 127.0.0.1:8080 │ http://127.0.0.1:4000/firestore │
└───────────┴────────────────┴─────────────────────────────────┘
Emulator Hub host: 127.0.0.1 port: 4400
Other reserved ports: 4500, 9150

$ ^C
i  emulators: Received SIGINT (Ctrl-C) for the first time. Starting a clean shutdown.
i  emulators: Please wait for a clean shutdown or send the SIGINT (Ctrl-C) signal again to stop right now.
i  emulators: Shutting down emulators.
i  ui: Stopping Emulator UI
i  firestore: Stopping Firestore Emulator
i  hub: Stopping emulator hub
i  logging: Stopping Logging Emulator
```

判定: Pass（CLIでFirestore Emulator起動確認）

---

## 3. Step 2 実施（V2スキーマ/ビルダー/Invariant追加）

### 変更内容

- 追加/更新: `src/game-state/schemaV2.js`
- 追加/更新: `src/game-state/builders.js`
- 追加/更新: `src/game-state/invariants.js`
- 追加: `src/game-state/compatRead.js`（Step 3実装時に追加）

### 実行コマンド/出力

```bash
$ find src/game-state -maxdepth 3 -type f | sort
src/game-state/__tests__/invariants.test.js
src/game-state/__tests__/migrateV1ToV2.test.js
src/game-state/builders.js
src/game-state/compatRead.js
src/game-state/invariants.js
src/game-state/migrateV1ToV2.js
src/game-state/schemaV2.js
```

判定: Pass（スキーマ/ビルダー/Invariantの土台を作成）

---

## 4. Step 3 実施（V1→V2変換と互換読み取り）

### 変更内容

- 追加: `src/game-state/migrateV1ToV2.js`
  - `migrateSessionV1ToV2()`
  - `isV1Session()`
  - `toPlayerKey()`
- 追加: `src/game-state/compatRead.js`
  - `adaptSessionForClient()`
  - `hasDeckConfigured()`
  - `resolveCardRefsToImageUrls()`

### 補足（不具合修正）

- 初回テスト時に、移行時のカードID払い出しで同一 `cardId` が再利用される不具合を検出
- `createAllocator` ロジックを修正（seed用キュー投入と、不足時の新規カード作成を分離）

判定: Pass（V1互換読み取り + V2変換ルートを実装）

---

## 5. Step 4 実施（画面コードの書き込み経路V2化）

### 変更内容

- 更新: `src/components/Home.js`
  - `createEmptySessionV2()` で `sessions` 初期化
  - `privateState/player1`, `privateState/player2` を初期作成
- 更新: `src/components/Session.js`
  - `sessions` + `privateState/{playerId}` の二重購読
  - デッキ保存時に `cardId` ベースの `privateState` を保存
  - V1ドキュメント読込時は `migrateSessionV1ToV2` を通してV2へ昇格
- 更新: `src/components/PlayingField.js`
  - `publicState` + 自分の `privateState` から描画
  - 手札は `cardCatalog` から画像URLを解決
  - カード裏面を `card-back.jpg` に変更
- 更新: `src/components/UpdateGameDataTest.js`
  - `setDoc` ベースに変更
  - `sessionDoc` + `privateState` を同時投入可能に変更

判定: Pass

---

## 6. Step 5 実施（移行CLIスクリプト実装）

### 変更内容

- 追加: `scripts/firestore/lib/v1_to_v2.mjs`
- 追加: `scripts/firestore/migrate_sessions_v1_to_v2.mjs`
  - 対応オプション: `--project`, `--dry-run`, `--write`, `--session-id`, `--limit`
- 追加: `scripts/firestore/verify_sessions_v2.mjs`
  - 必須フィールド欠落チェック
  - Invariantチェック

### 実行コマンド/出力

```bash
$ find scripts/firestore -maxdepth 3 -type f | sort
scripts/firestore/lib/v1_to_v2.mjs
scripts/firestore/migrate_sessions_v1_to_v2.mjs
scripts/firestore/verify_sessions_v2.mjs

$ node --check scripts/firestore/migrate_sessions_v1_to_v2.mjs
$ node --check scripts/firestore/verify_sessions_v2.mjs
$ node --check scripts/firestore/lib/v1_to_v2.mjs
# (いずれも出力なし = 構文エラーなし)
```

```bash
$ firebase emulators:exec --only firestore --project demo-pokemon-card-game-online "node -e \"...sample_gamedataをlegacy-sampleへ投入...\" && node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project demo-pokemon-card-game-online --dry-run && node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project demo-pokemon-card-game-online --write && node scripts/firestore/verify_sessions_v2.mjs --project demo-pokemon-card-game-online"
seeded legacy-sample
{
  "scanned": 1,
  "migratedCandidates": 1,
  "written": 0,
  "failed": 0,
  "mode": "dry-run"
}
{
  "scanned": 1,
  "migratedCandidates": 1,
  "written": 1,
  "failed": 0,
  "mode": "write"
}
{
  "scanned": 1,
  "v2Sessions": 1,
  "nonV2Sessions": 0,
  "missingFieldSessions": 0,
  "invariantFailedSessions": 0,
  "passedSessions": 1
}
```

判定: Pass（dry-run / write / verify をエミュレータで実行確認）

---

## 7. Step 6 実施（テスト追加）

### 変更内容

- 追加: `src/game-state/__tests__/migrateV1ToV2.test.js`
- 追加: `src/game-state/__tests__/invariants.test.js`
- 更新: `src/App.test.js`
- 更新: `src/components/PlayingFieldTest.js`（import整合のためプレースホルダ実装）

### 実行コマンド/出力（失敗）

```bash
$ npm test -- --watch=false
PASS src/game-state/__tests__/invariants.test.js
FAIL src/game-state/__tests__/migrateV1ToV2.test.js
  Error: Invariant violation: cardId ... appears in multiple zones ...

FAIL src/App.test.js
  SyntaxError: Cannot use import statement outside a module
  (axios ESM をJestが解釈できない)
```

### 修正内容

- `migrateV1ToV2` の allocator を修正（同一 `cardId` 再利用バグ修正）
- `App.test.js` でルートコンポーネントを `jest.mock` して `Session -> axios` 依存を遮断

### 実行コマンド/出力（再実行）

```bash
$ npm test -- --watch=false
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/App.test.js
Test Suites: 3 passed, 3 total
Tests: 7 passed, 7 total
```

判定: Pass

---

## 8. Step 7 実施（README/台帳更新）

### 変更内容

- 更新: `README.md`
  - FirestoreデータモデルをV2へ更新
  - `privateState` 分離と移行CLI利用方法を追記
- 更新: `references/implementation_plans/260218_master_db_requirements_tracker.md`
  - Phase 01対象ReqIDを `Done / Pass` へ更新
  - 証跡に本ログファイルを紐付け

判定: Pass

---

## 9. Step 8 実施（完了判定）

### 実行コマンド/出力

```bash
$ rg -o 'OP-[A-I][0-9]{2}' references/implementation_plans/260218_master_operation_coverage_tracker.md | sort -u | wc -l
      81

$ ls src/game-state/schemaV2.js src/game-state/migrateV1ToV2.js src/game-state/invariants.js
src/game-state/invariants.js
src/game-state/migrateV1ToV2.js
src/game-state/schemaV2.js

$ git status --short
 M .gitignore
 M README.md
 M package-lock.json
 M package.json
 M references/implementation_plans/260218_master_db_requirements_tracker.md
 M src/App.test.js
 M src/components/Home.js
 M src/components/PlayingField.js
 M src/components/PlayingFieldTest.js
 M src/components/Session.js
 M src/components/UpdateGameDataTest.js
?? firebase.json
?? firestore.indexes.json
?? firestore.rules
?? references/implementation_logs/260218_phase01_data_model_migration.md
?? references/implementation_plans/260218_phase01_data_model_migration.md
?? scripts/
?? src/game-state/
```

### 判定

- Exit Criteria 判定: Pass（Phase 01対象のローカル実装・検証完了）
- 備考: Firestore Rules強化・競合制御本体（Phase 02）は未着手のため繰越


### 追記: 依存追加と最終再実行

```bash
$ npm view firebase-admin version
13.6.1

$ npm install
npm warn EBADENGINE Unsupported engine {
  package: '@firebase/util@1.13.0',
  required: { node: '>=20.0.0' },
  current: { node: 'v18.20.7', npm: '10.8.2' }
}
added 94 packages, changed 9 packages, and audited 1776 packages in 33s

$ CI=true npm test -- --watch=false
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/App.test.js
Test Suites: 3 passed, 3 total
Tests: 7 passed, 7 total
```

```bash
$ npm run build
Compiled successfully.
# (CRA由来の warnings は出るが build 成功)
```

- 追記: `references/implementation_plans/260218_phase01_data_model_migration.md` のステータスを `Completed（ローカル実装・検証完了）` に更新
