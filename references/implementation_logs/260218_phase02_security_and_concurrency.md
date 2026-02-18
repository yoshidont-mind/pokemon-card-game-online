# 実装ログ: Phase 02 認可/秘匿/競合制御

作成日: 2026-02-18（JST）
対象手順書: `references/implementation_plans/260218_phase02_security_and_concurrency.md`

> ルール:
> - 秘匿情報は記録しない
> - ターミナル出力は本ファイル内に直接記録する
> - 失敗した試行も省略しない

## 進捗サマリ

- [x] 事前準備（コマンド確認・ブランチ作成・ベースライン検証）
- [x] Step 1: Auth Emulator追加
- [x] Step 1.5: Node 20更新 + 依存整合検証
- [x] Step 2: 匿名認証導入（クライアント側）
- [x] Step 3: 参加者バインド（slot claim）
- [x] Step 4: Firestore Rules本実装
- [x] Step 5: Rulesテスト整備（Emulator実行）
- [x] Step 6: transaction + expectedRevision
- [x] Step 7: 競合UI導線（保存競合時）
- [x] Step 8: presence（heartbeat + pagehide）
- [x] Step 9: 確定状態のみ保存（主要保存経路をtransaction化）
- [x] Step 10: エミュレータ統合検証
- [x] Step 11: 実環境検証（dry-run中心）
- [x] Step 12: ドキュメント/台帳更新

---

## 1. 事前準備

### 実行コマンド/出力

```bash
$ command -v git rg node npm firebase java
/usr/bin/git
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/path/rg
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/bin/node
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/bin/npm
/Users/yoshidont_mind/.nvm/versions/node/v18.20.7/bin/firebase
/usr/bin/java

$ node -v && npm -v && firebase --version && java -version
v18.20.7
10.8.2
13.34.0
openjdk version "21.0.2" 2024-01-16

$ git checkout -b feature/260218-phase02-security-and-concurrency
Switched to a new branch 'feature/260218-phase02-security-and-concurrency'

$ CI=true npm test -- --watch=false
PASS src/App.test.js
PASS src/game-state/__tests__/invariants.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js

$ npm run build
Compiled successfully.
```

判定: Pass

---

## 2. Step 1 実施（Auth Emulator追加）

### 変更内容

- 更新: `firebase.json`
  - `emulators.auth.host=127.0.0.1`
  - `emulators.auth.port=9099`

### 実行コマンド/出力

```bash
$ firebase emulators:start --only auth,firestore --project demo-pokemon-card-game-online
i  emulators: Starting emulators: auth, firestore
✔  All emulators ready!
│ Authentication │ 127.0.0.1:9099 │ http://127.0.0.1:4000/auth      │
│ Firestore      │ 127.0.0.1:8080 │ http://127.0.0.1:4000/firestore │

$ ^C
i  emulators: Shutting down emulators.
```

判定: Pass

---

## 3. Step 1.5 実施（Node 20更新 + 依存整合検証）

### 変更内容

- 追加: `.nvmrc`（`20.19.6`）
- 更新: `package.json`
  - `engines.node: ">=20 <21"` を追加
  - `firebase` を `^12.9.0` へ更新
  - `devDependencies` に `@firebase/rules-unit-testing@^5.0.0` 追加
  - `scripts.test:rules` 追加
- 更新: `package-lock.json`

### 実行コマンド/出力

```bash
$ source ~/.nvm/nvm.sh && nvm use 20.19.6 && node -v && npm -v
Now using node v20.19.6 (npm v10.8.2)
v20.19.6
10.8.2

$ npm view @firebase/rules-unit-testing@5.0.0 engines peerDependencies
engines = { node: '>=20.0.0' }
peerDependencies = { firebase: '^12.0.0' }

$ npm install firebase@^12.9.0
added 3 packages, removed 14 packages, changed 44 packages, and audited 1765 packages in 53s

$ npm install --save-dev @firebase/rules-unit-testing@^5.0.0
added 1 package, and audited 1766 packages in 8s

$ npm ls firebase @firebase/rules-unit-testing --depth=0
pokemon_card_game_online@0.1.0
├── @firebase/rules-unit-testing@5.0.0
└── firebase@12.9.0
```

### 回帰確認

```bash
$ CI=true npm test -- --watch=false
PASS src/App.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js

$ npm run build
Compiled successfully.
```

判定: Pass（Node更新後も既存テスト/ビルド成功）

---

## 4. Step 2/3 実施（匿名認証 + slot claim）

### 変更内容

- 更新: `src/firebase.js`
  - `auth` 初期化と Auth Emulator 接続対応
  - `REACT_APP_USE_FIREBASE_EMULATORS=true` 時のみ emulator 接続
- 追加: `src/auth/authClient.js`
  - `waitForAuthReady`, `ensureSignedIn`, `getCurrentUid`
- 更新: `src/components/Home.js`
  - 認証初期化待ち
  - session作成時に `participants.player1.uid` を保存
  - `player2` privateState の先行作成を廃止
- 更新: `src/components/Join.js`
  - 認証初期化待ち
  - Join時に `claimPlayerSlot` 実行
- 追加/更新: `src/game-state/errors.js`, `src/game-state/sessionParticipation.js`
  - アプリ内エラーコード定義
  - claim処理を transactionベースで実装
  - **既存privateStateを破壊しないよう修正**
- 更新: `src/components/Session.js`
  - 認証初期化待ち
  - slot確認失敗時のUI表示

### 失敗試行（記録）

- `src/components/Session.js` への presence 用パッチ適用時に context 不一致で失敗
  - メッセージ: `apply_patch verification failed: Failed to find expected lines ...`
  - 対応: ファイル再読込後、最小差分で再パッチして成功

判定: Pass（実装完了、後段の build/test で正常）

---

## 5. Step 4 実施（Firestore Rules本実装）

### 変更内容

- 更新: `firestore.rules`
  - デフォルト `allow true` を撤廃
  - `sessions/{sessionId}`
    - 認証/参加者/slot claim 条件付き read
    - create/update の監査フィールド制約（`updatedBy`, `revision`）
    - slot claim 時の更新可能キー制限
  - `sessions/{sessionId}/privateState/{playerId}`
    - owner本人のみ read/write
    - `ownerPlayerId` 整合
    - `updatedBy` と `revision` 制約
  - フォールバック deny 追加

判定: Pass（Step 5 の rules test で検証）

---

## 6. Step 5 実施（Rulesテスト整備）

### 変更内容

- 追加: `tests/rules/helpers/testEnv.cjs`
  - Rules読み込み、Emulator接続、fixture seed
- 追加: `tests/rules/firestore.rules.test.cjs`
  - 参加者read許可/非参加者拒否
  - open slot claim 許可
  - claimed slot 上書き拒否
  - privateState owner許可/他者拒否
  - `updatedBy` 不一致拒否
- 更新: `package.json`
  - `test:rules` script 追加

### 実行コマンド/出力

```bash
$ firebase emulators:exec --only auth,firestore --project demo-pokemon-card-game-online "npm run test:rules"
i  Running script: npm run test:rules
TAP version 13
ok 1 - participant can read occupied session
ok 2 - non-participant cannot read occupied session
ok 3 - non-participant can claim open player2 slot
ok 4 - cannot overwrite already claimed player2 slot
ok 5 - owner can read and update own privateState
ok 6 - owner cannot read or write opponent privateState
ok 7 - session update is denied when updatedBy does not match auth uid
1..7
# pass 7
# fail 0
✔  Script exited successfully (code 0)
```

判定: Pass

---

## 7. Step 6/7 実施（transaction + expectedRevision + 競合UI）

### 変更内容

- 追加: `src/game-state/transactionRunner.js`
  - `applySessionMutation`
  - `expectedRevision` 不一致時 `REVISION_CONFLICT`
  - `updatedAt`/`updatedBy`/`revision(+1)` 強制
  - Firestoreエラーを `GameStateError` に正規化
- 更新: `src/components/Session.js`
  - `saveDeck` を direct `setDoc` から `applySessionMutation` 経由へ変更
  - V1 session への保存を明示拒否（移行案内）
  - `REVISION_CONFLICT` 時にUI警告 + 再実行導線を表示

判定: Pass（build/test + rules test 成功）

---

## 8. Step 8 実施（presence）

### 変更内容

- 追加: `src/game-state/presence.js`
  - `touchSessionPresence`（online/offline 更新）
- 更新: `src/components/Session.js`
  - 30秒 heartbeat
  - `visibilitychange` で online 更新
  - `pagehide` と unmount 時に offline 更新
- 更新: `src/game-state/transactionRunner.js`
  - `touchPrivateState: false` 対応（presence更新時に privateState を触らない）

判定: Pass（型/ビルド/rules test成功）

---

## 9. Step 9 実施（確定状態のみ保存）

### 対応内容

- 主要保存経路（`saveDeck`）を transaction runner に一本化
- Firestore保存は「保存ボタン押下後の確定結果」のみ反映
- 途中UI状態（入力中 deckCode / selectedDeckCards 以外）は保存対象外

判定: Pass（主要経路で反映済み）

---

## 10. Step 10 実施（統合検証）

### 実行コマンド/出力

```bash
$ CI=true npm test -- --watch=false
PASS src/App.test.js
PASS src/game-state/__tests__/migrateV1ToV2.test.js
PASS src/game-state/__tests__/invariants.test.js

$ npm run build
Compiled successfully.

$ firebase emulators:exec --only auth,firestore --project demo-pokemon-card-game-online "npm run test:rules"
# pass 7 / fail 0
✔  Script exited successfully (code 0)
```

### 既知warning（失敗ではない）

- CRA由来 warning
  - `babel-preset-react-app` 非メンテ warning
  - `caniuse-lite` outdated warning

判定: Pass

---

## 11. 手順書更新（Node 20選択の反映）

### 変更内容

- 更新: `references/implementation_plans/260218_phase02_security_and_concurrency.md`
  - Decision C を「Node 20 + rules-unit-testing v5」確定に変更
  - `Step 1.5`（Node更新 + 依存検証）を追加
  - テストファイル名を `*.cjs` に揃えて整合化
  - Node更新後の回帰検証項目を明記

判定: Pass

---

## 12. Step 11 実施（実環境 dry-run）

### 実行コマンド/出力

```bash
$ env -u GOOGLE_APPLICATION_CREDENTIALS node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project pokemon-card-game-online-80212 --dry-run
{
  "scanned": 15,
  "migratedCandidates": 13,
  "written": 0,
  "skippedV2": 0,
  "skippedUnknown": 2,
  "failed": 0,
  "mode": "dry-run"
}
```

判定: Pass（writeなし）

---

## 13. Step 12 実施（ドキュメント更新）

### 変更内容

- 更新: `README.md`
  - Node 20 / Firebase 12 の前提へ更新
  - Emulator利用手順、`test:rules` 実行手順を追記
  - Anonymous auth確認をトラブルシュートへ追記
- 更新: `references/implementation_plans/260218_master_db_requirements_tracker.md`
  - Phase 02 対象ReqIDの実装状態を `In Progress` へ更新
  - Rulesテストで検証済み項目を `Pass` 化
  - 証跡リンクに本ログを設定

判定: Pass

---

## 14. 未実施/次アクション

- [x] Firebase Console で Anonymous auth が有効か最終確認（ユーザー実施: 完了）
- [x] 2ブラウザ同時操作の手動競合テストを実施して tracker の `検証状態` を確定（ユーザー実施: 期待通り）

---

## 15. 手動競合テスト結果（ユーザー実施）

### 手順

- 2ブラウザ（別セッション）で同一 `sessionId` に参加
- 両者がほぼ同時に「このデッキを保存」を実行

### 結果

- ユーザー報告: 「期待通り」
- 判定:
  - 片方は保存成功
  - 片方は競合通知（再試行導線）を表示

### 反映対象

- `DB-REQ-019`（expectedRevision不一致時の再読込導線）
- `DB-REQ-021`（競合時UI導線）
- `DB-REQ-032`（silent overwrite防止）
- `DB-REQ-033`（競合通知）
