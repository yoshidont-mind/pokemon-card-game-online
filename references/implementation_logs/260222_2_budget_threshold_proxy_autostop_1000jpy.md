# 実装ログ: Cloud Billing 予算超過時「プロキシのみ」自動停止（1,000円/月）

作成日: 2026-02-22（JST）

> ルール:
> - 秘匿情報は記載しない（必要なら `<REDACTED>`）。
> - ターミナル出力は本ファイル内に直接記載する。

## 進捗サマリ（随時更新）

- [x] 実装手順書の作成
- [x] 事前読み取り確認（gcloud/Firebase現状）
- [x] Pub/Sub topic 作成
- [x] Budget 1,000JPY/月 作成（Pub/Sub通知連携）
- [x] `budgetGuard` 実装
- [x] `proxyDeck` 停止判定実装
- [x] Functions デプロイ
- [x] 擬似通知検証（停止→復旧）

## 作業ログ

### 2026-02-22（JST）

#### 1) 初期確認

- 現在ブランチ: `main`
- 手順書/ログファイルは未追跡で存在

##### 実行コマンド/出力

```bash
$ git status --short
?? references/implementation_logs/260222_2_budget_threshold_proxy_autostop_1000jpy.md
?? references/implementation_plans/260222_2_budget_threshold_proxy_autostop_1000jpy.md

$ git branch --show-current
main
```

#### 2) gcloud 読み取り確認（Step 1 前）

目的:
- Budget / PubSub 操作をCLIで進める前に、gcloud 認証と課金アカウント参照可否を確認する。

##### 実行コマンド/出力

```bash
$ gcloud config list --format='text(core.account,core.project)'
: None

$ gcloud auth list --filter=status:ACTIVE --format='table(account,status)'
WARNING: The following filter keys were not present in any resource : status

$ gcloud billing accounts list --format='table(name,open,displayName)'
ERROR: (gcloud.billing.accounts.list) You do not currently have an active account selected.
Please run:

  $ gcloud auth login
```

#### 3) 現在の状態（ブロッカー）

- **gcloud 側でアクティブアカウント未設定**のため、Budget/PubSub設定に進めない。
- ここで中断し、ユーザーに `gcloud auth login` を依頼する。


#### 4) ユーザー作業後の再開（gcloud認証）

- ユーザー側で以下を実施済み（共有内容を確認）:
  - `gcloud auth login`
  - `gcloud config set project pokemon-card-game-online-80212`

#### 5) 読み取り確認（再実行）

目的:
- 認証/プロジェクト設定の反映確認
- 対象プロジェクトに紐づく Billing Account を特定
- 既存の topic/budget 重複有無を確認

##### 実行コマンド/出力

```bash
$ gcloud config list --format='text(core.account,core.project)'
account: yoshidon.com@gmail.com
project: pokemon-card-game-online-80212

$ gcloud auth list --format='table(account,status)'
ACCOUNT                 ACTIVE
yoshidon.com@gmail.com  *

$ gcloud billing accounts list --format='table(name,open,displayName)'
ACCOUNT_ID            OPEN  NAME
011B91-E5F3EF-0FDA74  True  Firebase Payment
0138A1-121826-808737  True  Firebase Payment

$ gcloud billing projects describe pokemon-card-game-online-80212 --format='yaml(billingAccountName,billingEnabled,name)'
billingAccountName: billingAccounts/0138A1-121826-808737
billingEnabled: true
name: projects/pokemon-card-game-online-80212/billingInfo
```

判定:
- このプロジェクトに実際に紐づいている課金アカウントは `0138A1-121826-808737`。
- 以降の Budget 作成はこのアカウントで実施する。

##### 重複確認

```bash
$ gcloud pubsub topics list --project pokemon-card-game-online-80212 --format='value(name)'
(既存topic一覧)

$ gcloud billing budgets list --billing-account=0138A1-121826-808737 --format='table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode,budgetFilter.projects)'
(既存budget一覧)
```

#### 6) リモート設定変更（ユーザー承認後）

目的:
- 予算通知の受け口Topicを作成
- 1,000円/月の停止トリガーBudgetを作成

##### 実行コマンド/出力

```bash
$ gcloud config set project pokemon-card-game-online-80212
Updated property [core/project].

$ gcloud services enable billingbudgets.googleapis.com pubsub.googleapis.com --project pokemon-card-game-online-80212
Operation "operations/acat.p2-386079812657-e7b13fd5-a4e2-4171-b3ad-e4f2ce341cf8" finished successfully.

$ gcloud pubsub topics create billing-budget-alerts-proxy-stop --project pokemon-card-game-online-80212
Created topic [projects/pokemon-card-game-online-80212/topics/billing-budget-alerts-proxy-stop].

$ gcloud billing budgets create \
  --billing-account=0138A1-121826-808737 \
  --display-name="pokemon-tcg-proxy-stop-1000jpy" \
  --budget-amount=1000JPY \
  --calendar-period=month \
  --filter-projects="projects/pokemon-card-game-online-80212" \
  --threshold-rule=percent=1.0,basis=current-spend \
  --notifications-rule-pubsub-topic="projects/pokemon-card-game-online-80212/topics/billing-budget-alerts-proxy-stop"
Created budget [billingAccounts/0138A1-121826-808737/budgets/396B5D_CCD7A2_7C58FF].
```

##### 作成後検証（再確認）

```bash
$ gcloud config list --format='text(core.account,core.project)'
account: yoshidon.com@gmail.com
project: pokemon-card-game-online-80212

$ gcloud pubsub topics list --project pokemon-card-game-online-80212 --format='value(name)'
projects/pokemon-card-game-online-80212/topics/billing-budget-alerts-proxy-stop

$ gcloud billing budgets list --billing-account=0138A1-121826-808737 --format='table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode,thresholdRules,budgetFilter.projects)'
DISPLAY_NAME                                     UNITS  CURRENCY_CODE  THRESHOLD_RULES                                                                                                                                                                 PROJECTS
Firebase Project pokemon-card-game-online-80212  1000   JPY            [{'spendBasis': 'CURRENT_SPEND', 'thresholdPercent': 0.5}, {'spendBasis': 'CURRENT_SPEND', 'thresholdPercent': 0.9}, {'spendBasis': 'CURRENT_SPEND', 'thresholdPercent': 1.0}]  ['projects/386079812657']
pokemon-tcg-proxy-stop-1000jpy                   1000   JPY            [{'spendBasis': 'CURRENT_SPEND', 'thresholdPercent': 1.0}]                                                                                                                      ['projects/386079812657']
```

判定:
- Topic作成成功
- Budget作成成功
- しきい値1.0（実コスト）のBudgetが存在することを確認

#### 7) ブランチ作成

```bash
$ git checkout -b feat/budget-guard-proxy-autostop
Switched to a new branch 'feat/budget-guard-proxy-autostop'
```

#### 8) コード実装（`functions/index.js`）

実装内容:
- `firebase-admin` 初期化を追加
- Firestore `system/control_proxy` のキャッシュ付き参照関数を追加
- `proxyDeck` 冒頭で `enabled=false` のとき 503 返却する停止判定を追加
- Pub/Subトリガー `budgetGuard` を追加
  - 通知JSONパース（`message.json` と `base64 data` の両対応）
  - 対象Budget名/通貨/閾値の判定
  - 重複通知（`event.id`）の冪等化
  - Firestore へ停止フラグと監査メタデータを書き込み

差分要約:

```bash
$ git diff --stat functions/index.js
 functions/index.js | 187 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 187 insertions(+)
```

#### 9) ローカル検証

##### 実行コマンド/出力

```bash
$ node --check functions/index.js
(no output)

$ npm run build
> pokemon_card_game_online@0.1.0 build
> react-scripts build
...
Compiled with warnings.

[eslint]
src/components/PlayingField.js
  Line 3112:51: react-hooks/exhaustive-deps warning
```

判定:
- `functions/index.js` の構文エラーなし
- フロントビルド成功（既存警告のみ）

#### 10) Functions デプロイ（ユーザー承認後）

##### 実行コマンド/出力

```bash
$ firebase deploy --only functions
=== Deploying to 'pokemon-card-game-online-80212'...
...
✔  functions[proxyDeck(asia-northeast1)] Successful update operation.
✔  functions[budgetGuard(asia-northeast1)] Successful create operation.
Function URL (proxyDeck(asia-northeast1)): https://proxydeck-osmrjwozuq-an.a.run.app
...
✔  Deploy complete!
```

補足:
- Node.js 20 ランタイムの将来 deprecation 警告あり（今回の動作には影響なし）
- `firebase-functions` バージョン古い旨の警告あり（今回は見送り）
- build image cleanup warning 1件あり（小額課金リスクの注意）

#### 11) 擬似通知検証（停止）

##### 11-1. 停止前のプロキシ疎通確認

```bash
$ curl -sS -o /tmp/proxy_before.json -w '%{http_code}\n' 'https://proxydeck-osmrjwozuq-an.a.run.app?deckCode=2MSM3y-wJdQnX-pR2pyX'
200

$ cat /tmp/proxy_before.json | jq '{imageUrlsCount: (.imageUrls|length), cardDataCount: (.cardData|length)}'
{
  "imageUrlsCount": 15,
  "cardDataCount": 15
}
```

##### 11-2. 擬似Budget通知 publish

```bash
$ gcloud pubsub topics publish billing-budget-alerts-proxy-stop --project pokemon-card-game-online-80212 --message='{"budgetDisplayName":"pokemon-tcg-proxy-stop-1000jpy","alertThresholdExceeded":1.0,"costAmount":1000.01,"costIntervalStart":"2026-02-01T00:00:00Z","budgetAmount":1000.0,"budgetAmountType":"SPECIFIED_AMOUNT","currencyCode":"JPY"}' --attribute='billingAccountId=0138A1-121826-808737,budgetId=test-budget,schemaVersion=1.0'
messageIds:
- '17975868990240070'
```

##### 11-3. `budgetGuard` 実行ログ確認

```bash
$ firebase functions:log --only budgetGuard --lines 20
...
W budgetguard: {"eventId":"17975868990240070","message":"budgetGuard: proxy disabled","budgetDisplayName":"pokemon-tcg-proxy-stop-1000jpy","costAmount":1000.01,"currencyCode":"JPY","budgetAmount":1000}
```

##### 11-4. Firestore 停止フラグ確認

```bash
$ ACCESS_TOKEN=$(gcloud auth print-access-token)
$ curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" "https://firestore.googleapis.com/v1/projects/pokemon-card-game-online-80212/databases/%28default%29/documents/system/control_proxy" | jq '{name, fields: {enabled: .fields.enabled, disabledByBudget: .fields.disabledByBudget, budgetDisplayName: .fields.budgetDisplayName, updatedAt: .fields.updatedAt}}'
{
  "name": "projects/pokemon-card-game-online-80212/databases/(default)/documents/system/control_proxy",
  "fields": {
    "enabled": {
      "booleanValue": false
    },
    "disabledByBudget": {
      "booleanValue": true
    },
    "budgetDisplayName": {
      "stringValue": "pokemon-tcg-proxy-stop-1000jpy"
    },
    "updatedAt": {
      "timestampValue": "2026-02-22T10:42:42.573Z"
    }
  }
}
```

##### 11-5. 停止後のプロキシ応答確認

```bash
$ curl -sS -o /tmp/proxy_after_disable.json -w '%{http_code}\n' 'https://proxydeck-osmrjwozuq-an.a.run.app?deckCode=2MSM3y-wJdQnX-pR2pyX'
503

$ cat /tmp/proxy_after_disable.json | jq '.'
{
  "error": "Proxy temporarily disabled by budget guard"
}
```

判定:
- 擬似通知によりプロキシ自動停止が発動したことを確認

#### 12) 手動復旧確認

##### 12-1. Firestore フラグを手動復旧

```bash
$ ACCESS_TOKEN=$(gcloud auth print-access-token)
$ NOW_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
$ curl -sS -X PATCH \
  "https://firestore.googleapis.com/v1/projects/pokemon-card-game-online-80212/databases/%28default%29/documents/system/control_proxy?updateMask.fieldPaths=enabled&updateMask.fieldPaths=disabledByBudget&updateMask.fieldPaths=updatedAt" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"fields\":{\"enabled\":{\"booleanValue\":true},\"disabledByBudget\":{\"booleanValue\":false},\"updatedAt\":{\"timestampValue\":\"${NOW_UTC}\"}}}" | jq '{fields: {enabled: .fields.enabled, disabledByBudget: .fields.disabledByBudget, updatedAt: .fields.updatedAt}}'
{
  "fields": {
    "enabled": {
      "booleanValue": true
    },
    "disabledByBudget": {
      "booleanValue": false
    },
    "updatedAt": {
      "timestampValue": "2026-02-22T10:43:49Z"
    }
  }
}
```

##### 12-2. 復旧後のプロキシ疎通確認

```bash
$ curl -sS -o /tmp/proxy_after_reenable.json -w '%{http_code}\n' 'https://proxydeck-osmrjwozuq-an.a.run.app?deckCode=2MSM3y-wJdQnX-pR2pyX'
200

$ cat /tmp/proxy_after_reenable.json | jq '{imageUrlsCount: (.imageUrls|length), cardDataCount: (.cardData|length)}'
{
  "imageUrlsCount": 15,
  "cardDataCount": 15
}
```

判定:
- 手動復旧後、プロキシは正常応答へ復帰

---

## 最終判定（この時点）

- Budget通知 -> Pub/Sub -> `budgetGuard` -> Firestore停止フラグ -> `proxyDeck` 503 の一連動作を確認。
- 復旧手順（`enabled=true`）で運用復帰できることを確認。
