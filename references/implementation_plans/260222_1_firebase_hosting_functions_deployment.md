# Firebase Hosting + Functions（プロキシ同時公開）実装手順書

作成日: 2026-02-22 (JST)  
ステータス: Plan only（未着手）  
対象リポジトリ: `pokemon-card-game-online`

---

## 0. この手順書の目的

この手順書は、以下を **安全に** かつ **再現可能に** 実施するための実行ガイドです。

- フロントエンド（React）を Firebase Hosting へ公開
- デッキ情報取得用プロキシ（現 `proxy-server.js` 相当）を Cloud Functions for Firebase として公開
- フロントから `localhost:3001` 依存を除去し、インターネット経由で利用可能にする

本手順書は「実装作業時に Codex がそのまま実行できること」を重視し、CLI中心で記述します。

---

## 1. 先に固定する意思決定

### 1.1 採用アーキテクチャ

- Hosting: Firebase Hosting
- Proxy API: Cloud Functions for Firebase（HTTP function）
- ルーティング: Hosting `rewrites` で `/api/proxy` を Function に転送

### 1.2 この方式を採用する理由

- Firebase内で完結できる
- フロント + プロキシを同時にデプロイ可能
- 将来 `firebase deploy --only functions,hosting` で一貫運用しやすい

### 1.3 重要な制約（公式仕様）

- Functions を本番デプロイするには Blaze プランが必要
- Hosting は無料枠（`web.app` / `firebaseapp.com`）で開始可能

---

## 2. 公式一次情報（最終確認済み）

以下を 2026-02-22 に確認。

1. Firebase Hosting 概要（`web.app` / `firebaseapp.com`、Functions/Run 連携）  
   https://firebase.google.com/docs/hosting
2. Hosting 設定（`rewrites` で function へ転送、`pinTag`、`region`）  
   https://firebase.google.com/docs/hosting/full-config
3. Cloud Functions for Firebase Get started（Blaze 必須、Node 20/22、`firebase init functions`）  
   https://firebase.google.com/docs/functions/get-started
4. Hosting + Functions 連携ガイド（`firebase deploy --only functions,hosting`）  
   https://firebase.google.com/docs/hosting/functions
5. Firebase pricing plans（Spark/Blaze、Blazeへのアップグレード導線）  
   https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
6. Hosting usage/quotas（Hosting 無料枠、超過時挙動）  
   https://firebase.google.com/docs/hosting/usage-quotas-pricing
7. Cloud Billing budgets（予算アラート）  
   https://cloud.google.com/billing/docs/how-to/budgets

---

## 3. 完了条件（Definition of Done）

以下をすべて満たしたら完了。

1. `http://localhost:3001/proxy` 直指定がフロントコードから除去されている
2. `/api/proxy?deckCode=...` が Hosting 経由で Function に到達し、`{ imageUrls, cardData }` を返す
3. 本番URL（`https://<PROJECT_ID>.web.app`）からデッキ情報取得が成功する
4. 既存の Firestore セッション機能（作成/参加/対戦表示）に回帰不具合がない
5. デプロイ後ログ確認で致命エラーがない（Function 5xx 連発なし）

---

## 4. 実施時の安全ルール（このタスク専用）

### 4.1 Codex が必ず停止して確認を取るポイント

以下はリモート/課金影響があるため、実行前に必ずユーザー承認を取る。

- Blaze へのアップグレード（課金アカウント連携）
- `firebase deploy --only functions,hosting`
- Git の `push` / PR 作成

### 4.2 絶対禁止

- `git push --force`
- 本番 Firestore データの破壊的削除
- Firebase プロジェクト削除

---

## 5. 事前チェック（ローカル）

## 5.1 環境整合

1. Node バージョン確認

```bash
node -v
npm -v
```

2. プロジェクト `package.json` は `"node": ">=20 <21"` なので Node 20 系を使用

```bash
nvm use 20
node -v
```

3. Firebase CLI 確認

```bash
firebase --version
```

4. Firebase ログイン状態確認

```bash
firebase login:list
```

## 5.2 作業ブランチ作成

```bash
git checkout -b chore/firebase-hosting-functions-deploy
```

## 5.3 現状依存箇所確認（記録）

```bash
rg -n "localhost:3001|/proxy\?" src proxy-server.js
```

期待: `src/components/Session.js` のデッキ取得 URL と `proxy-server.js` がヒット。

---

## 6. 実装ステップ（CLI中心）

## Step 1: Functions 初期化

> `functions/` ディレクトリが未作成の場合のみ実行。既にある場合は Step 2 へ。

```bash
firebase init functions
```

選択方針:

- Use an existing project: `Yes`
- Language: `JavaScript`（本リポジトリ現行スタイルに合わせる）
- ESLint: `Yes`（任意）
- Install dependencies now: `Yes`

確認:

- `functions/package.json`
- `functions/index.js`（または `functions/src/index.js`）

## Step 2: Functions 側でプロキシエンドポイント実装

### 2.1 実装方針（必須）

- Open Proxy 化を防ぐため、`url` 直受けは廃止し、`deckCode` 入力のみ受ける
- 取得先 URL はサーバー側で固定生成:
  - `https://www.pokemon-card.com/deck/confirm.html/deckID/${deckCode}`
- レスポンス形式は既存フロント互換:
  - `{ imageUrls: string[], cardData: { id: string, count: number }[] }`

### 2.2 依存追加（Functions 側）

```bash
cd functions
npm install axios cheerio
cd ..
```

### 2.3 実装要件

- HTTP method: `GET` + `OPTIONS`
- 入力検証:
  - `deckCode` 必須
  - 英数字/ハイフン以外は拒否（400）
  - 長さ上限を設定（例: 64）
- タイムアウト設定（例: 10 秒）
- エラー時は JSON で返却
- CORS:
  - 本番: `https://<PROJECT_ID>.web.app`, `https://<PROJECT_ID>.firebaseapp.com`
  - ローカル: `http://localhost:3000`

## Step 3: Hosting 設定追加（`firebase.json`）

現状 `firebase.json` は Firestore/Emulator のみ。`hosting` を追加する。

### 3.1 追加例

```json
{
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/proxy",
        "function": {
          "functionId": "proxyDeck",
          "region": "asia-northeast1",
          "pinTag": true
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

注意:

- `rewrites` は上から評価されるため、`/api/proxy` を先に置く
- SPA rewrite（`** -> /index.html`）は最後

## Step 4: フロント側 URL を本番対応に変更

対象: `src/components/Session.js`（必要に応じて `src/components/CardForm.js` も）

### 4.1 方針

- 直書き `http://localhost:3001/proxy?...` を廃止
- 環境変数 + デフォルト値で切り替え

推奨:

- `REACT_APP_DECK_PROXY_URL` を使用
- 未設定時のデフォルト:
  - development: `http://localhost:3001/proxy`
  - production: `/api/proxy`

### 4.2 呼び出し形式

- 旧: `/proxy?url=...`
- 新: `/api/proxy?deckCode=...`

## Step 5: ローカル検証（デプロイ前）

### 5.1 React ビルド確認

```bash
npm run build
```

### 5.2 Functions + Hosting emulator で統合確認

```bash
firebase emulators:start --only functions,hosting
```

別ターミナル:

```bash
curl -sS "http://127.0.0.1:5000/api/proxy?deckCode=<VALID_DECK_CODE>" | head
```

期待:

- JSON が返る
- `imageUrls` と `cardData` が空配列でない（有効 deckCode の場合）

### 5.3 画面動作確認

- `http://127.0.0.1:5000/home` を開く
- セッション作成 -> `/session` へ
- デッキコード入力 -> `デッキ情報を取得`
- エラーなくカード一覧が表示される

---

## 7. ユーザー手作業が必要な手順（GUI）

## Step 6: Blaze へアップグレード（必須）

理由:

- Functions 本番デプロイは Blaze 必須（公式仕様）

操作（Firebase Console）:

1. `https://console.firebase.google.com/` で対象プロジェクトを開く
2. 左メニューの `Usage and billing`（またはプロジェクト設定配下の請求関連）を開く
3. `Upgrade` / `Modify plan` から Blaze を選択
4. Cloud Billing アカウントをリンク

確認:

- プラン表示が `Blaze` になっている

## Step 7: 予算アラート作成（推奨）

理由:

- 小規模運用でも課金リスクを早期検知するため

操作（Google Cloud Console）:

1. `https://console.cloud.google.com/billing` を開く
2. 対象 Billing Account を選択
3. `Budgets & alerts` -> `Create budget`
4. 対象をこの Firebase プロジェクトに限定
5. しきい値を設定（推奨: 50% / 80% / 100%）
6. メール通知を有効化

---

## 8. 本番デプロイ手順

> ここから先はリモート影響あり。実行前にユーザー承認が必要。

## Step 8: デプロイ実行

```bash
npm run build
firebase deploy --only functions,hosting
```

期待される出力:

- Hosting URL が表示される
- `functions[proxyDeck] Successful create/update` のログ

## Step 9: 本番疎通確認

1. API 単体確認

```bash
curl -sS "https://<PROJECT_ID>.web.app/api/proxy?deckCode=<VALID_DECK_CODE>" | head
```

2. 画面確認

- `https://<PROJECT_ID>.web.app/home` へアクセス
- デッキ取得が成功すること
- 2ブラウザでセッション同期が従来どおり機能すること

3. Functions ログ確認

```bash
firebase functions:log --only proxyDeck --limit 50
```

---

## 9. 回帰テスト観点（最低限）

1. デッキ取得成功（正常系）
2. 無効 deckCode でエラー表示（異常系）
3. セッション保存後、プレイ画面遷移まで従来どおり
4. Firestore 既存機能（同期、ドラッグ操作）が非回帰
5. CORS エラーが出ない（本番・ローカル）

---

## 10. ロールバック手順

## 10.1 即時ロールバック（コード）

- 直前安定コミットへ戻して `firebase deploy --only functions,hosting` 再実行

## 10.2 Hosting リリースロールバック（GUI）

- Firebase Console -> Hosting -> Releases -> 安定版へ Rollback

## 10.3 影響切り分け

- Function 問題か Hosting 設定問題かを切り分けるため、
  - `https://<PROJECT_ID>.web.app/api/proxy?...` の直接疎通
  - ブラウザ console/network
  - `firebase functions:log`
  を確認

---

## 11. 実作業時の進め方（Codex運用）

実作業時は以下の順序で進める。

1. Step 1〜5（ローカル実装・ローカル検証）を Codex が実施
2. Step 6〜7（Blaze / 予算アラート）はユーザー作業
3. Step 8（本番 deploy）はユーザー承認後に Codex 実施
4. Step 9（本番検証）を共同確認
5. 問題あれば Step 10 でロールバック

---

## 12. 参考: このリポジトリでの想定差分ファイル

- `firebase.json`
- `functions/package.json`
- `functions/index.js`（または `functions/src/index.js`）
- `src/components/Session.js`
- （必要なら）`src/components/CardForm.js`
- （必要なら）`.firebaserc`（project alias 追加時）

