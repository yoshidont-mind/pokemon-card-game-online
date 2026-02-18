# 本プロジェクト実装ロードマップ（最終到達保証版）

作成日: 2026-02-18  
対象: pokemon-card-game-online

---

## 1. このロードマップの目的

本ロードマップは、以下 2 条件を最終的に **完全充足** するための上位計画である。

1. `references/documents/260218_3_db_session_requirements_spec.md` の要件を全件満たす。  
2. `references/documents/260218_2_card_effect_operation_matrix.md` の全操作（81項目）を画面上で再現でき、友人同士のオンライン対戦をスムーズに実行できる。

本書に記載された全フェーズが完了し、各フェーズの Exit Criteria を満たした時点で、上記2条件は満たされる設計とする。

---

## 2. 前提・非目標

### 2.1 前提

- 本サービスは「顔見知り同士が通話しながら遊ぶカジュアル対戦ツール」である。
- ルール違反の自動判定/強制は実装対象外。
- DB 永続化は「操作確定後の状態」のみを対象とする。

### 2.2 非目標

- カード文言の自動解釈・自動裁定エンジンの完成
- 大会ジャッジ水準の厳密性
- 操作途中（未確定）状態の復元

---

## 3. 実行方式（ロードマップ→実装手順書→実装）

### 3.1 実行単位

- 1フェーズにつき、必ず事前に `references/implementation_plans` に手順書を作成する。
- 手順書に従って実装し、完了後 `references/implementation_logs` に実績を記録する。

### 3.2 命名規則（本ロードマップで統一）

- フェーズ手順書: `references/implementation_plans/yymmdd_phaseNN_<short_name>.md`
- 実装ログ: `references/implementation_logs/yymmdd_phaseNN_<short_name>_log.md`

例:
- `references/implementation_plans/260218_phase01_data_model_migration.md`
- `references/implementation_logs/260218_phase01_data_model_migration_log.md`

### 3.3 各フェーズ手順書の必須章

1. 背景/目的
2. スコープ（In/Out）
3. 変更対象ファイル一覧
4. 実装手順（順序付き）
5. テスト手順（自動/手動）
6. ロールバック方針
7. Exit Criteria（チェックリスト）

---

## 4. 全体フェーズ一覧

| Phase | 名称 | 主目的 | 主な依存 |
|---|---|---|---|
| 00 | 実行基盤セットアップ | フェーズ運用テンプレートと追跡台帳整備 | なし |
| 01 | DB/セッション基盤刷新 | `260218_3` 要件のデータモデル実装 | 00 |
| 02 | 認可/秘匿/競合制御 | Security Rules + revision/transaction 完成 | 01 |
| 03 | 盤面UI再設計（紙寄せ） | 実カード配置に近いレイアウトへ刷新 | 01 |
| 04 | インタラクション基盤 | DnD・ハイライト・付与操作の共通化 | 03 |
| 05 | 操作実装 Wave1（主要） | 高頻度操作を実装し実戦可能化 | 04,02 |
| 06 | 操作実装 Wave2（拡張） | 残り操作を実装し81項目完遂へ | 05 |
| 07 | 操作網羅検証 | 81項目の再現性を証跡付きで完了 | 06 |
| 08 | UX調整・安定化 | 実戦プレイの滑らかさを担保 | 07 |
| 09 | 最終監査・受入 | 最終到達条件2件の充足を確定 | 08 |

---

## 5. フェーズ詳細

## Phase 00: 実行基盤セットアップ

### 目的

- フェーズ進行管理を再現可能にし、漏れ・属人化を防ぐ。

### 成果物

- 実装手順書テンプレート作成
- 操作カバレッジ台帳（81操作の進捗管理表）初期版作成
- `260218_3` 要件チェック台帳（項目単位）作成

### 手順書ファイル

- `references/implementation_plans/260218_phase00_execution_framework.md`

### Exit Criteria

- [ ] 各フェーズで使う手順書テンプレートが存在する。
- [ ] 81操作の管理台帳に全ID（OP-A01〜OP-I07）が列挙済み。
- [ ] `260218_3` の全要件がチェック可能な粒度で台帳化済み。

---

## Phase 01: DB/セッション基盤刷新

### 目的

- `260218_3` の Firestore 論理モデル（`sessions`/`privateState`/`actions`）を実装可能な形に落とし込む。

### 主要タスク

- 現行 `sessions` スキーマから `versioned schema` へ移行設計
- `cardInstanceId` 導入
- `activeSpot` 型統一（`active: StackRef | null`）
- `lostZone` 導入
- `isFaceDown`, `orientation` フィールド導入
- `publicState` と `privateState/{playerId}` 分離

### 手順書ファイル

- `references/implementation_plans/260218_phase01_data_model_migration.md`

### Exit Criteria

- [ ] `260218_3` セクション 5.1, 6, 7 の要件を実装反映済み。
- [ ] 旧データを壊さない移行方針（version判定）が機能する。
- [ ] 1カード多重所属が防止される（Invariant検証）。

---

## Phase 02: 認可/秘匿/競合制御

### 目的

- 秘匿情報漏洩と同時更新競合を実運用レベルで防ぐ。

### 主要タスク

- Firestore Security Rules 実装
  - 参加者のみ `sessions/{sessionId}` read
  - 自分のみ `privateState/{playerId}` read/write
- `revision` + transaction 更新プロトコル導入
- `updatedAt/updatedBy` 強制記録
- 競合時リトライUIの導入
- 参加者同定（UID/トークン）実装
- `lastSeenAt` 更新と接続状態表示

### 手順書ファイル

- `references/implementation_plans/260218_phase02_security_and_concurrency.md`

### Exit Criteria

- [ ] 検証ツールから相手の手札/山札順序を取得できない。
- [ ] 同時更新時に silent overwrite が起きない。
- [ ] 全更新で `revision` 単調増加が保証される。
- [ ] `260218_3` セクション 5.2, 5.3, 5.4, 9 を満たす。

---

## Phase 03: 盤面UI再設計（紙寄せ）

### 目的

- 紙のポケカ体験に近いゾーン配置を実現し、初見で迷わない UI にする。

### UI要件（必須）

- `references/images/placement.png`, `references/images/placement_2.jpeg` を基準にレイアウト再設計
- カード裏面画像を `public/card-back.svg` から `public/card-back.jpg` に切替
- 手札を常時固定表示から変更し、以下を実装
  - 画面上で浮いて見える（高 z-index）
  - トグルで最小化/展開可能
- 小道具BOX（ダメカン・状態異常バッヂ等）
  - 折りたたみ/展開可能
  - 盤面操作を妨げない配置

### 手順書ファイル

- `references/implementation_plans/260218_phase03_board_ui_relayout.md`

### Exit Criteria

- [ ] ゾーン配置が参照画像に概ね整合（レビュー合意あり）。
- [ ] 裏面画像が `card-back.jpg` へ統一されている。
- [ ] 手札トグルと小道具BOXトグルが安定動作する。

---

## Phase 04: インタラクション基盤（DnD）

### 目的

- エリア間移動・カードへの付与を直感的なドラッグ＆ドロップで統一する。

### UI要件（必須）

- カード/ダメカン/状態異常バッヂの単体 DnD
- ドロップ可能エリアに重なったとき、対象エリアを赤ハイライト
- 特定カードへ重なったとき、対象カードを赤ハイライト
- ドロップ確定時にのみ状態更新

### 推奨実装方針

- React 向け DnD 基盤（例: `@dnd-kit`）を採用
- DnD 対象の型を統一（`card|counter|badge|marker`）
- 判定ロジックを UI と分離（テスト可能化）

### 手順書ファイル

- `references/implementation_plans/260218_phase04_drag_and_drop_foundation.md`

### Exit Criteria

- [ ] ゾーン移動時のハイライト挙動が仕様通り。
- [ ] カード付与時のハイライト挙動が仕様通り。
- [ ] DnD 失敗時に状態が破壊されない。

---

## Phase 05: 操作実装 Wave1（主要）

### 目的

- 主要操作を先に実装し、実戦可能な最小完全系を作る。

### 対象操作（優先）

- 高頻度操作中心（山札/手札/場/トラッシュ/サイド/ロストの移動、ダメカン、状態異常、入れ替え、進化、エネルギー/どうぐ/スタジアムの基本操作）

### 手順書ファイル

- `references/implementation_plans/260218_phase05_operations_wave1.md`

### Exit Criteria

- [ ] `260218_2` の優先実装群（セクション6）を全て再現可能。
- [ ] 2人対戦で1ゲーム通しの基本進行が破綻しない。
- [ ] 競合時の再試行導線が操作フローに統合される。

---

## Phase 06: 操作実装 Wave2（拡張）

### 目的

- Wave1 で未対応の操作を実装し、81項目完遂に到達する。

### 対象操作

- 置換/ロック/コピー/HP補正/追加サイド/例外制約などの拡張操作
- 低頻度だが再現必須の操作

### 手順書ファイル

- `references/implementation_plans/260218_phase06_operations_wave2.md`

### Exit Criteria

- [ ] 81操作の実装率が100%に到達（実装上の未着手IDが0）。
- [ ] 各操作に最低1つの再現シナリオが紐づく。

---

## Phase 07: 操作網羅検証（81項目完全確認）

### 目的

- 「実装した」ではなく「画面上で再現できる」を証跡付きで完了させる。

### 主要タスク

- 操作ごとの検証シナリオ集作成
- 手動検証手順書整備
- 実装/検証のトレーサビリティ確立
- 未分類/特殊ケースの補完（必要時）

### 手順書ファイル

- `references/implementation_plans/260218_phase07_operation_coverage_verification.md`

### Exit Criteria

- [ ] OP-A01〜OP-I07 の全IDに「再現手順・期待結果・実績」が存在。
- [ ] 全IDが Pass（再現成功）状態。
- [ ] 失敗/保留IDが0。

---

## Phase 08: UX調整・安定化

### 目的

- 友人同士の実戦で「止まらない・迷わない・戻せる」運用品質を作る。

### 主要タスク

- 実戦プレイテスト（複数デッキ、複数ブラウザ、ネットワーク揺らぎ）
- 表示遅延/再描画負荷の調整
- エラーハンドリング改善（再接続、競合、無効ドロップ）
- 操作説明UI/ヘルプ改善

### 手順書ファイル

- `references/implementation_plans/260218_phase08_playtest_and_stabilization.md`

### Exit Criteria

- [ ] 連続対戦で重大な進行停止バグが発生しない。
- [ ] 初見プレイヤーが基本操作（移動・付与・ダメカン）を迷わず実行できる。
- [ ] `260218_3` 非機能要件に対して逸脱がない。

---

## Phase 09: 最終監査・受入

### 目的

- 本ロードマップの最終到達条件を正式に満たしたことを確定する。

### 主要タスク

- `260218_3` の全項目を再監査（MUST/SHOULDを含め全件）
- `260218_2` の81操作 Pass 証跡監査
- README/運用手順/既知制約の更新
- リリース判断資料の作成

### 手順書ファイル

- `references/implementation_plans/260218_phase09_final_acceptance.md`

### Exit Criteria

- [ ] `260218_3` 要件チェックが全件 Pass。
- [ ] `260218_2` 81操作チェックが全件 Pass。
- [ ] 友人同士オンライン対戦の受入テストが合格。

---

## 6. 操作カバレッジ割当（81項目）

下記割当で、Phase 05〜07 完了時に 81項目すべてが再現可能となる。

### 6.1 Wave1（Phase 05）

- A系: `OP-A01`, `OP-A02`, `OP-A03`, `OP-A04`, `OP-A05`, `OP-A06`
- B系: `OP-B01`, `OP-B02`, `OP-B03`, `OP-B04`, `OP-B05`, `OP-B07`, `OP-B09`, `OP-B10`, `OP-B11`, `OP-B12`
- C系: `OP-C02`, `OP-C03`, `OP-C04`, `OP-C05`
- D系: `OP-D01`, `OP-D02`, `OP-D03`, `OP-D04`, `OP-D05`, `OP-D06`, `OP-D07`, `OP-D08`
- E系: `OP-E01`, `OP-E02`, `OP-E04`, `OP-E05`, `OP-E06`, `OP-E07`
- F系: `OP-F01`, `OP-F02`, `OP-F03`, `OP-F04`, `OP-F05`, `OP-F06`, `OP-F07`, `OP-F08`
- G系: `OP-G02`, `OP-G03`, `OP-G04`
- I系: `OP-I01`, `OP-I03`

### 6.2 Wave2（Phase 06）

- A系: `OP-A07`, `OP-A08`
- B系: `OP-B06`, `OP-B08`, `OP-B13`
- C系: `OP-C01`, `OP-C06`, `OP-C07`
- E系: `OP-E03`, `OP-E08`, `OP-E09`, `OP-E10`, `OP-E11`, `OP-E12`, `OP-E13`, `OP-E14`
- F系: `OP-F09`, `OP-F10`, `OP-F11`
- G系: `OP-G01`, `OP-G05`, `OP-G06`, `OP-G07`, `OP-G08`
- H系: `OP-H01`, `OP-H02`, `OP-H03`, `OP-H04`, `OP-H05`
- I系: `OP-I02`, `OP-I04`, `OP-I05`, `OP-I06`, `OP-I07`

### 6.3 Wave3（Phase 07）

- 実装済み81項目すべてについて、画面再現性の検証完了と証跡確定

---

## 7. DB要件カバレッジ割当（`260218_3`）

- Phase 01: セクション 5.1 / 6 / 7 / 10（モデル・不変条件・移行）
- Phase 02: セクション 5.2 / 5.3 / 5.4 / 8 / 9（秘匿・セッション管理・競合・更新プロトコル・Rules）
- Phase 08: セクション 5.6（非機能）
- Phase 09: セクション 11（完了判定）全件監査

注記: 最終受入（Phase 09）では、`260218_3` 内の MUST/SHOULD を区別せず全件達成を求める。

---

## 8. 品質保証方針

### 8.1 テストレイヤー

- ユニット: 状態遷移/Invariant/競合解決ロジック
- 統合: Firestore transaction + Security Rules
- UI: DnD 操作、ハイライト、手札トグル、小道具BOXトグル
- 手動実戦: 2端末同時操作、再接続、長時間プレイ

### 8.2 受入証跡

- 各フェーズで実装ログを必ず残す。
- 操作81項目の Pass 証跡は Phase 07 で一元化する。

### 8.3 失敗時ルール

- Exit Criteria 未達のフェーズは次フェーズへ進まない。
- 未達要素は同フェーズの追加サブタスクとして閉じる。

---

## 9. リスクと先回り対策

| リスク | 影響 | 対策フェーズ |
|---|---|---|
| 秘匿情報漏洩（相手手札参照） | 公平性崩壊 | 02 |
| 同時更新競合で状態破壊 | 対戦不能 | 02 |
| DnD導入で誤ドロップ多発 | UX悪化 | 04,08 |
| 81操作の抜け漏れ | 最終要件未達 | 00,06,07 |
| セッション肥大化 | パフォーマンス劣化 | 01,08 |

---

## 10. フェーズ開始時の共通チェック

各フェーズ開始前に必ず確認する。

- [ ] 対象フェーズの implementation plan が作成済み。
- [ ] 依存フェーズの Exit Criteria が全て Pass。
- [ ] 変更範囲とロールバック方針が明記されている。

---

## 11. 最終到達判定（このロードマップの完了定義）

以下すべてを満たした場合のみ「ロードマップ完了」と判定する。

- [ ] Phase 00〜09 の Exit Criteria が全件 Pass。  
- [ ] `260218_3` 要件（全項目）が Pass。  
- [ ] `260218_2` の 81操作が全て画面上で再現可能（証跡付き）。  
- [ ] 友人同士のオンライン対戦受入テスト（通話しながらの対戦）で重大問題なし。  

---

## 12. 参照

- `references/documents/260218_2_card_effect_operation_matrix.md`
- `references/documents/260218_3_db_session_requirements_spec.md`
- `references/images/placement.png`
- `references/images/placement_2.jpeg`
- `README.md`

