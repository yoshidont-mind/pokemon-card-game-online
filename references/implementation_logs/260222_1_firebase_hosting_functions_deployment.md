# 実装ログ: Firebase Hosting + Functions（プロキシ同時公開）

作成日: 2026-02-22（JST）

> ルール:
> - 秘匿情報は記載しない（必要箇所は `<REDACTED>`）。
> - ターミナル出力は本ファイル内に直接記録する。

## 進捗サマリ（随時更新）

- [x] 実装手順書の作成
- [x] 事前チェック（Node / npm / Firebase CLI / git状態）
- [ ] Firebaseプロジェクト紐付け確認（`firebase use`）
- [ ] Functions 初期化
- [ ] プロキシ関数実装
- [ ] `firebase.json` hosting rewrites 追加
- [ ] フロントの `localhost:3001` 依存除去
- [ ] ローカル統合検証（functions + hosting emulator）
- [ ] （ユーザー作業）Blaze有効化
- [ ] 本番デプロイ
- [ ] 本番疎通確認

## 作業ログ

### 2026-02-22（JST）

#### 1) 事前チェック

- 手順書フォーマット参考資料を確認
  - `references/temporary/260218_2_implementation_log_from_another_project.md`
- 現在の作業状態を確認
  - `git status`
  - Node/npm/Firebase CLI バージョン
  - Firebaseログイン状態 / プロジェクト一覧

##### 実行コマンド/出力

```bash
$ date '+%Y-%m-%d %H:%M:%S %Z'
2026-02-22 16:30:31 JST

$ git status --short
?? references/documents/260222_1_deployment_and_hosting_options_research.md
?? references/documents/260222_2_free_deployment_hosting_options_analysis.md
?? references/implementation_logs/260222_1_firebase_hosting_functions_deployment.md
?? references/implementation_plans/260222_1_firebase_hosting_functions_deployment.md

$ node -v
v24.8.0

$ npm -v
11.6.0

$ firebase --version
13.30.0

$ firebase login:list
Logged in as yoshidon.com@gmail.com

$ firebase projects:list
- Preparing the list of your Firebase projects
✖ Preparing the list of your Firebase projects

Error: Failed to list Firebase projects. See firebase-debug.log for more info.
```

#### 2) エラー切り分け（Firebase認証）

- `firebase-debug.log` を確認
- 401 / token refresh失敗を確認
- 既知の projectId（`pokemon-card-game-online-80212`）で `firebase use` 実行を試したが失敗

##### 実行コマンド/出力

```bash
$ tail -n 80 firebase-debug.log
...
[debug] >>> [apiv2][query] POST https://www.googleapis.com/oauth2/v3/token [none]
...
[debug] <<< [apiv2][status] POST https://www.googleapis.com/oauth2/v3/token 400
...
[debug] Request to https://firebase.googleapis.com/v1beta1/projects?pageSize=1000 had HTTP Error: 401, Request had invalid authentication credentials.
...
[error] Error: Failed to list Firebase projects. See firebase-debug.log for more info.

$ firebase use pokemon-card-game-online-80212
Error: Invalid project selection, please verify project pokemon-card-game-online-80212 exists and you have access.
```

#### 3) 現在の結論（ブロッカー）

- **Firebase CLI の認証トークンが無効化されており、対象プロジェクトへのアクセス確認ができない状態**。
- この状態では `firebase init functions` / `firebase deploy` を安全に進められないため、ここで中断。

#### 4) ユーザー依頼（次アクション）

- ユーザー側で Firebase CLI 認証の再実行が必要。
- 依頼予定コマンド:

```bash
firebase logout
firebase login --reauth
firebase projects:list
```

- その後、一覧に `pokemon-card-game-online-80212` が表示されることを確認して再開する。


#### 5) 認証復旧後の再開（ユーザー作業完了）

- ユーザー側で以下を実施済み（共有済み出力を確認）
  - `firebase logout`
  - `firebase login --reauth`
  - `firebase projects:list`
- `pokemon-card-game-online-80212` が一覧に表示されることを確認。

#### 6) Project紐付け + Functions初期化（Step 1）

- `firebase use pokemon-card-game-online-80212` を実行
- `firebase init functions` を対話で実行
  - 言語: JavaScript
  - ESLint: No
  - npm install: Yes

##### 実行コマンド/出力（抜粋）

```bash
$ firebase use pokemon-card-game-online-80212
Now using project pokemon-card-game-online-80212

$ firebase init functions
=== Project Setup
i  Using project pokemon-card-game-online-80212 (pokemon-card-game-online)

=== Functions Setup
? What language would you like to use to write Cloud Functions? JavaScript
? Do you want to use ESLint to catch probable bugs and enforce style? No
? Do you want to install dependencies with npm now? Yes

npm warn EBADENGINE Unsupported engine {
  package: undefined,
  required: { node: '22' },
  current: { node: 'v24.8.0', npm: '11.6.0' }
}
...
added 544 packages, and audited 545 packages in 2m
...
i  Writing configuration info to firebase.json...
i  Writing project information to .firebaserc...

✔  Firebase initialization complete!
```

##### 生成/更新ファイル

- 生成: `.firebaserc`
- 更新: `firebase.json`（`functions` 設定追加）
- 生成: `functions/` 一式
  - `functions/index.js`
  - `functions/package.json`（`engines.node: "22"`）
  - `functions/package-lock.json`
  - `functions/node_modules`

#### 7) 現在の論点（実装選択肢）

- `functions/package.json` の Node runtime が CLI 初期値で `22` になった。
- ルート `package.json` は `>=20 <21` を要求しているため、Functions runtime を `20` に揃えるか、`22` を維持するかの判断が必要。
- ここで一旦中断し、ユーザー意思決定を待つ。


#### 8) 実装（Step 2〜4）

実施内容:

- Functions runtime を `node: 20` に統一（ユーザー意思決定 #1）
- Functions 依存追加: `axios`, `cheerio`
- `functions/index.js` に `proxyDeck` HTTP Function を実装
  - `GET / OPTIONS` 対応
  - `deckCode` バリデーション
  - 取得先URL固定（Open Proxy回避）
  - 既存互換レスポンス `{ imageUrls, cardData }`
  - `region: asia-northeast1`
- `firebase.json` に Hosting 設定を追加
  - `public: build`
  - `rewrites`
    - `/api/proxy` -> `functionId: proxyDeck`
    - `**` -> `/index.html`（SPA）
- フロント切替
  - `src/components/Session.js` の `localhost:3001/proxy?...` を廃止
  - `buildDeckProxyUrl(deckCode)` 経由で `deckCode` クエリを送信
  - 環境未設定時のデフォルト:
    - development: `http://localhost:3001/proxy`
    - production: `/api/proxy`
- 互換のため `proxy-server.js` も `deckCode` パラメータ対応に更新

##### 実行コマンド/出力（抜粋）

```bash
$ cd functions && npm pkg set engines.node='20' && npm install axios cheerio
npm warn EBADENGINE Unsupported engine {
  required: { node: '20' },
  current: { node: 'v24.8.0', npm: '11.6.0' }
}
...
added 27 packages, removed 26 packages, and audited 546 packages in 9s
```

#### 9) ローカル検証（Step 5）

##### 9-1. フロントビルド

```bash
$ npm run build
> react-scripts build
Creating an optimized production build...
Compiled with warnings.
[eslint]
src/components/PlayingField.js
  Line 3112:51 ... react-hooks/exhaustive-deps
...
The build folder is ready to be deployed.
```

補足:
- 既知の CRA/Browserslist 警告、既存 ESLint 警告（`PlayingField.js`）は今回差分外。
- ビルドは成功。

##### 9-2. Functions + Hosting Emulator 統合検証

```bash
$ firebase emulators:start --only functions,hosting
i  emulators: Starting emulators: functions, hosting
⚠  hosting: Hosting Emulator unable to start on port 5000, starting on 5002 instead.
...
✔  All emulators ready!
Functions: 127.0.0.1:5001
Hosting:   127.0.0.1:5002
```

疎通確認:

```bash
$ curl -sS "http://127.0.0.1:5002/api/proxy?deckCode=2MSM3y-wJdQnX-pR2pyX" | jq '{imageUrls: (.imageUrls|length), cardData: (.cardData|length)}'
{
  "imageUrls": 15,
  "cardData": 15
}

$ curl -i -sS "http://127.0.0.1:5002/api/proxy?deckCode=INVALID!" | sed -n '1,20p'
HTTP/1.1 400 Bad Request
...
{"error":"Invalid deckCode format"}
```

Emulatorログ（抜粋）:

```bash
[hosting] Rewriting /api/proxy?... to .../proxyDeck
i  functions: Beginning execution of "asia-northeast1-proxyDeck"
i  functions: Finished "asia-northeast1-proxyDeck" ...
```

結果:
- Hosting rewrite -> Function 呼び出し成功
- 正常系 deckCode でデータ取得成功
- 異常系 deckCode で 400 応答確認

##### 9-3. 補足失敗ログ（ローカル proxy の既存プロセス競合）

```bash
$ node proxy-server.js
Error: listen EADDRINUSE: address already in use :::3001
```

- 既存で 3001 を占有している別プロセスがあり、新規起動は失敗。
- ただし本タスク主目的の Functions/Hosting 経路検証には影響なし。

#### 10) 現在の状態

- ローカル実装 + ローカル統合検証は完了。
- 次は本番反映前のユーザー手作業ステップ（Blaze有効化）へ進む。


#### 11) （ユーザー作業）Blaze有効化

- ユーザー報告により完了確認。
- これを受けて本番 deploy 実行へ進行。

#### 12) 本番デプロイ実行（Step 8）

実施内容:

- `firebase deploy --only functions,hosting` を実行
- Functions / Hosting 同時反映

##### 実行コマンド/出力（抜粋）

```bash
$ firebase deploy --only functions,hosting

i  hosting: The following function(s) are pinned to site pokemon-card-game-online-80212 and will be deployed as well: proxyDeck

=== Deploying to 'pokemon-card-game-online-80212'...

i  deploying functions, hosting
...
✔  functions[proxyDeck(asia-northeast1)] Successful create operation.
Function URL (proxyDeck(asia-northeast1)): https://asia-northeast1-pokemon-card-game-online-80212.cloudfunctions.net/proxyDeck
...
✔  hosting[pokemon-card-game-online-80212]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/pokemon-card-game-online-80212/overview
Hosting URL: https://pokemon-card-game-online-80212.web.app
```

デプロイ時の注意メッセージ（要記録）:

- Node.js 20 ランタイムは将来 deprecation 予定（CLI警告表示）
- `firebase-functions` バージョン更新推奨の警告
- build image cleanup 警告（小額課金リスク）

```bash
⚠  functions: Unhandled error cleaning up build images. This could result in a small monthly bill if not corrected.
```

#### 13) 本番疎通確認（Step 9）

##### 13-1. API正常系

```bash
$ curl -sS "https://pokemon-card-game-online-80212.web.app/api/proxy?deckCode=2MSM3y-wJdQnX-pR2pyX" | jq '{imageUrls: (.imageUrls|length), cardData: (.cardData|length)}'
{
  "imageUrls": 15,
  "cardData": 15
}
```

##### 13-2. API異常系

```bash
$ curl -i -sS "https://pokemon-card-game-online-80212.web.app/api/proxy?deckCode=INVALID!" | sed -n '1,20p'
HTTP/2 400
...
{"error":"Invalid deckCode format"}
```

##### 13-3. Hostingルート疎通

```bash
$ curl -I -sS https://pokemon-card-game-online-80212.web.app/home | sed -n '1,20p'
HTTP/2 200
...
```

##### 13-4. Functionsログ確認

```bash
$ firebase functions:log --only proxyDeck --lines 20
...
I proxydeck: Starting new instance. Reason: DEPLOYMENT_ROLLOUT
...
```

結果:

- 本番 Hosting URL 応答: OK
- `/api/proxy` 正常系/異常系: OK
- Functions デプロイ/起動ログ: OK

#### 14) 現在の状態

- Codex側で実施可能な作業（実装 + デプロイ + API疎通確認）は完了。
- 次はユーザーのブラウザでE2E確認（デッキ取得 -> このデッキを使う -> プレイ画面遷移）を依頼する。

