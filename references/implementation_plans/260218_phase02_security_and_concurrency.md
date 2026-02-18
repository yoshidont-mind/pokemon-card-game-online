# Phase 02 実装手順書: 認可/秘匿/競合制御

作成日: 2026-02-18（JST）  
対象リポジトリ: `pokemon-card-game-online`  
対象フェーズ: `references/documents/260218_4_full_implementation_roadmap.md` の Phase 02  
ステータス: In Progress（実装中）

---

## 1. 背景/目的

Phase 02 の目的は、Phase 01 で導入した V2 データモデルを前提に、以下を本番運用レベルへ引き上げること。

- 秘匿情報漏洩の防止（相手手札・相手山札順序・相手 privateState を読めない）
- 同時操作競合時の silent overwrite 防止
- `revision`/`updatedAt`/`updatedBy` の一貫した更新
- 参加者識別（`player1`/`player2` と認証主体 UID の紐づけ）
- 接続状態（`lastSeenAt`/`connectionState`）を表示可能にする

本フェーズ完了時に、ロードマップ Exit Criteria を満たすこと:

- [ ] 検証ツールから相手の手札/山札順序を取得できない
- [ ] 同時更新時に silent overwrite が起きない
- [ ] 全更新で `revision` 単調増加が保証される
- [ ] `260218_3` のセクション 5.2/5.3/5.4/9 を満たす

---

## 2. 公式一次情報（2026-02-18確認）

本手順書は以下の公式ドキュメントに基づく。

1. Firestore: Transactions and batched writes  
   https://firebase.google.com/docs/firestore/manage-data/transactions
2. Firestore Security Rules: Structuring rules  
   https://firebase.google.com/docs/firestore/security/rules-structure
3. Firestore Security Rules: Writing conditions  
   https://firebase.google.com/docs/firestore/security/rules-conditions
4. Firestore Security Rules: Securely query data（Rules are not filters）  
   https://firebase.google.com/docs/firestore/security/rules-query
5. Firebase Security Rules and Authentication  
   https://firebase.google.com/docs/rules/rules-and-auth
6. Firebase Auth (Web): Get started  
   https://firebase.google.com/docs/auth/web/start
7. Firebase Auth (Web): Anonymous auth  
   https://firebase.google.com/docs/auth/web/anonymous-auth
8. Emulator Suite: Install and configure  
   https://firebase.google.com/docs/emulator-suite/install_and_configure
9. Emulator Suite: Connect Firestore emulator  
   https://firebase.google.com/docs/emulator-suite/connect_firestore
10. Emulator Suite: Connect Auth emulator  
    https://firebase.google.com/docs/emulator-suite/connect_auth
11. Security Rules: Build unit tests  
    https://firebase.google.com/docs/rules/unit-tests
12. Presence（Firestore 単体ではネイティブ対応なし、RTDB+Functions 方式）  
    https://firebase.google.com/docs/firestore/solutions/presence

補足（npm 実測）:

- `@firebase/rules-unit-testing@5.0.0` は Node.js `>=20.0.0` 要件
- 同パッケージの peerDependencies は `firebase@^12.0.0`
- 本フェーズでは「Node 20 + Firebase 12 + rules-unit-testing v5」を正式採用する

---

## 3. スコープ

### 3.1 In Scope

- Firebase Authentication を使った参加者識別（UID ベース）
- Firestore Security Rules の本実装
- `sessions` / `privateState` 読み書きの認可分離
- 競合制御付き更新プロトコル（transaction + expectedRevision）
- `updatedAt`/`updatedBy`/`revision` の更新強制
- 競合時の再試行導線（UI）
- `lastSeenAt`/`connectionState` 更新（推定 online/offline）
- ルール単体テスト（Emulator ベース）

### 3.2 Out of Scope

- 81操作の網羅実装（Phase 05/06）
- DnD UI刷新（Phase 03/04）
- `actions` 監査ログ本実装（Phase 06）
- 旧互換削除（Phase 09）
- 完全リアルタイム presence（RTDB + Functions 完全同期）

---

## 4. 対象 ReqID（Phase 02）

`references/implementation_plans/260218_master_db_requirements_tracker.md` で Phase 02 指定のものを対象とする。

- 認可/秘匿: `DB-REQ-009`, `DB-REQ-012`, `DB-REQ-057`
- セッション管理: `DB-REQ-013`, `DB-REQ-014`, `DB-REQ-015`, `DB-REQ-016`, `DB-REQ-017`, `DB-REQ-042`
- 競合制御: `DB-REQ-018`, `DB-REQ-019`, `DB-REQ-020`, `DB-REQ-021`, `DB-REQ-022`, `DB-REQ-032`, `DB-REQ-033`, `DB-REQ-034`
- 更新/確定状態運用: `DB-REQ-023`, `DB-REQ-035`, `DB-REQ-036`, `DB-REQ-037`, `DB-REQ-052`, `DB-REQ-058`, `DB-REQ-059`

---

## 5. 実装方針（固定）

### 5.1 認証方式

- Firebase Auth の匿名認証を採用（UID を恒久識別子として利用）
- `sessions/{sessionId}.participants.{playerId}.uid` と `request.auth.uid` の一致で認可

### 5.2 秘匿分離

- 公開情報: `sessions/{sessionId}`
- 秘匿情報: `sessions/{sessionId}/privateState/{playerId}`
- `privateState` は所有プレイヤーのみ read/write 可

### 5.3 更新プロトコル

- すべての対戦状態更新は `runTransaction` 経由
- `expectedRevision` が不一致なら abort し、再読込導線へ
- transaction 成功時のみ `revision + 1` を反映

### 5.4 接続状態

- Phase 02 は Firestore heartbeat 方式（軽量）
- `lastSeenAt` を定期更新し、閾値で offline 推定
- 正確性最優先が必要になった時点で、Phase 06以降に RTDB+Functions 方式を検討

---

## 6. 変更対象ファイル一覧（予定）

## 6.1 新規作成（予定）

- `src/auth/authClient.js`
- `src/game-state/transactionRunner.js`
- `src/game-state/errors.js`
- `src/game-state/presence.js`
- `src/game-state/__tests__/transactionRunner.test.js`
- `tests/rules/firestore.rules.test.cjs`
- `tests/rules/helpers/testEnv.cjs`

## 6.2 既存更新（予定）

- `src/firebase.js`（Auth初期化・Emulator接続）
- `src/components/Home.js`
- `src/components/Join.js`
- `src/components/Session.js`
- `src/components/PlayingField.js`
- `src/components/UpdateGameDataTest.js`
- `firestore.rules`（`allow true` を撤廃）
- `firebase.json`（auth emulator を追加）
- `package.json`（rules test script 追加）
- `README.md`（Auth/Rules/競合制御の更新）
- `references/implementation_plans/260218_master_db_requirements_tracker.md`

---

## 7. 事前準備

## 7.1 コマンド前提確認

```bash
command -v git rg node npm firebase java
node -v
npm -v
firebase --version
java -version
```

確認基準:

- Firebase CLI 利用可能
- Java 利用可能（Firestore Emulator 要件）
- Node.js が `v20.x` である
- `npm view @firebase/rules-unit-testing@5.0.0 engines peerDependencies` で要件を再確認済み

## 7.2 作業ブランチ作成

```bash
git checkout -b feature/260218-phase02-security-and-concurrency
```

## 7.3 ベースライン検証（Phase 01 退行確認）

```bash
CI=true npm test -- --watch=false
npm run build
```

---

## 8. Step by Step 実装手順

## Step 1. Auth Emulator をローカル構成に追加

### 目的

Phase 02 の Rules/認証/競合試験をローカルで閉じる。

### 作業

1. `firebase.json` の `emulators` に `auth` を追加（`127.0.0.1:9099`）
2. 必要に応じて `singleProjectMode` を確認
3. 起動コマンドを統一

### コマンド

```bash
firebase emulators:start --only auth,firestore --project demo-pokemon-card-game-online
```

### 検証

- Emulator UI（`127.0.0.1:4000`）に Authentication と Firestore が表示
- CLIログに fatal がない

---

## Step 1.5. Node 20 への更新 + 依存関係整合の検証

### 目的

`@firebase/rules-unit-testing@5` 採用に必要な実行環境を整備し、Node更新による副作用を Phase 02 の中で吸収する。

### 作業

1. Node バージョンを `20.19.6` に固定（`.nvmrc` を追加）
2. `package.json` に `engines.node` を明記（`>=20 <21`）
3. 依存関係を更新
   - `firebase` を `^12.x` へ更新（peer 整合）
   - `@firebase/rules-unit-testing@^5.0.0` を `devDependencies` に追加
4. lockfile を更新
5. 回帰確認（Node更新コスト吸収）
   - `CI=true npm test -- --watch=false`
   - `npm run build`
   - `npm run test:rules`（Step 5実装後に再実行）

### コマンド

```bash
source ~/.nvm/nvm.sh
nvm use 20.19.6
node -v

npm view @firebase/rules-unit-testing@5.0.0 engines peerDependencies
npm install firebase@^12.9.0
npm install --save-dev @firebase/rules-unit-testing@^5.0.0
```

### 検証

- `node -v` が `v20.19.6`
- `npm ls firebase @firebase/rules-unit-testing` で依存解決が成立
- `npm test/build` が既存機能を壊していない

---

## Step 2. クライアント認証基盤（匿名認証）を導入

### 目的

全クライアント更新に `request.auth.uid` を持たせる。

### 作業

1. `src/firebase.js` に Auth 初期化を追加
2. `connectAuthEmulator(auth, "http://127.0.0.1:9099")` を開発時のみ適用
3. `src/auth/authClient.js` を追加
   - `ensureSignedIn()`
   - `waitForAuthReady()`
   - `getCurrentUid()`
4. `Home/Join/Session` で認証確立前の書き込みを禁止

### 実装注意

- `signInAnonymously` 失敗時はセッション作成/参加処理を止める
- 認証前提の UI は「接続中」表示を出す

### 検証

- 未認証状態から `/home` を開き、自動で匿名サインインされる
- ブラウザ再読み込み後も uid が維持される

---

## Step 3. 参加者バインド（UID と player slot の紐づけ）

### 目的

`player1`/`player2` のなりすましを防ぐ。

### 作業

1. セッション参加時に transaction で slot を claim する関数を追加
2. ルール:
   - slot が `null` なら `request.auth.uid` を設定
   - 既に自分の uid なら idempotent success
   - 他人の uid なら拒否
3. `joinedAt`, `lastSeenAt`, `connectionState` を初期設定
4. `Join.js` 側で拒否時のメッセージを実装

### 検証

- 同じ uid で再入室できる
- 別 uid で同じ slot へ入ろうとすると拒否される

---

## Step 4. Firestore Security Rules を本実装

### 目的

公開/秘匿分離と参加者制約を DB レイヤーで強制する。

### 作業

1. `firestore.rules` を `allow true` から置換
2. 推奨ルール関数を定義
   - `isSignedIn()`
   - `isSessionParticipant(sessionId)`
   - `isSessionPlayer(sessionId, playerId)`
   - `unchanged(field)`（必要に応じて）
3. `sessions/{sessionId}`:
   - `read`: 参加者のみ
   - `create`: 認証済み + participants 構造妥当性
   - `update`: 参加者のみ + 監査フィールド整合（`updatedBy == request.auth.uid` など）
4. `sessions/{sessionId}/privateState/{playerId}`:
   - `read/write`: 所有プレイヤーのみ
   - `ownerPlayerId == playerId` を強制
5. `request.resource` と `resource` 比較で、許可しない更新を拒否
6. query 用に `list` も同条件で制約

### 実装注意

- Rules は filter ではないため、クエリ側にも同じ制約を持たせる
- `get()`/`exists()` の呼び出し回数制限（10/20）を超えない

### ローカル検証

```bash
firebase emulators:exec --only auth,firestore --project demo-pokemon-card-game-online "npm run test:rules"
```

---

## Step 5. Security Rules 単体テストを整備

### 目的

allow/deny の境界条件をコードで固定する。

### 作業

1. Node 20 + `@firebase/rules-unit-testing@5.0.0` を採用
   - peer 要件に合わせて `firebase@^12.x` を利用
2. テスト追加:
   - `tests/rules/firestore.rules.test.cjs`
3. 最低ケース:
   - 非参加者は `sessions/{id}` read deny
   - 参加者は `sessions/{id}` read allow
   - 相手 `privateState` read/write deny
   - 自分 `privateState` read/write allow
   - `updatedBy != request.auth.uid` は deny
4. `package.json` に script 追加
   - `test:rules`

### 検証

```bash
npm run test:rules
firebase emulators:exec --only auth,firestore --project demo-pokemon-card-game-online "npm run test:rules"
```

---

## Step 6. transaction + expectedRevision の更新レイヤー実装

### 目的

同時更新時の silent overwrite を防止する。

### 作業

1. `src/game-state/transactionRunner.js` を追加
2. API 例:

```ts
applySessionMutation({
  sessionId,
  playerId,
  expectedRevision,
  mutate,
  actorUid,
})
```

3. transaction 内処理:
   - `sessions/{sessionId}` 読み取り
   - `privateState/{playerId}` 読み取り
   - 参加者整合チェック（slot uid == actorUid）
   - `session.revision === expectedRevision` でなければ `REVISION_CONFLICT`
   - `mutate` で次状態生成
   - Invariant 実行
   - `updatedAt`/`updatedBy`/`revision+1` を反映して commit
4. エラー分類を導入
   - `REVISION_CONFLICT`
   - `PERMISSION_DENIED`
   - `INVARIANT_VIOLATION`

### 検証

- 2クライアント同時操作で片方が conflict になる
- commit 成功側のみ `revision` が増加

---

## Step 7. 競合時のUI再試行導線を実装

### 目的

競合時にユーザーが迷わず復帰できるようにする。

### 作業

1. 盤面更新処理を `applySessionMutation` 経由に寄せる
2. `REVISION_CONFLICT` 受信時:
   - 最新状態を再取得
   - UI に「最新状態へ更新しました。もう一度操作してください。」を表示
3. SHOULD:
   - 安全な操作のみ 1〜2 回自動再試行

### 検証

- 2タブ同時で同じカードを動かしたとき、片方が通知される
- データ欠損なく一貫性が保たれる

---

## Step 8. `lastSeenAt` / `connectionState` 実装

### 目的

再開時の状況把握と接続状態表示を実現する。

### 作業

1. `src/game-state/presence.js` を追加
2. heartbeat 実装（例: 15〜30秒ごと）
   - `participants.{playerId}.lastSeenAt = server timestamp`
   - `participants.{playerId}.connectionState = "online"`
3. `visibilitychange` / `pagehide` で `offline` 反映（best effort）
4. 表示側は `lastSeenAt` の鮮度で offline を推定

### 検証

- タブを閉じる/放置する/再開するで表示が変化する
- 書き込み頻度が過剰でない（必要なら interval を調整）

---

## Step 9. 「操作確定後のみ保存」をコードで担保

### 目的

`DB-REQ-035/036/037/052` を満たす。

### 作業

1. Firestore 書き込み API を 1 本化（transaction runner のみ）
2. 未確定状態（選択中候補・ダイアログ途中状態）は React local state に限定
3. 保存 payload に未確定キーが混入していないことをチェック

### 検証

- 通信 payload を確認し、未確定情報が含まれない
- 再読込時に復元されるのは確定状態のみ

---

## Step 10. エミュレータ統合検証

### 実施コマンド

```bash
# terminal 1
firebase emulators:start --only auth,firestore --project demo-pokemon-card-game-online

# terminal 2
npm start

# terminal 3
CI=true npm test -- --watch=false
npm run test:rules
```

### シナリオ

1. `/home` でセッション作成（player1 slot claim）
2. 別ブラウザで `/join`（player2 slot claim）
3. 両者で同時操作し競合通知を確認
4. 片側 DevTools で相手 privateState を読もうとして拒否されることを確認

---

## Step 11. 実環境検証（段階実施）

### 方針

1. `--dry-run`（読み取りのみ）
2. 単一 `sessionId` へ限定した小規模書き込み（必要時）
3. 全体適用

### コマンド（例）

```bash
# 既存移行CLIのdry-run（本番書き込みなし）
env -u GOOGLE_APPLICATION_CREDENTIALS node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project pokemon-card-game-online-80212 --dry-run
```

---

## Step 12. ドキュメント/台帳更新

### 目的

実装と設計の差分をなくす。

### 作業

- `README.md` 更新（Auth 必須化、Rules 方針、競合時挙動）
- `references/implementation_plans/260218_master_db_requirements_tracker.md` 更新
  - Phase 02 対象 ReqID を `Done/Pass` 化
  - 証跡に `references/implementation_logs/260218_phase02_security_and_concurrency.md` を記載

---

## 9. 手作業（GUI）ステップ

本フェーズは原則 CLI で進めるが、以下は GUI 必須。

## 9.1 Firebase Authentication の匿名認証有効化

### 公式手順

- https://firebase.google.com/docs/auth/web/anonymous-auth

### 操作手順（2026-02-18 時点）

1. Firebase Console で対象プロジェクトを開く
2. 左ナビ `Build` -> `Authentication`
3. 初回未設定なら `Get started` を押す
4. `Sign-in method` タブを開く
5. `Add new provider`（または provider 一覧）から `Anonymous` を選択
6. `Enable` を ON
7. `Save`

確認:

- `Anonymous` が有効状態で表示される

注意:

- UI ラベルは将来変更され得るため、上記公式ドキュメントを優先する

---

## 10. 実装中に必ず停止してユーザー確認する意思決定ポイント

## Decision A: 認証方式

選択肢1. 匿名認証（推奨）

- メリット: 実装が軽い、CLI/Emulator で検証しやすい
- デメリット: アカウント識別の人間可読性が低い

選択肢2. カスタムトークン/署名付き招待

- メリット: 参加フローを厳密に制御できる
- デメリット: サーバ側実装が増え、Phase 02 スコープを超えやすい

推奨: 選択肢1

## Decision B: Presence 実装

選択肢1. Firestore heartbeat（推奨）

- メリット: 追加サービス不要、Phase 02 で完了しやすい
- デメリット: 瞬時オフライン検知は弱い

選択肢2. RTDB + Functions ミラー

- メリット: presence 精度が高い
- デメリット: 構成・運用が重く、追加課金/運用影響の検討が必要

推奨: 選択肢1（Phase 02）、必要なら Phase 06 で選択肢2を再評価

## Decision C: rules-unit-testing のバージョン

確定方針（ユーザー決定）: Node 20 へ更新し `@firebase/rules-unit-testing@5.x` を採用する。

追加で必須化する検証:

- Node 更新後に `CI=true npm test -- --watch=false` を実行
- Node 更新後に `npm run build` を実行
- 主要画面（`/home`, `/join`, `/session`）の起動確認を実施

## Decision D: 本番反映順序

選択肢1. Emulator -> 検証環境 -> 本番（推奨）

- メリット: 事故リスク最小
- デメリット: 時間がかかる

選択肢2. 直接本番

- メリット: 速い
- デメリット: 誤設定時の影響が大きい

推奨: 選択肢1

---

## 11. 検証チェックリスト（完了判定）

## 11.1 自動検証

- [ ] `CI=true npm test -- --watch=false` が pass
- [ ] `npm run test:rules` が pass
- [ ] 競合制御テスト（revision不一致）を含む

## 11.2 手動検証

- [ ] 非参加者で `sessions/{id}` が読めない
- [ ] 相手 `privateState` が読めない
- [ ] 同時操作で silent overwrite が起きない
- [ ] conflict 発生時に UI 通知が出る
- [ ] `updatedBy` が認証 UID と一致する
- [ ] `revision` が単調増加する
- [ ] `lastSeenAt`/`connectionState` が更新される

## 11.3 ReqID 判定

- [ ] Phase 02 対象 ReqID を `Done/Pass` に更新済み

---

## 12. ロールバック方針

1. Rules が厳しすぎて操作不能になった場合

- 直前の `firestore.rules` に戻して再デプロイ
- 原因を rules test で再現してから再適用

2. transaction 更新で盤面更新不能になった場合

- 旧経路へ戻さず、feature flag で更新APIのみ切替
- `revision` 更新処理の不整合を先に修正

3. presence 更新が高頻度すぎる場合

- heartbeat 間隔を延長（例: 15秒 -> 30秒）
- 更新イベントを `visibilitychange` 中心へ寄せる

---

## 13. Phase 02 完了報告テンプレート

```md
## Phase 02 完了報告
- 実施日:
- 実施者:
- ブランチ:
- 主要変更ファイル:
- Rulesテスト結果:
- 同時更新競合テスト結果:
- 参加者認可テスト結果:
- Exit Criteria判定: Pass/Fail
- 残課題:
```

---

## 14. 参考コマンド集（実行時コピペ用）

```bash
# エミュレータ起動（auth + firestore）
firebase emulators:start --only auth,firestore --project demo-pokemon-card-game-online

# ルール反映（ローカル）
firebase deploy --only firestore:rules --project demo-pokemon-card-game-online

# ルール反映（本番）
firebase deploy --only firestore:rules --project pokemon-card-game-online-80212

# テスト
CI=true npm test -- --watch=false
npm run test:rules

# dry-run（本番）
env -u GOOGLE_APPLICATION_CREDENTIALS node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project pokemon-card-game-online-80212 --dry-run
```

注記:

- 本番向け `firebase deploy` は外部環境変更を伴うため、実行時は必ず事前承認を取得すること。
