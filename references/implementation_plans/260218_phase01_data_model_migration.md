# Phase 01 実装手順書: DB/セッション基盤刷新（データモデル移行）

作成日: 2026-02-18（JST）  
対象リポジトリ: `pokemon-card-game-online`  
対象フェーズ: `references/documents/260218_4_full_implementation_roadmap.md` の Phase 01  
ステータス: Completed（ローカル実装・検証完了）

---

## 1. 背景/目的

Phase 01 の目的は、現行の `sessions` 単一ドキュメント構造（URL文字列配列中心）を、`references/documents/260218_3_db_session_requirements_spec.md` に定義された **V2論理モデル**へ移行すること。

本フェーズ完了時に達成すべき状態（ロードマップ準拠）:

- `cardInstanceId` を導入し、カード実体を一意追跡できる
- `activeSpot` の型不一致を解消し `active: StackRef | null` へ統一
- `lostZone` / `isFaceDown` / `orientation` を保持できる
- `publicState` と `privateState/{playerId}` に情報分離できる
- 旧データを壊さない `version` 付き移行ルートを持つ
- Invariant（重複所属禁止等）をコードで検証できる

注記:
- ルール強制（ターン制約やダメージ妥当性自動判定）は本フェーズ対象外
- Security Rules 強化・競合制御の本体は Phase 02 で実施

---

## 2. 公式一次情報（2026-02-18確認）

本手順の根拠として、以下の最新公式ドキュメントを参照する。

1. Cloud Firestore Data model  
   https://firebase.google.com/docs/firestore/data-model
2. Choose a data structure  
   https://firebase.google.com/docs/firestore/manage-data/structure-data
3. Best practices for Cloud Firestore  
   https://firebase.google.com/docs/firestore/best-practices
4. Transactions and batched writes  
   https://firebase.google.com/docs/firestore/manage-data/transactions
5. Usage and limits (Firestore quotas)  
   https://firebase.google.com/docs/firestore/quotas
6. Local Emulator Suite: Install/configure  
   https://firebase.google.com/docs/emulator-suite/install_and_configure
7. Connect app to Cloud Firestore Emulator  
   https://firebase.google.com/docs/emulator-suite/connect_firestore

実装時の注意:
- 手順内のCLI仕様差分が疑われる場合は、必ず当日再確認する
- GUI手順は本フェーズでは原則採用しない（CLIで完結）

---

## 3. スコープ

### 3.1 In Scope

- V2データモデル用コードの追加
- 旧構造（V1）→新構造（V2）変換ロジック追加
- アプリの読み書きをV2構造に対応
- 旧セッション互換読み取り（段階移行）
- Migrationスクリプトの実装（dry-run対応）
- Invariant検証とテスト追加

### 3.2 Out of Scope

- Firestore Security Rules の強化（Phase 02）
- transaction + expectedRevision の完全導入（Phase 02）
- DnD UI刷新（Phase 03以降）
- 81操作実装（Phase 05以降）

---

## 4. 変更対象ファイル一覧（予定）

## 4.1 新規作成（予定）

- `firebase.json`
- `.firebaserc`（必要に応じて）
- `firestore.rules`（最小。Phase 02で本実装）
- `firestore.indexes.json`（初期雛形）
- `src/game-state/schemaV2.js`
- `src/game-state/builders.js`
- `src/game-state/invariants.js`
- `src/game-state/migrateV1ToV2.js`
- `src/game-state/compatRead.js`
- `scripts/firestore/migrate_sessions_v1_to_v2.mjs`
- `scripts/firestore/verify_sessions_v2.mjs`
- `src/game-state/__tests__/migrateV1ToV2.test.js`
- `src/game-state/__tests__/invariants.test.js`

## 4.2 既存更新（予定）

- `src/components/Home.js`
- `src/components/Session.js`
- `src/components/PlayingField.js`
- `src/components/UpdateGameDataTest.js`
- `README.md`（データ構造更新箇所）
- `references/implementation_plans/260218_master_db_requirements_tracker.md`（進捗更新）
- `references/implementation_plans/260218_master_operation_coverage_tracker.md`（必要時のみ）

---

## 5. 事前準備

## 5.1 必須コマンド確認

```bash
command -v git rg node npm firebase java
node -v
npm -v
firebase --version
java -version
```

期待:
- `firebase` CLI 利用可
- Java 実行環境あり（Firestore Emulator要件。公式でJDK要件更新があるため要確認）

## 5.2 ワーキングコピー確認

```bash
cd /Users/yoshidont_mind/Desktop/personal_projects/pokemon-card-game-online
git status --short
```

## 5.3 ブランチ作成

```bash
git checkout -b feature/260218-phase01-data-model-migration
```

---

## 6. V2データモデル設計（固定仕様）

本フェーズで固定する最小スキーマ（実装側が解釈を揺らさないための規範）:

```json
{
  "version": 2,
  "status": "playing",
  "revision": 0,
  "participants": {
    "player1": {"uid": null, "joinedAt": null, "lastSeenAt": null, "connectionState": "unknown"},
    "player2": {"uid": null, "joinedAt": null, "lastSeenAt": null, "connectionState": "unknown"}
  },
  "publicState": {
    "turnContext": {"turnNumber": null, "currentPlayer": null},
    "players": {
      "player1": {"board": {"active": null, "bench": [], "discard": [], "lostZone": [], "prize": [], "markers": []}},
      "player2": {"board": {"active": null, "bench": [], "discard": [], "lostZone": [], "prize": [], "markers": []}}
    },
    "stadium": null
  }
}
```

補足:
- 秘匿領域は `sessions/{sessionId}/privateState/{playerId}` に分離
- `cardCatalog` に `cardId -> CardEntity` を保持
- `deck/hand` は `CardRef[]` で保持

---

## 7. 実装手順（Step by Step）

## Step 1. Firebaseローカル構成ファイルを整備（CLI中心）

### 目的

Phase 01 の移行/検証を本番データ破壊なく再現可能にする。

### 作業

1. `firebase.json` を追加（firestore emulator設定を含む）
2. `firestore.rules` / `firestore.indexes.json` を追加
3. `firebase init` の対話実行は極力避け、ファイル明示作成で差分管理

### コマンド例

```bash
# ファイル存在確認
ls -la firebase.json firestore.rules firestore.indexes.json .firebaserc
```

### 検証

```bash
firebase emulators:start --only firestore --project demo-pokemon-card-game-online
```

期待:
- Firestore Emulator が起動し、CLIエラーがない

---

## Step 2. スキーマ/ビルダー/Invariantモジュールを追加

### 目的

フロント各画面が直接生オブジェクトを組み立てる状態を終了し、単一の構造定義に集約する。

### 作業

1. `src/game-state/schemaV2.js` を作成
   - 型コメント（JSDoc）
   - enum相当値（`orientation`, `visibility`）
2. `src/game-state/builders.js` を作成
   - `createEmptySessionV2()`
   - `createCardEntity()`
   - `createCardRef()`
3. `src/game-state/invariants.js` を作成
   - `assertUniqueCardOwnership(session)`
   - `assertActiveShape(session)`
   - `assertOrientation(session)`

### 検証

- 単体テストで builder 出力が必須キーを満たす
- Invariantの意図的破壊ケースで例外が投げられる

---

## Step 3. V1→V2 変換ロジックを実装

### 目的

既存セッションを破壊せず、段階的に V2 へ移行可能にする。

### 作業

1. `src/game-state/migrateV1ToV2.js` を作成
   - `isV1Session(doc)` 判定
   - `migrateSessionV1ToV2(doc, options)` 実装
2. 変換規則を明文化
   - `activeSpot: []` → `active: null`
   - `all` は `cardCatalog` 生成元として扱い、対戦中の単一真実源から除外
   - `deck/hand/discard/prize` URL配列を `cardId` 配列へ再構成
   - `lostZone` 未存在は `[]` 補完
   - `revision` 未存在は `0` 補完
3. `src/game-state/compatRead.js` で読み取り互換を追加
   - 読み取り時: V1ならアダプタでV2へ変換してUIへ渡す

### 検証

- `public/sample_gamedata.json` を入力に変換テスト
- 変換後に Invariant が通る

---

## Step 4. 画面コードの書き込み経路をV2化

### 目的

新規セッション作成・デッキ保存で V2 構造のみを書き込む。

### 作業

1. `Home.js` を更新
   - `createEmptySessionV2()` を使用
2. `Session.js` を更新
   - デッキ保存時に `cardId` ベース構造へ変換
   - `privateState/{playerId}` へ保存する書き込み関数へ変更
3. `PlayingField.js` を更新
   - `publicState + own privateState` を読み取って描画
4. `UpdateGameDataTest.js` を更新
   - V2 JSON を投入できるように調整

### 検証

- `/home` から新規作成したセッションが V2 で保存される
- デッキ保存後、手札/山札がV2で描画される

---

## Step 5. 移行CLIスクリプトを実装

### 目的

既存 `sessions` コレクションを安全に変換する。

### 作業

1. `scripts/firestore/migrate_sessions_v1_to_v2.mjs` を作成
2. 実装要件:
   - `--project`, `--dry-run`, `--session-id`, `--limit`, `--write` オプション
   - dry-run時は更新件数と変更サマリのみ出力
   - write時のみ実更新
3. `scripts/firestore/verify_sessions_v2.mjs` を作成
   - Invariantチェック
   - 欠落フィールド検知
   - 集計出力

### 実行例（エミュレータ）

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project demo-pokemon-card-game-online --dry-run
node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project demo-pokemon-card-game-online --write --limit 10
node scripts/firestore/verify_sessions_v2.mjs --project demo-pokemon-card-game-online
```

---

## Step 6. テストを追加

### 目的

V2移行の退行を防ぐ。

### 作業

- `src/game-state/__tests__/migrateV1ToV2.test.js`
- `src/game-state/__tests__/invariants.test.js`

### 実行

```bash
npm test -- --watch=false
```

期待:
- 追加テストが安定してPass

---

## Step 7. README/台帳更新

### 目的

仕様・進捗の整合性を取る。

### 作業

1. `README.md` の Firestore データモデル章をV2へ更新
2. `references/implementation_plans/260218_master_db_requirements_tracker.md` の Phase 01 対象ReqIDを更新
   - `実装状態`: `Done` / `検証状態`: `Pass` に更新（実測証跡を必須）

---

## Step 8. 完了判定実施（Phase 01）

### 判定コマンド

```bash
# 1) 型/必須キー検証（テスト経由）
npm test -- --watch=false

# 2) 81操作台帳件数の維持確認（副作用防止）
rg -o 'OP-[A-I][0-9]{2}' references/implementation_plans/260218_master_operation_coverage_tracker.md | sort -u | wc -l

# 3) Phase01成果物の存在確認
ls src/game-state/schemaV2.js src/game-state/migrateV1ToV2.js src/game-state/invariants.js

# 4) ドキュメント更新確認
git status --short
```

### Exit Criteria（Phase 01）

- [ ] `260218_4` Phase 01 の3条件を満たす
- [ ] `260218_3` セクション 5.1 / 6 / 7 / 10 の対象項目が実装済み
- [ ] V1互換読み取りが動作する（移行中に画面が壊れない）
- [ ] dry-run / write / verify の3種CLIが動作する

---

## 8. ユーザー意思決定ポイント（実行時に必ず停止して確認）

Phase 01 実行中に以下の選択が発生した場合、実装を中断してユーザー確認を行う。

## Decision A: 本番/共有環境データへの書き込み範囲

選択肢1. まずエミュレータのみで全検証（推奨）
- メリット: 事故ゼロ、即ロールバック可能
- デメリット: 本番データ特有の揺らぎは未検証

選択肢2. 単一 `sessionId` だけ本番で試験移行
- メリット: 実データ検証できる
- デメリット: 影響範囲がゼロではない

選択肢3. 全 `sessions` 一括移行
- メリット: 一回で完了
- デメリット: リスク最大、失敗時影響が大きい

推奨: 選択肢1 → 選択肢2 → 選択肢3 の順で段階実施

## Decision B: 旧スキーマ互換期間

選択肢1. Phase 01〜09 まで互換維持（推奨）
- メリット: 安全
- デメリット: 実装が一時的に複雑

選択肢2. Phase 01終了直後に互換削除
- メリット: 実装がすっきり
- デメリット: 既存セッションが壊れるリスク

推奨: 選択肢1

---

## 9. CLI中心運用の注意点

- Firestore書き込み系操作（移行write）は必ず `--dry-run` を先行
- `--write` 実行時は対象件数を `--limit` で絞って段階実行
- 進捗ログは必ず `references/implementation_logs/260218_phase01_data_model_migration.md` に記録
- 失敗出力も省略せず記録

---

## 10. GUI操作が必要になるケース（原則回避）

本フェーズは原則 CLI で完結する。  
ただし、Firebaseプロジェクト権限不足やAPI有効化不足が発生した場合のみ GUI確認が必要になることがある。

その場合の一次情報:
- Firestore Console操作: https://firebase.google.com/docs/firestore/using-console

実行ルール:
- GUI操作が必要になった時点で必ず作業中断し、ユーザーに依頼する
- 依頼時は「画面名」「確認項目」「期待状態」を明示する

---

## 11. テスト手順（詳細）

## 11.1 自動テスト

```bash
npm test -- --watch=false
```

確認点:
- 移行関数テストPass
- InvariantテストPass

## 11.2 ローカル統合テスト（エミュレータ）

```bash
# terminal 1
firebase emulators:start --only firestore --project demo-pokemon-card-game-online

# terminal 2
npm start

# terminal 3 (必要時)
node scripts/firestore/migrate_sessions_v1_to_v2.mjs --project demo-pokemon-card-game-online --dry-run
```

確認点:
- 新規セッションが V2 で生成される
- デッキ保存後にV2構造で表示崩れがない

## 11.3 手動検証

1. `/home` でセッション作成
2. デッキコード入力→保存
3. ブラウザ再読み込み
4. 同一URL再入室

期待:
- 直前の確定状態が再現される
- `active` の型崩れがない

---

## 12. ロールバック方針

1. 画面系不具合のみの場合
- 画面変更コミットを revert
- migrationスクリプトは維持

2. データ変換不具合の場合
- `--write` を停止
- 変換前バックアップ（emulator export / Firestore export）から復旧

3. 本番反映直後の重大不具合
- 互換読み取り（V1 fallback）を有効化したまま hotfix
- 全件再移行は行わず、対象sessionのみ修復

---

## 13. Phase 01 完了報告テンプレート

```md
## Phase 01 完了報告
- 実施日:
- 実施者:
- ブランチ:
- 主要変更ファイル:
- dry-run結果:
- write結果（対象件数）:
- verify結果:
- Exit Criteria判定: Pass/Fail
- 残課題:
```

---

## 14. 付録: Phase 01 対象 ReqID（`260218_master_db_requirements_tracker`）

本フェーズで最低限 `Done/Pass` に到達させる対象（ロードマップ準拠）:

- データモデル: `DB-REQ-001`〜`DB-REQ-008`
- 論理モデル: `DB-REQ-038`〜`DB-REQ-052`
- Invariant: `DB-REQ-053`〜`DB-REQ-060`
- 移行: `DB-REQ-061`〜`DB-REQ-067`

Phase 02へ繰越:
- 認可/競合制御/Rules系（例: `DB-REQ-009`, `DB-REQ-014`〜`DB-REQ-037`, `DB-REQ-057`〜`DB-REQ-059`）
