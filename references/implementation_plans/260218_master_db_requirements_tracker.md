# DB/セッション要件トラッキング台帳（Phase 00 初版）

作成日: 2026-02-18（JST）  
対象: `references/documents/260218_3_db_session_requirements_spec.md`

## 運用ルール

- `実装状態`: `Not Started / In Progress / Done`
- `検証状態`: `Not Started / Pass / Fail / Blocked`
- `証跡`: 実装ログ/検証ログへのパスを記載（例: `references/implementation_logs/...`）
- `実装Phase` はロードマップ（`260218_4`）に従う

---

## A. MUST/SHOULD 要件（5.x, 8.x）

| ReqID | 優先度 | 要件本文 | 根拠箇所 | 実装Phase | 実装状態 | 検証状態 | 検証方法 | 証跡 |
|---|---|---|---|---|---|---|---|---|
| DB-REQ-001 | MUST | `cardInstanceId` を導入しカード実体を一意識別する | 5.1-1 | Phase 01 | Done | Pass | 同名複数枚デッキでID重複なしを確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-002 | MUST | カードメタ情報と現在位置/状態を分離する | 5.1-2 | Phase 01 | Done | Pass | スキーマ定義と保存ドキュメントを確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-003 | MUST | 1カードの複数ゾーン同時所属を禁止する | 5.1-3 | Phase 01 | Done | Pass | 競合ケースを含む所属重複検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-004 | MUST | `activeSpot` を配列ではなくオブジェクトまたはnullで固定する | 5.1-4 | Phase 01 | Done | Pass | 保存データ型チェック | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-005 | MUST | 場の重なり順を配列順で保持できる | 5.1-5 | Phase 01 | Done | Pass | 重ね順変更時の配列順反映確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-006 | MUST | ロストゾーンをプレイヤーゾーンとして保持できる | 5.1-6 | Phase 01 | Done | Pass | 両プレイヤー `lostZone` の存在確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-007 | MUST | `isFaceDown` と `orientation` を保持できる | 5.1-7 | Phase 01 | Done | Pass | 裏向き/横向き保存・再読込確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-008 | SHOULD | 任意座標（x/y）拡張欄を将来追加可能な構造にする | 5.1-8 | Phase 03 | Not Started | Not Started | 予約フィールド追加容易性をレビュー | - |
| DB-REQ-009 | MUST | 相手手札・相手山札順序・相手サイド実体を参照不可にする | 5.2-1 | Phase 02 | In Progress | Pass | Rulesテストで非ownerのprivateState read/write拒否を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-010 | MUST | 公開情報と秘匿情報を `publicState` / `privateState` に分離する | 5.2-2 | Phase 01 | Done | Pass | ドキュメント構成とRules適用確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-011 | MUST | 各カードに公開範囲を定義できる | 5.2-3 | Phase 01 | Done | Pass | visibility値保存と表示制御確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-012 | SHOULD | 一時公開の有効期限/解除契機を保持可能にする | 5.2-4 | Phase 02 | Not Started | Not Started | temporarilyRevealedの解除フロー確認 | - |
| DB-REQ-013 | MUST | `sessionId` 単位で作成・参加・再開できる | 5.3-1 | Phase 02 | In Progress | Not Started | URL再入室で同一セッション復元確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-014 | MUST | `player1/player2` と認可主体（UID/トークン）を紐づける | 5.3-2 | Phase 02 | In Progress | Pass | Rulesテストでslot上書き拒否とowner制約を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-015 | MUST | `lastSeenAt` を保持し接続状態表示に使える | 5.3-3 | Phase 02 | In Progress | Not Started | 接続/切断後の状態遷移確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-016 | MUST | 全更新で `updatedAt`,`updatedBy`,`revision` を記録する | 5.3-4 | Phase 02 | In Progress | Not Started | 更新処理単位の監査フィールド確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-017 | SHOULD | セッション状態 `waiting/ready/playing/finished/archived` を保持する | 5.3-5 | Phase 02 | In Progress | Not Started | 状態遷移の保存確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-018 | MUST | 対戦状態更新を transaction 経由で行う | 5.4-1 | Phase 02 | In Progress | Not Started | 更新APIでtransaction使用を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-019 | MUST | `expectedRevision` 一致確認を行い不一致時再読込する | 5.4-2 | Phase 02 | In Progress | Pass | 2ブラウザ同時保存で片側が競合通知となることを確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-020 | MUST | 1操作の確定状態を1トランザクションで反映する | 5.4-3 | Phase 02 | In Progress | Not Started | 操作単位でatomic更新を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-021 | MUST | 競合時にUIへ再試行導線を提示する | 5.4-4 | Phase 02 | In Progress | Pass | 競合時に「最新状態を反映して再実行」導線表示を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-022 | SHOULD | idempotency key で二重適用を防ぐ | 5.4-5 | Phase 02 | Not Started | Not Started | 同一操作再送時の重複反映防止確認 | - |
| DB-REQ-023 | MUST | 最低限 `updatedAt/updatedBy/revision` で最終変更者追跡を可能にする | 5.5-1 | Phase 02 | In Progress | Not Started | 監査ログなしでも追跡できること確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-024 | SHOULD | `actions` サブコレクションで直近操作履歴を保持する | 5.5-2 | Phase 06 | Not Started | Not Started | actions作成・取得を確認 | - |
| DB-REQ-025 | SHOULD | 履歴未実装期間でも手動修正しやすい最小編集操作を提供する | 5.5-3 | Phase 08 | Not Started | Not Started | 手動修正導線の有無を確認 | - |
| DB-REQ-026 | MUST | 盤面同期を通常利用で体感1秒以内にする | 5.6-1 | Phase 08 | Not Started | Not Started | 2端末同時表示で遅延計測 | - |
| DB-REQ-027 | MUST | セッション再入室で直近確定状態を復元できる | 5.6-2 | Phase 08 | Not Started | Not Started | ブラウザ再読み込みで復元確認 | - |
| DB-REQ-028 | MUST | 1セッションのデータ総量がFirestore上限を超えない設計にする | 5.6-3 | Phase 08 | Not Started | Not Started | ドキュメントサイズ監視値を確認 | - |
| DB-REQ-029 | SHOULD | ログ/履歴をサブコレクション分離し肥大化を抑制する | 5.6-4 | Phase 08 | Not Started | Not Started | sessions本体に履歴蓄積しないこと確認 | - |
| DB-REQ-030 | MUST | `sessions/{sessionId}` に無制限配列を持たせない | 5.6-5 | Phase 08 | Not Started | Not Started | スキーマレビューと実データ確認 | - |
| DB-REQ-031 | SHOULD | `sessions/{sessionId}` の目標サイズ200KB以下を維持する | 5.6-6 | Phase 08 | Not Started | Not Started | サイズ計測レポート確認 | - |
| DB-REQ-032 | MUST | Silent overwrite を禁止する | 8.2-1 | Phase 02 | In Progress | Pass | 同時保存時に片側が競合となり上書き衝突を回避できることを確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-033 | MUST | 競合検知時に「最新状態へ更新して再実行」通知を出す | 8.2-2 | Phase 02 | In Progress | Pass | 2ブラウザ同時保存テストで競合通知表示を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-034 | SHOULD | 差分再適用の自動リトライ（1〜2回）を行う | 8.2-3 | Phase 02 | Not Started | Not Started | 競合時の自動再試行回数を確認 | - |
| DB-REQ-035 | MUST | Firestore保存対象を「ユーザー確定後状態」に限定する | 8.3-1 | Phase 02 | In Progress | Not Started | 未確定操作が永続化されないこと確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-036 | MUST | 未確定ダイアログ/候補/演出中フラグを永続化しない | 8.3-2 | Phase 02 | In Progress | Not Started | 保存ドキュメントに未確定情報がないか確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-037 | MUST | 再接続時の復元基準を「最後に確定された状態」に限定する | 8.3-3 | Phase 02 | In Progress | Not Started | 再接続時挙動の仕様/実装一致確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |

---

## B. 論理モデル要件（6.x）

| ReqID | 優先度 | 要件本文 | 根拠箇所 | 実装Phase | 実装状態 | 検証状態 | 検証方法 | 証跡 |
|---|---|---|---|---|---|---|---|---|
| DB-REQ-038 | MUST | ルート構成として `sessions/{sessionId}` を持つ | 6.1 | Phase 01 | Done | Pass | Firestoreコレクション構造確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-039 | MUST | ルート構成として `sessions/{sessionId}/privateState/{playerId}` を持つ | 6.1 | Phase 01 | Done | Pass | privateState作成確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-040 | SHOULD | 監査用 `sessions/{sessionId}/actions/{actionId}` を持てる | 6.1 | Phase 06 | Not Started | Not Started | actionsサブコレクション確認 | - |
| DB-REQ-041 | MUST | `sessions/{sessionId}` に `version,status,createdAt,createdBy,updatedAt,updatedBy,revision,participants,publicState` を持つ | 6.2 | Phase 01 | Done | Pass | 必須フィールド欠損チェック | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-042 | MUST | `Participant` に `uid,displayName,joinedAt,lastSeenAt,connectionState` を持つ | 6.2 | Phase 02 | In Progress | Not Started | participant構造検証 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-043 | MUST | `publicState` に `turnContext,players.player1.board,players.player2.board,stadium` を持つ | 6.3 | Phase 01 | Done | Pass | publicState構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-044 | MUST | `board` に `active,bench,discard,lostZone,prize,markers` を持つ | 6.3 | Phase 01 | Done | Pass | board構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-045 | MUST | `StackRef` に `stackId,cardIds,damage,specialConditions,orientation,isFaceDown` を持つ | 6.3 | Phase 01 | Done | Pass | stack構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-046 | MUST | `CardRef` に `cardId,orientation,isFaceDown,visibility` を持つ | 6.3 | Phase 01 | Done | Pass | cardRef構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-047 | MUST | `PrizeCardRef` に `cardId,isFaceDown,revealedTo` を持つ | 6.3 | Phase 01 | Done | Pass | prize構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-048 | MUST | `Marker` に `markerId,targetType,targetId,label,expiresHint,createdBy,createdAt` を持つ | 6.3 | Phase 01 | Done | Pass | marker構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-049 | MUST | `privateState/{playerId}` に `ownerPlayerId,updatedAt,updatedBy,revision,zones,cardCatalog` を持つ | 6.4 | Phase 01 | Done | Pass | privateState構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-050 | MUST | `zones` に `deck,hand` を持つ | 6.4 | Phase 01 | Done | Pass | zones構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-051 | MUST | `CardEntity` に `cardId,imageUrl,originalCardCode,ownerPlayerId,createdAt` を持つ | 6.4 | Phase 01 | Done | Pass | cardCatalog構造検証 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-052 | MUST | 一時情報をサーバ保存する場合は確定直後に消去する | 6.4 注記 | Phase 02 | In Progress | Not Started | 一時領域の残存有無を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |

---

## C. 不変条件（Invariant）要件（7.x）

| ReqID | 優先度 | 要件本文 | 根拠箇所 | 実装Phase | 実装状態 | 検証状態 | 検証方法 | 証跡 |
|---|---|---|---|---|---|---|---|---|
| DB-REQ-053 | MUST | 1つの `cardId` は同時に複数ゾーンへ存在しない | 7-1 | Phase 01 | Done | Pass | 所属重複検知テスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-054 | MUST | public参照 `cardId` は対応 `cardCatalog` に必ず存在する | 7-2 | Phase 01 | Done | Pass | 参照整合性チェック | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-055 | MUST | `active` は `null` または `StackRef` のみ | 7-3 | Phase 01 | Done | Pass | 型ガードテスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-056 | MUST | `orientation` は `vertical|horizontal` のみ | 7-4 | Phase 01 | Done | Pass | 不正値保存拒否テスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-057 | MUST | `visibility=ownerOnly` カードは相手privateStateから参照不能 | 7-5 | Phase 02 | In Progress | Pass | Rulesテストで相手privateState read/write拒否を確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-058 | MUST | 更新成功時に `revision` が必ず +1 される | 7-6 | Phase 02 | In Progress | Not Started | 連続更新でrevision増分確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-059 | MUST | `updatedAt` は単調増加する | 7-7 | Phase 02 | In Progress | Not Started | 時刻逆行がないことを確認 | references/implementation_logs/260218_phase02_security_and_concurrency.md |
| DB-REQ-060 | MUST | 論理削除を含め `cardId` 再利用を禁止する | 7-8 | Phase 01 | Done | Pass | 再利用attempt拒否テスト | references/implementation_logs/260218_phase01_data_model_migration.md |

---

## D. 移行要件（10.x）

| ReqID | 優先度 | 要件本文 | 根拠箇所 | 実装Phase | 実装状態 | 検証状態 | 検証方法 | 証跡 |
|---|---|---|---|---|---|---|---|---|
| DB-REQ-061 | MUST | `version` による段階移行を採用する | 10.1 | Phase 01 | Done | Pass | version判定ロジック確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-062 | MUST | 読込時にversion判定し旧データを変換して扱う | 10.1 | Phase 01 | Done | Pass | 旧データ読込テスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-063 | MUST | `activeSpot: []` を `active: null` に正規化する | 10.2-1 | Phase 01 | Done | Pass | 変換関数テスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-064 | MUST | `all` を初期デッキスナップショット用途へ固定する | 10.2-2 | Phase 01 | Done | Pass | 更新対象除外を確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-065 | MUST | URL配列ベースの手札/山札を `cardId` ベースへ変換する | 10.2-3 | Phase 01 | Done | Pass | 変換後データ整合性確認 | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-066 | MUST | `lostZone` 未存在セッションを空配列補完する | 10.2-4 | Phase 01 | Done | Pass | 補完処理テスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-067 | MUST | `revision` 未存在セッションを `0` 初期化する | 10.2-5 | Phase 01 | Done | Pass | 初期化処理テスト | references/implementation_logs/260218_phase01_data_model_migration.md |
| DB-REQ-068 | SHOULD | 旧スキーマ互換を移行完了後に削除可能とする | 10.3 | Phase 09 | Not Started | Not Started | 互換削除判断記録確認 | - |
| DB-REQ-069 | SHOULD | 互換削除時期をリリースノートへ明記する | 10.3 | Phase 09 | Not Started | Not Started | リリースノート確認 | - |

---

## E. 完了判定（受入）要件（11.x）

| ReqID | 優先度 | 要件本文 | 根拠箇所 | 実装Phase | 実装状態 | 検証状態 | 検証方法 | 証跡 |
|---|---|---|---|---|---|---|---|---|
| DB-REQ-070 | MUST | `active` が null/オブジェクトで統一され配列保存がない | 11.1-1 | Phase 09 | Not Started | Not Started | 実データスキャン | - |
| DB-REQ-071 | MUST | 全カードが `cardId` 管理へ移行済みである | 11.1-2 | Phase 09 | Not Started | Not Started | 保存データ確認 | - |
| DB-REQ-072 | MUST | `lostZone` が両プレイヤーに存在する | 11.1-3 | Phase 09 | Not Started | Not Started | セッションデータ確認 | - |
| DB-REQ-073 | MUST | relevantカードで `orientation` と `isFaceDown` を保持できる | 11.1-4 | Phase 09 | Not Started | Not Started | UI操作後の保存確認 | - |
| DB-REQ-074 | MUST | 1カード多重所属が検知・拒否される | 11.2-1 | Phase 09 | Not Started | Not Started | 侵害ケースの拒否確認 | - |
| DB-REQ-075 | MUST | 更新ごとに `revision` が単調増加する | 11.2-2 | Phase 09 | Not Started | Not Started | 更新連続試験 | - |
| DB-REQ-076 | MUST | 競合時に上書き欠損なく再試行フローへ遷移する | 11.2-3 | Phase 09 | Not Started | Not Started | 同時更新試験 | - |
| DB-REQ-077 | MUST | playerA認証で playerB の手札/山札順序を read できない | 11.3-1 | Phase 09 | Not Started | Not Started | ルールE2E試験 | - |
| DB-REQ-078 | MUST | `playerId` 改ざんでも相手privateStateへ write できない | 11.3-2 | Phase 09 | Not Started | Not Started | 改ざんリクエスト試験 | - |
| DB-REQ-079 | MUST | 再読み込み後に最後の確定盤面が再現される | 11.4-1 | Phase 09 | Not Started | Not Started | 再入室手動試験 | - |
| DB-REQ-080 | MUST | 別端末同URL+正認可主体で同一確定状態を表示する | 11.4-2 | Phase 09 | Not Started | Not Started | 2端末再開試験 | - |
| DB-REQ-081 | MUST | 「操作途中状態は復元対象外」が仕様として明記される | 11.4-3 | Phase 09 | Not Started | Not Started | 仕様文書レビュー | - |
| DB-REQ-082 | MUST | ドキュメントサイズ監視で肥大化兆候を検知できる | 11.5-1 | Phase 09 | Not Started | Not Started | 監視ログ確認 | - |
| DB-REQ-083 | MUST | `updatedBy/updatedAt` で最終更新者追跡ができる | 11.5-2 | Phase 09 | Not Started | Not Started | 更新履歴確認 | - |
