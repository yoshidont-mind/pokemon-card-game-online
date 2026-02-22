# Cloud Billing 予算超過時に「プロキシのみ」を自動停止する実装手順書（上限: 1,000円/月）

作成日: 2026-02-22（JST）  
ステータス: Plan only（未着手）  
対象リポジトリ: `pokemon-card-game-online`

---

## 0. この手順書の目的

この手順書は、Cloud Billing の予算通知を使って、**月額 1,000 円の予算超過（実コスト）を検知したときに、デッキ取得プロキシだけを自動停止**するための実装・設定・検証手順を定義する。

要件:
- 停止対象はプロキシ機能のみ（サイト全体停止はしない）
- 閾値は `1,000 円 / 月`
- 多少の超過は許容（通知遅延のため厳密ジャスト停止は求めない）

---

## 1. 先に結論（採用アーキテクチャ）

採用構成:
1. Cloud Billing Budget（1,000 JPY / 月, 実コスト 100% しきい値）
2. Programmatic notifications（Pub/Sub topic）
3. Firebase Functions（Pub/Subトリガー関数: `budgetGuard`）
4. Firestore の制御ドキュメント（`proxyControl`）
5. 既存 HTTP 関数 `proxyDeck` が `proxyControl.enabled` を参照して停止判定

動作イメージ:
- 予算通知 -> Pub/Sub -> `budgetGuard` 実行
- `budgetGuard` が Firestore に `enabled=false` を書き込む
- `proxyDeck` は `enabled=false` を検出したら 503 で即時拒否

この方式のメリット:
- サイト全体は継続利用できる
- 停止対象をプロキシのみに限定できる
- 実装コストが低く、運用時の復旧も簡単

---

## 2. 重要な制約（必読）

1. **Budget はコスト上限のハード停止機能ではない**
   - 通知はできるが、課金そのものを即時停止する機能ではない。
2. **通知は遅延・重複・順不同があり得る**
   - 初回通知に数時間かかる場合がある。
   - at-least-once 配信のため重複受信がある。
3. したがって「1,000円ぴったりで必ず停止」は保証できない。

本件では「多少超えてもよい」という要件なので、この制約を許容して採用する。

---

## 3. 公式一次情報（2026-02-22 確認）

1. Cloud Billing Budget は通知中心（自動 cap ではない）  
   https://docs.cloud.google.com/billing/docs/how-to/budgets
2. Programmatic notifications（Pub/Sub 接続・通知形式・配信保証）  
   https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications
3. Budget 通知の購読（Cloud Run functions 例、通知JSON例）  
   https://cloud.google.com/billing/docs/how-to/listen-to-notifications
4. Budget REST `NotificationsRule`（Pub/Sub topic, schemaVersion, しきい値関連注意）  
   https://cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets
5. `gcloud billing budgets create` CLI 仕様（本手順書作成時にローカルCLI helpで確認）

補足（Firebase Functions側）:
- Pub/Sub トリガー（Functions）  
  https://firebase.google.com/docs/functions/pubsub-events

---

## 4. 完了条件（Definition of Done）

以下すべてを満たすこと。

1. `budgetGuard`（Pub/Subトリガー）がデプロイ済み
2. Budget（1,000 JPY / 月, 100% current-spend）が作成済み
3. Budget が Pub/Sub topic に接続済み
4. テスト通知（擬似メッセージ publish）で `proxyControl.enabled=false` になる
5. `proxyDeck` が停止状態で 503 を返す
6. 手動復旧（`enabled=true`）でプロキシが再開する
7. 実装ログにコマンド出力と検証結果が残っている

---

## 5. 実装方針（コード）

## 5.1 Firestore 制御ドキュメント

推奨パス:
- `system/control_proxy`

推奨スキーマ:
```json
{
  "enabled": true,
  "disabledByBudget": false,
  "budgetDisplayName": null,
  "billingAccountId": null,
  "triggeredAt": null,
  "lastCostAmount": null,
  "budgetAmount": null,
  "currencyCode": "JPY",
  "lastNotificationEventId": null,
  "updatedAt": "ISO8601"
}
```

## 5.2 `proxyDeck` 側の変更

- Firestore の `system/control_proxy` を参照
- `enabled === false` のとき:
  - HTTP 503
  - 例: `{ "error": "Proxy temporarily disabled by budget guard" }`
- 無駄 read 削減のため、30〜60 秒のメモリキャッシュを持つ

## 5.3 `budgetGuard` 関数の責務

トリガー:
- Pub/Sub topic 受信（Budget 通知）

判定条件:
- `currencyCode == "JPY"`
- `budgetDisplayName` が対象名と一致
- かつ次のいずれか
  - `alertThresholdExceeded >= 1.0`
  - `costAmount >= budgetAmount`

実行内容:
- `system/control_proxy.enabled = false`
- 監査メタデータを保存
- 同じ `eventId` を重複適用しない（冪等化）

---

## 6. 事前準備

## 6.1 必要ロール（目安）

- Cloud Billing 側: Budget 作成できる権限
- GCP Project 側:
  - Pub/Sub topic 作成権限
  - Functions デプロイ権限
  - Firestore 書き込み（Functions 実行サービスアカウント経由）

## 6.2 変数を決める

```bash
export PROJECT_ID="pokemon-card-game-online-80212"
export PROJECT_NUMBER="386079812657"
export TOPIC_ID="billing-budget-alerts-proxy-stop"
export BUDGET_DISPLAY_NAME="pokemon-tcg-proxy-stop-1000jpy"
export BUDGET_AMOUNT="1000JPY"
# 例: 01D4EE-079462-DFD6EC
export BILLING_ACCOUNT_ID="<YOUR_BILLING_ACCOUNT_ID>"
```

`BILLING_ACCOUNT_ID` の確認:
```bash
gcloud billing accounts list
```

---

## 7. CLI 手順（本体）

## Step 1: gcloud 対象プロジェクトを設定

```bash
gcloud config set project "$PROJECT_ID"
```

## Step 2: Pub/Sub topic 作成

```bash
gcloud pubsub topics create "$TOPIC_ID"
```

Topic fully-qualified name:
```bash
export BUDGET_TOPIC="projects/$PROJECT_ID/topics/$TOPIC_ID"
```

## Step 3: Budget 作成（1,000JPY / 月 / 100% 実コスト）

```bash
gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT_ID" \
  --display-name="$BUDGET_DISPLAY_NAME" \
  --budget-amount="$BUDGET_AMOUNT" \
  --calendar-period=month \
  --filter-projects="projects/$PROJECT_ID" \
  --threshold-rule=percent=1.0,basis=current-spend \
  --notifications-rule-pubsub-topic="$BUDGET_TOPIC"
```

注意:
- `--disable-default-iam-recipients` は付けない（通知要件を満たすため）
- Budget通知の初回到達には時間がかかる場合がある

## Step 4: Budget 作成確認

```bash
gcloud billing budgets list --billing-account="$BILLING_ACCOUNT_ID"
```

---

## 8. アプリ実装手順（リポジトリ）

## Step 5: 作業ブランチ作成

```bash
git checkout -b feat/budget-guard-proxy-autostop
```

## Step 6: Functions コード実装

対象:
- `functions/index.js`

追加/変更:
1. `onMessagePublished` トリガー `budgetGuard` を追加
2. `proxyDeck` 冒頭に `proxyControl` 読み取り判定を追加
3. Firestore Admin SDK 初期化（未初期化なら追加）
4. ログ（`logger.info/warn/error`）を十分に入れる

実装ポイント:
- Pub/Sub data は base64 JSON をパース
- `event.id` で重複処理防止
- 失敗時でも関数全体をクラッシュさせない

## Step 7: ローカル静的チェック

```bash
npm run build
cd functions && npm test 2>/dev/null || true && cd ..
```

---

## 9. デプロイ手順

> ここからリモート影響がある。実行前にユーザー承認を取る。

## Step 8: Functions デプロイ

```bash
firebase deploy --only functions
```

## Step 9: Hosting を含む場合（必要時）

```bash
firebase deploy --only functions,hosting
```

---

## 10. 検証手順（必須）

## 10.1 事前状態確認（enabled=true）

- Firestore `system/control_proxy.enabled == true` を確認
- 通常 deckCode で `/api/proxy` が 200 を返すことを確認

## 10.2 擬似 Budget 通知 publish（E2E代替）

`budgetGuard` を即時検証するため、Pub/Sub にテスト通知を投入する。

```bash
gcloud pubsub topics publish "$TOPIC_ID" \
  --message='{"budgetDisplayName":"pokemon-tcg-proxy-stop-1000jpy","alertThresholdExceeded":1.0,"costAmount":1000.01,"costIntervalStart":"2026-02-01T00:00:00Z","budgetAmount":1000.0,"budgetAmountType":"SPECIFIED_AMOUNT","currencyCode":"JPY"}' \
  --attribute="billingAccountId=$BILLING_ACCOUNT_ID,budgetId=test-budget,schemaVersion=1.0"
```

## 10.3 停止確認

- Firestore `enabled=false` へ変化
- `GET /api/proxy?...` が 503 になる
- `firebase functions:log --only budgetGuard,proxyDeck --lines 50` で実行ログ確認

## 10.4 手動復旧確認

- Firestore で `enabled=true` に戻す（GUIまたは管理スクリプト）
- `/api/proxy?...` が 200 に復帰

---

## 11. GUI 手順（必要時のみ）

CLIが使えない場合の最小GUI手順。

## 11.1 Budget と Pub/Sub 接続（Console）

1. Google Cloud Console -> `Billing` -> `Budgets & alerts`
2. 対象の Cloud Billing Account を選択
3. Budget 作成（または既存編集）
4. Amount: `1000 JPY`、Period: Monthly
5. Filter: Project を `pokemon-card-game-online-80212` に限定
6. Threshold: Actual spend 100%
7. Actions / Notifications で Pub/Sub topic を接続

UI変動対策:
- 画面上部の検索で `Budgets & alerts` / `Pub/Sub` を直接検索する
- 「Manage notifications」「Connect Pub/Sub topic」等の表記ゆれに注意

---

## 12. 運用ルール（事故予防）

1. 予算通知は遅延する前提で運用する
2. 月初復旧ルールを明文化する（手動で `enabled=true` に戻す）
3. 重大通知はメール/Slackにも転送（任意）
4. `budgetGuard` の誤作動防止として `budgetDisplayName` 一致チェックを必ず入れる
5. 同一 topic を複数予算で共有する場合、budget 名で必ず分岐する

---

## 13. ロールバック手順

不具合時は以下。

1. `proxyDeck` の制御判定を一時無効化して再デプロイ
2. Firestore `enabled=true` をセット
3. `budgetGuard` を切り戻し（前コミットへ戻して functions deploy）
4. 必要なら Budget 側の Pub/Sub 接続を一時解除

---

## 14. 想定差分ファイル

- `functions/index.js`（`budgetGuard` 追加、`proxyDeck` 停止判定）
- （必要なら）`functions/package.json`
- `references/implementation_logs/260222_2_budget_threshold_proxy_autostop_1000jpy.md`

---

## 15. 実作業時の停止ポイント（Codex運用）

Codex は以下で必ず停止してユーザー確認を取る。

1. `gcloud billing budgets create` 実行前（課金アカウント設定変更）
2. `firebase deploy --only functions` 実行前（本番反映）
3. `git push` / PR 作成前（リモート反映）

