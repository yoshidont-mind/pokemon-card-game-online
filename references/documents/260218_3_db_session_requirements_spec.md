# DB/セッション要件定義書（オンライン対戦シミュレーション）

作成日: 2026-02-18  
対象: pokemon-card-game-online（Firestore ベースの対戦状態管理）

---

## 1. 文書の目的

本書は、以下の目的で作成する。

- 本プロジェクトにおける DB/セッション実装の「完了判定基準」を明文化する。
- 開発者間で解釈が分かれないよう、Firestore データ構成・更新方式・権限制御を具体化する。
- 将来の機能追加（操作数増加、スマホ対応、対戦再開）を見据え、破綻しにくい基盤要件を定義する。

本書は「要求仕様（What）」を中心とし、実装手段（How）は推奨範囲に留める。

---

## 2. 前提・スコープ

### 2.1 サービス前提（合意済み）

- 本サービスは「オンラインで」「顔見知り同士が」「通話等で会話しながら」カジュアルに遊ぶ用途を前提とする。
- プレイヤー双方がルールに則って手動操作する前提とする。
- システムはジャッジ代替を目的としない。

### 2.2 本書の対象

- セッション作成・参加・再開の状態管理
- 対戦中盤面の Firestore 永続化
- 公開情報/非公開情報の分離
- 同時操作競合の制御
- セキュリティルール観点での情報秘匿

### 2.3 非対象（明示）

- カードテキスト解釈による効果自動処理
- ルール違反の自動検知/自動拒否（ターン制約、ダメージ妥当性等）
- 「操作途中状態」の復元（選択待ち、コイン待ち等）
  - 合意: 保存対象は「操作確定後の状態」のみ
- E2E テスト実装（現時点では未実装）

### 2.4 用語定義（本書での扱い）

- ロストゾーン:
  - トラッシュとは別の恒久ゾーン。移動したカードは通常の回収先として扱わない。
- 一時公開/一時退避領域:
  - 山札サーチなどで、最終配置を確定する前にカードを一時的に扱う概念領域。
  - 本プロジェクトでは「途中状態は保存しない」ため、永続化は必須ではない。
- 操作途中状態:
  - 選択待ち、対象未確定、演出中など、ユーザーの確定操作前の状態。
  - 合意により永続化対象外。

---

## 3. 現状（As-Is）で確認された主要課題

現行実装参照:
- `src/components/Home.js`
- `src/components/Session.js`
- `src/components/PlayingField.js`
- `public/sample_gamedata.json`

### 3.1 データ整合性

- `all/deck/hand/discard/prize` に重複表現が混在し、同一カードの所在一意性が担保されない。
- `activeSpot` の型が不一致（初期値配列 vs サンプルのオブジェクト）で、型前提の破綻リスクがある。

### 3.2 状態表現不足

- カード実体 ID がなく、同名カード複数枚を区別できない。
- 場の重なり（進化元、付属カード、重ね順）を汎用的に保持できない。
- ロストゾーンが未定義。
- 表裏/公開範囲（秘匿・公開先）がモデル化されていない。
- カード向き（縦/横）や配置順を保持する明示フィールドがない。

### 3.3 同期・運用

- 競合制御が弱く、同時更新時に last-write-wins の取りこぼしが発生し得る。
- セッション管理情報（参加者識別、接続状態、最終更新者、revision）が不足。
- 1ドキュメント集中更新方針のまま将来肥大化すると、競合頻度・容量制約のリスクが上がる。

### 3.4 セキュリティ

- 1ドキュメントに双方手札を保持すると、クライアント側検証ツール等で相手の秘匿情報を参照可能になる。

---

## 4. 設計原則（To-Be）

### 4.1 単一真実源（Single Source of Truth）

- カードの「現在位置」は必ず 1 箇所にのみ存在する。
- 初期デッキ情報（デッキ構築結果）と、対戦中の位置情報を分離する。

### 4.2 公開情報と非公開情報の分離

- 相手に見えてよい情報と見えてはいけない情報を Firestore ドキュメントレベルで分離する。
- Security Rules で読み取り可否を強制する。

### 4.3 楽観ロック＋トランザクション

- すべての更新は `revision` を用いた整合性確認を伴う。
- 競合可能な更新は Firestore transaction で実行する。

### 4.4 拡張可能な最小構造

- 「カード種別を自動判定しない」前提でも、カード移動・重なり・向き・公開状態は表現できる構造とする。

---

## 5. 要件一覧（MUST/SHOULD）

凡例:
- MUST: 完了判定に必須
- SHOULD: 早期実装を推奨（MVP後でも可）

### 5.1 データモデル要件

1. MUST: カード実体を一意に識別する `cardInstanceId` を導入する。  
2. MUST: カードメタ情報（画像URL等）と、現在位置/状態を分離する。  
3. MUST: 1カードは同時に複数ゾーンへ所属してはならない。  
4. MUST: `activeSpot` を配列ではなくオブジェクト（または null）として型固定する。  
5. MUST: 場のカードは「重なり順」を配列順で保持できる。  
6. MUST: ロストゾーンをプレイヤーゾーンとして保持できる。  
7. MUST: カードごとに `isFaceDown` と `orientation`（`vertical|horizontal`）を保持できる。  
8. SHOULD: 画面レイアウト自由配置（x/y）は将来拡張欄として予約可能にする。  

### 5.2 公開/非公開要件

1. MUST: 相手手札・相手山札順序・相手サイド実体は参照不可である。  
2. MUST: 公開情報は `publicState` に、秘匿情報は `privateState/{playerId}` に分離する。  
3. MUST: 各カードに公開範囲（`public|ownerOnly|bothRevealedTemporarily` 等）を定義できる。  
4. SHOULD: 一時公開の有効期限/解除契機を保持可能にする。  

### 5.3 セッション管理要件

1. MUST: セッションは `sessionId` 単位で作成・参加・再開できる。  
2. MUST: 参加者識別子（`player1`, `player2`）と認可主体（UIDまたは署名付きトークン）を紐づける。  
3. MUST: `lastSeenAt` を保持し、接続状態（online/offline 推定）を表示できる。  
4. MUST: すべての更新に `updatedAt`, `updatedBy`, `revision` を記録する。  
5. SHOULD: セッション状態（`waiting|ready|playing|finished|archived`）を保持する。  

### 5.4 競合制御要件

1. MUST: 対戦状態更新は transaction 経由で行う。  
2. MUST: 更新時に `expectedRevision` 一致確認を行い、不一致なら再読込・再適用する。  
3. MUST: 操作単位は「確定済みの最終状態」を1トランザクションで反映する。  
4. MUST: 競合発生時に UI へ再試行導線を提示する。  
5. SHOULD: 操作イベントID（idempotency key）で二重適用を防ぐ。  

### 5.5 監査/復旧要件

1. MUST: 最低限、`updatedAt/updatedBy/revision` で誰が最後に変更したか追跡可能である。  
2. SHOULD: `actions` サブコレクションで直近N件の操作履歴を保持する。  
3. SHOULD: 履歴未実装期間は、UIで手動修正しやすい最小編集操作を提供する。  

### 5.6 非機能要件

1. MUST: 盤面同期は通常利用で体感遅延 1 秒以内を目標とする。  
2. MUST: セッション再入室時に直近確定状態を復元できる。  
3. MUST: 1セッションあたりデータ総量は Firestore ドキュメント上限を超えない設計とする。  
4. SHOULD: 長期運用のため、ログ/履歴はサブコレクション分離で肥大化を抑制する。  
5. MUST: `sessions/{sessionId}` の単一ドキュメントに無制限配列を持たせない（履歴は保持しない）。  
6. SHOULD: `sessions/{sessionId}` の目標サイズを 200KB 以下に維持する（1MiB 上限への安全余白）。  

---

## 6. Firestore 論理モデル（要件）

以下は必須論理構造。コレクション名は同義であれば変更可。

### 6.1 ルート

- `sessions/{sessionId}`
  - セッションメタ情報
  - 公開状態（双方が読める情報）
- `sessions/{sessionId}/privateState/{playerId}`
  - 当該プレイヤーのみ読める秘匿状態
- `sessions/{sessionId}/actions/{actionId}`（SHOULD）
  - 監査用の確定操作ログ

### 6.2 `sessions/{sessionId}` 必須フィールド

- `version: number`（スキーマバージョン）
- `status: "waiting"|"ready"|"playing"|"finished"|"archived"`
- `createdAt: Timestamp`
- `createdBy: string`
- `updatedAt: Timestamp`
- `updatedBy: string`
- `revision: number`
- `participants: { player1: Participant, player2: Participant }`
- `publicState: PublicGameState`

`Participant`:
- `uid: string|null`
- `displayName: string|null`
- `joinedAt: Timestamp|null`
- `lastSeenAt: Timestamp|null`
- `connectionState: "online"|"offline"|"unknown"`

### 6.3 `publicState` 必須構造

- `turnContext`（参考表示用。厳密ルール強制はしない）
  - `turnNumber: number|null`
  - `currentPlayer: "player1"|"player2"|null`
- `players.player1.board`
- `players.player2.board`
- `stadium`（場のスタジアム）

`board`:
- `active: StackRef|null`
- `bench: StackRef[]`（0〜5 を想定、ただしハード制約はしない）
- `discard: CardRef[]`
- `lostZone: CardRef[]`
- `prize: PrizeCardRef[]`
- `markers: Marker[]`（汎用マーカー）

`StackRef`（重なりを持つ場の単位）:
- `stackId: string`
- `cardIds: string[]`（下→上）
- `damage: number`
- `specialConditions: { poisoned: boolean, burned: boolean, asleep: boolean, paralyzed: boolean, confused: boolean }
- `orientation: "vertical"|"horizontal"`
- `isFaceDown: boolean`

`CardRef`:
- `cardId: string`
- `orientation: "vertical"|"horizontal"`
- `isFaceDown: boolean`
- `visibility: "public"|"ownerOnly"|"temporarilyRevealed"`

`PrizeCardRef`:
- `cardId: string|null`（非公開時は null 許容）
- `isFaceDown: true`
- `revealedTo: "none"|"owner"|"both"`

`Marker`:
- `markerId: string`
- `targetType: "stack"|"player"|"global"`
- `targetId: string|null`
- `label: string`（例: 「次の相手ターンまで攻撃不可」）
- `expiresHint: string|null`（手動運用補助）
- `createdBy: string`
- `createdAt: Timestamp`

### 6.4 `privateState/{playerId}` 必須構造

- `ownerPlayerId: "player1"|"player2"`
- `updatedAt: Timestamp`
- `updatedBy: string`
- `revision: number`（セッションrevisionと同調または従属）
- `zones`:
  - `deck: CardRef[]`
  - `hand: CardRef[]`
- `cardCatalog: { [cardId]: CardEntity }`

`CardEntity`:
- `cardId: string`（= cardInstanceId）
- `imageUrl: string`
- `originalCardCode: string|null`（公式カードID等。取得できる場合）
- `ownerPlayerId: "player1"|"player2"`
- `createdAt: Timestamp`

注記:
- 「操作途中状態」は保存しない合意のため、選択中/解決中の一時情報は原則クライアントローカル状態で扱う。
- 山札サーチ等の UX 都合で一時作業領域をサーバーに持つ場合は SHOULD とし、確定直後に必ず消去する。

### 6.5 最小データ例（規範）

以下は型解釈の曖昧さを防ぐための最小例。値は例示であり、キー構造が規範。

```json
{
  "version": 2,
  "status": "playing",
  "revision": 42,
  "participants": {
    "player1": { "uid": "uidA", "lastSeenAt": "timestamp", "connectionState": "online" },
    "player2": { "uid": "uidB", "lastSeenAt": "timestamp", "connectionState": "offline" }
  },
  "publicState": {
    "turnContext": { "turnNumber": 7, "currentPlayer": "player1" },
    "players": {
      "player1": {
        "board": {
          "active": {
            "stackId": "s_p1_active",
            "cardIds": ["c_p1_001", "c_p1_021"],
            "damage": 60,
            "specialConditions": {
              "poisoned": false, "burned": false, "asleep": false, "paralyzed": false, "confused": false
            },
            "orientation": "vertical",
            "isFaceDown": false
          },
          "bench": [],
          "discard": [],
          "lostZone": [],
          "prize": [{ "cardId": null, "isFaceDown": true, "revealedTo": "none" }],
          "markers": []
        }
      },
      "player2": {
        "board": {
          "active": null,
          "bench": [],
          "discard": [],
          "lostZone": [],
          "prize": [{ "cardId": null, "isFaceDown": true, "revealedTo": "none" }],
          "markers": []
        }
      }
    },
    "stadium": null
  }
}
```

---

## 7. データ不変条件（Invariant）

実装は以下を常に満たすこと。

1. 1つの `cardId` は同時に複数ゾーンへ存在しない。  
2. 盤面（public）で参照される `cardId` は、必ず対応プレイヤー `cardCatalog` に存在する。  
3. `active` は `null` または `StackRef` のみ（配列禁止）。  
4. `orientation` は `vertical|horizontal` のみ。  
5. `visibility=ownerOnly` のカード実体は相手の `privateState` から参照不能。  
6. 更新成功時は `revision` が必ず +1 される。  
7. `updatedAt` は単調増加する。  
8. 論理削除する場合も `cardId` 再利用は禁止。  

---

## 8. 更新プロトコル要件

### 8.1 操作確定フロー

1. クライアントは最新 `sessions/{sessionId}` と自分の `privateState/{playerId}` を取得する。  
2. 操作結果（最終状態差分）をローカルで作成する。  
3. transaction 内で以下を実施する。  
   - `revision` 一致確認
   - Invariant 検証
   - `publicState` 更新
   - 必要な `privateState` 更新
   - `updatedAt`, `updatedBy`, `revision+1` 更新
4. 不一致時は abort し、再読込後に再適用する。  

### 8.2 同時操作競合時の挙動

- MUST: Silent overwrite を禁止する（気づかない上書きをしない）。
- MUST: 競合を検知したら UI に「最新状態へ更新して再実行」通知を出す。
- SHOULD: 差分再適用の自動リトライ（1〜2回）を行う。

### 8.3 「操作途中状態を保存しない」運用の必須条件

1. MUST: Firestore に保存するのは「ユーザーが確定した後」の状態のみ。  
2. MUST: 未確定ダイアログ/選択中候補/コイン演出中フラグは永続化しない。  
3. MUST: 再接続時は「最後に確定された状態」を唯一の復元基準とする。  

---

## 9. セキュリティルール要件（Firestore Rules）

### 9.1 基本方針

- 認証済みユーザーのみ read/write を許可する。
- `sessions/{sessionId}` は参加者のみ read を許可する。
- `privateState/{playerId}` は所有プレイヤー本人のみ read/write を許可する。
- 直接の無制限 `update` を避け、許可フィールドを限定する。

### 9.2 必須保護項目

1. 相手の `privateState` を read できないこと。  
2. 相手になりすました `playerId` 書き込みを拒否すること。  
3. `revision` を巻き戻す更新を拒否すること（または Cloud Functions 経由に限定）。  
4. `updatedBy` が認証主体と一致しない更新を拒否すること。  

### 9.3 推奨

- 重要更新（対戦状態更新）は callable Functions 集約も検討する。
- ルール評価コストを抑えるため、participant 情報を session 本体に保持する。

---

## 10. 移行要件（現行スキーマから）

### 10.1 移行方針

- 既存 `sessions` を即時破壊せず、`version` による段階移行を行う。
- 読み込み時に `version` を判定し、旧データは変換して扱う。

### 10.2 最低移行項目

1. `activeSpot: []` を `active: null` へ正規化。  
2. `all` を「初期デッキスナップショット」扱いへ固定、対戦中整合の参照元から外す。  
3. URL配列ベースの手札/山札を `cardId` ベースへ変換。  
4. `lostZone` 未存在セッションは空配列で補完。  
5. `revision` 未存在セッションは `0` 初期化。  

### 10.3 互換期限

- 旧スキーマ読み取り互換は移行完了後に削除可能とする。
- 削除時期はリリースノートで明記する。

---

## 11. 完了判定（受け入れ基準）

以下をすべて満たした場合、本書対象は完了と判定する。

### 11.1 スキーマ/型

- [ ] `active` が null またはオブジェクトで統一され、配列が保存されない。  
- [ ] 全カードが `cardId` を持ち、URL文字列単体管理から脱却している。  
- [ ] `lostZone` が両プレイヤーに存在する。  
- [ ] `orientation` と `isFaceDown` を全 relevant カードで保持できる。  

### 11.2 整合性

- [ ] 1カード多重所属が検知・拒否される。  
- [ ] 更新ごとに `revision` が単調増加する。  
- [ ] 競合時に上書き欠損が発生せず、再試行フローへ遷移する。  

### 11.3 セキュリティ

- [ ] プレイヤーAでログインした状態で、プレイヤーBの手札/山札順序を read できない。  
- [ ] クライアント改ざんで `playerId` を差し替えても相手 privateState へ write できない。  

### 11.4 セッション再開

- [ ] ブラウザ再読み込み後、最後に確定した盤面が再現される。  
- [ ] 別端末で同じ URL + 正しい認可主体で入室したとき、同じ確定状態が見える。  
- [ ] 「操作途中（未確定）」は復元対象外であることが仕様として明記されている。  

### 11.5 運用観点

- [ ] ドキュメントサイズ監視（簡易ログで可）があり、肥大化兆候を検知できる。  
- [ ] `updatedBy/updatedAt` で最終更新者を追跡できる。  

---

## 12. 実装優先順位（推奨）

1. P0: `cardId` 導入、`active` 型統一、`lostZone` 追加、`revision` 追加  
2. P0: `publicState` / `privateState` 分離 + Security Rules 適用  
3. P0: transaction 化 + 競合ハンドリング UI  
4. P1: マーカー、向き、裏向き、重なり操作のUI整備  
5. P2: `actions` ログ導入、移行互換削除  

---

## 13. 参考（本リポジトリ内）

- `README.md`
- `references/documents/260218_1_pokemon_card_game_rules_requirements_baseline.md`
- `references/documents/260218_2_card_effect_operation_matrix.md`
- `src/components/Home.js`
- `src/components/Session.js`
- `src/components/PlayingField.js`
- `public/sample_gamedata.json`
