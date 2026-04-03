# pokemon-card-game-online

ポケモンカードゲームの盤面を、オンラインで共有しながら手動操作で対戦できる Web アプリです。

本プロジェクトは「顔見知り同士が、通話しながらカジュアルに遊ぶ」用途を前提にしています。  
そのため、システム側がルールを厳密に強制するのではなく、紙のポケカに近い見た目と直感的な操作で、盤面共有と状態復元を安定して行うことを主目的としています。

> この README は、2026-04-03 時点の実装を確認して更新しています。

## 目次
- [概要](#概要)
- [現在できること](#現在できること)
- [技術スタック](#技術スタック)
- [アーキテクチャ概要](#アーキテクチャ概要)
- [画面ルーティング一覧](#画面ルーティング一覧)
- [Firestore データ構成（概要）](#firestore-データ構成概要)
- [リポジトリ構成](#リポジトリ構成)
- [セットアップローカル開発](#セットアップローカル開発)
- [デプロイ構成](#デプロイ構成)
- [開発ルール](#開発ルール)
- [既知の制約](#既知の制約)
- [References](#references)

## 概要

このアプリで扱うのは「自動処理されるポケカ」ではなく、「プレイヤーが自分で動かすポケカ」です。

- デッキコードから公式デッキページを参照し、カード画像と枚数を取り込む
- Firestore に対戦状態を保存し、同じ URL から盤面を復元する
- 盤面上で、山札・手札・バトル場・ベンチ・サイド・トラッシュ・ロスト・公開エリア・スタジアム・ダメカン・状態異常を手動操作する
- 相手の秘匿領域に触る操作は、承認リクエストを挟んで扱う

UI/UX 方針:

- 紙版ポケカに慣れた人が直感的に使えることを最優先にする
- 可能な限り、ドラッグ&ドロップ・クリック・展開モーダルで操作する
- cardId 手入力のような開発者都合の操作を、プレイヤー必須導線にしない
- 通知は右上ポップアップに集約し、通常メッセージは緑系、拒否・失敗系は赤系で統一する

スコープ外:

- カード文言を解釈して自動でダメージ計算するルールエンジン
- ターン制約やサポート使用回数などの厳密な自動ジャッジ
- 不正防止を目的とした完全なサーバー裁定

## 現在できること

### セッション開始前

- `/` でホーム画面を表示できる
- 初期サイド枚数を 3〜6 枚で選択してセッションを開始できる
- `/join` から既存セッションへ参加できる
- 開始前画面は共通のプリプレイシェルを使い、背景に流れるカード演出を表示する

### デッキ準備

- デッキコードを入力して、公式デッキページからカード画像 URL と枚数を取得できる
- 開発時はローカル Express プロキシ、本番では Firebase Hosting + Cloud Functions 経由で取得する
- 取り込んだ 60 枚デッキをモーダル内で一覧表示できる
- 各カードはホバーで拡大表示できる
- 「このデッキを使う」で、手札 7 枚と初期サイドを含むセッション状態を作成できる

### 対戦盤面

- プレイヤー 2 人の盤面を Firestore `onSnapshot` でリアルタイム同期できる
- 盤面は以下のゾーンを持つ
  - 山札
  - 手札
  - バトル場
  - ベンチ
  - サイド
  - トラッシュ
  - ロスト
  - 公開エリア
  - スタジアム
  - コイン
- プレイマット中央にポケモンカード風のモンスターボールマークを表示する
- 相手側の手札枚数・山札枚数・サイド枚数などを常時表示できる
- 相手側の山札 / トラッシュ / ロスト / サイド / 手札枚数変化に視覚フィードバックを入れている

### 対戦開始フロー

- 盤面中央に `対戦スタート！` ボタンを表示する
- 両プレイヤーが開始準備を完了するまで、相手のバトル場 / ベンチは裏向き表示にする
- 両者が開始すると、相手側の初期配置カードを表向きに反転表示する
- 自分だけ開始済みの場合は `相手の開始準備を待っています・・・` を表示する

### 盤面操作

- 手札を下部のフローティングトレイとして表示できる
- 手札トレイは開閉でき、位置もドラッグで変更できる
- 小道具 BOX を右下に表示し、開閉できる
- ダメカン `10 / 50 / 100` と状態異常バッジをドラッグできる
- カードはゾーン間ドラッグ&ドロップで移動できる
- バトル場 / ベンチの複数カードスタックをまとめてドラッグできる
- スタック単位で以下が可能
  - 別のバトル場 / ベンチとのスワップ
  - トラッシュ / ロストへのまとめ移動
  - 山札の上 / 下へのまとめ移動
- 山札・トラッシュ・ロスト・ベンチ・バトル場・公開エリア・スタジアムのカードは、必要な箇所でホバー拡大できる
- トラッシュ / ロスト / バトル場 / ベンチ（複数枚時）はクリックで展開モーダルを開ける
- 展開モーダルはドラッグ移動でき、カード拡大表示も画面内に収まるよう補正される
- バトル場 / ベンチはダブルクリックでダメージ / 状態異常調整ポップオーバーを開ける
- 山札はクリックで閲覧枚数選択モーダルを開ける
- 山札閲覧モーダルでは「もう一枚閲覧」ができる
- 手札内ではカードのホバー拡大ができ、全てトラッシュ / 全て山札に戻す操作も可能

### 相手承認付き操作

- 相手手札の公開要求
- 相手手札からのランダム破壊要求
- 相手手札公開後の選択破壊要求
- 相手山札の公開要求
- 承認 / 拒否は中央ブロッキングモーダルで処理する
- 結果は右上通知で確認できる

### ガイド / 補助 UI

- 左上の設定アイコンから、以下の表示 ON/OFF を切り替えられる
  - 操作ヒント
  - バトルのはじめかた
  - ターンの流れ
  - 状態異常の効果
- `バトルのはじめかた` / `ターンの流れ` / `状態異常の効果` はドラッグ移動と位置リセットに対応している
- 共有メモ欄を使ってプレイヤー同士でテキスト共有できる

## 技術スタック

### フロントエンド

- React `18`
- Create React App (`react-scripts@5`)
- React Router DOM `6`
- CSS Modules + 通常 CSS
- Bootstrap `5`
- React Bootstrap
- Font Awesome
- DnD Kit (`@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/utilities`)

### BaaS / インフラ

- Firebase Authentication
  - 匿名認証
- Firestore
  - 対戦セッション
  - プレイヤーごとの秘匿状態
  - プロキシ停止制御ドキュメント
- Firebase Hosting
  - SPA 配信
  - `/api/proxy` を Cloud Functions に rewrite
- Firebase Cloud Functions v2
  - `proxyDeck`: 公式デッキページ取得プロキシ
  - `budgetGuard`: 予算超過時のプロキシ停止

### 開発用ローカルプロキシ

- Node.js
- Express
- Axios
- Cheerio
- CORS

### テスト

- Jest
- React Testing Library
- Firebase Rules Unit Testing
- Node built-in test runner（Firestore Rules テスト）

### 実行環境

- Node.js `20` 系

## アーキテクチャ概要

### 開発時

```text
Browser (React @ :3000)
  ├─ Firestore / Firebase Auth
  └─ Local Proxy (Express @ :3001)
       └─ pokemon-card.com/deck/confirm.html
```

### 本番時

```text
Browser
  ├─ Firebase Hosting
  ├─ Firestore / Firebase Auth
  └─ /api/proxy
       └─ Firebase Functions v2 (proxyDeck)
            └─ pokemon-card.com/deck/confirm.html
```

### 状態の持ち方

- 公開盤面は `sessions/{sessionId}` に保存
- プレイヤー固有の秘匿情報は `sessions/{sessionId}/privateState/{playerId}` に保存
- そのため、同じ URL に再アクセスすると盤面復元できる

## 画面ルーティング一覧

| URL | 実装 | 用途 |
|---|---|---|
| `/` | `src/components/Home.js` | ホーム画面、初期サイド枚数設定、セッション開始 |
| `/home` | `Navigate` | `/` へのリダイレクト |
| `/join` | `src/components/Join.js` | セッション ID を入力して参加 |
| `/session?id=...&playerId=...` | `src/components/Session.js` | デッキ準備、対戦盤面表示 |
| `/test/pokemon` | `src/components/PokemonTest.js` | カード表示確認 |
| `/test/update-gamedata` | `src/components/UpdateGameDataTest.js` | JSON 反映テスト |
| `/test/playing-field` | `src/components/PlayingFieldTest.js` | 盤面表示テスト |

## Firestore データ構成（概要）

主要コレクション:

- `sessions`
- `sessions/{sessionId}/privateState/{playerId}`
- `system/control_proxy`

### `sessions/{sessionId}`

- セッション全体の公開状態
- 参加者情報
- revision / updatedAt / updatedBy
- 公開盤面
  - バトル場
  - ベンチ
  - 公開エリア
  - トラッシュ
  - ロスト
  - サイド
  - スタジアム
- カウンタ
  - 山札枚数
  - 手札枚数
- 承認リクエスト配列 `publicState.operationRequests`
- 対戦開始準備状態

### `sessions/{sessionId}/privateState/{playerId}`

- プレイヤー本人だけが持つ秘匿状態
- 山札
- 手札
- 山札閲覧中領域
- `cardCatalog`
- UI 設定
  - 手札トレイ開閉
  - 小道具 BOX 開閉

### `system/control_proxy`

- Cloud Functions 側のプロキシ有効 / 無効フラグ
- 予算ガードが停止したかどうか
- 最終通知情報

## リポジトリ構成

- `src/`
  - `components/`: 画面・UI
  - `interaction/dnd/`: DnD payload / intent / mutation
  - `game-state/`: Firestore スキーマ、builder、transaction
  - `operations/wave1/`: 承認付き操作の intent / mutation
  - `css/`: スタイル
  - `utils/`: 背景演出などの補助関数
- `public/`
  - カード裏面、コイン画像、サンプルデータなど
- `functions/`
  - Firebase Functions v2
- `proxy-server.js`
  - ローカル開発用 Express プロキシ
- `scripts/firestore/`
  - V1 -> V2 移行 / 検証 CLI
- `references/`
  - 要件定義、ロードマップ、実装手順書、実装ログ

補足:

- `src/components/operation/OperationPanel.js` はリポジトリ内に残っていますが、現行の主要 UI 導線では使っていません。現在の方針は GUI 中心です。

## セットアップ（ローカル開発）

### 前提

- Node.js `20` 系
- npm
- Firebase プロジェクトへアクセス可能
- 匿名認証を有効化済み

### 1. 依存インストール

```bash
npm ci
cd functions && npm ci
```

### 2. ローカルプロキシ起動

別ターミナルで実行:

```bash
node proxy-server.js
```

デフォルトでは開発時のデッキ取得先は `http://localhost:3001/proxy` です。

### 3. フロント起動

別ターミナルで実行:

```bash
npm start
```

### 4. Emulator を使う場合

```bash
firebase emulators:start --only auth,firestore
REACT_APP_USE_FIREBASE_EMULATORS=true npm start
```

### 5. 動作確認

1. `http://localhost:3000/` を開く
2. `セッションを開始` でセッションを作る
3. デッキコードを入力して `デッキ情報を取得`
4. `このデッキを使う`
5. 別ブラウザか別端末で `/join` から同じセッションへ参加する

### テスト

```bash
CI=true npm test -- --watch=false
npm run build
firebase emulators:exec --only auth,firestore --project demo-pokemon-card-game-online "npm run test:rules"
```

### よくあるトラブル

- `Missing or insufficient permissions`
  - Firestore Rules
  - 匿名認証
  - `participants.player1 / player2` の占有状態
  を確認する
- `npm ci` の `ENOTEMPTY ... node_modules/.cache/babel-loader`
  - `npm start` やテスト実行中プロセスを止めてから再実行する
- `デッキ情報の取得に失敗しました。`
  - 開発時は `proxy-server.js` が起動しているか確認する

## デプロイ構成

本番は Firebase 内で完結する構成です。

- Hosting
  - フロント配信
- Functions
  - `/api/proxy` を `proxyDeck` に rewrite
- Firestore / Auth
  - セッション状態と認証
- Budget Guard
  - Pub/Sub 通知を受けて、閾値超過時にプロキシを自動停止可能

開発時のみ、ローカル Express プロキシも利用します。

## 開発ルール

### Git 運用

- `main` への直接 push はしない
- 基本フロー:
  1. 作業ブランチ作成
  2. 変更
  3. コミット
  4. push
  5. PR
  6. merge

### `references` 配下ドキュメント命名規則

- `references/documents/` の新規ドキュメント名は `yymmdd_n_...` 形式にする
- 例: `260218_3_db_session_requirements_spec.md`

### 秘匿情報

- `.env*`
- 秘密鍵
- サービスアカウント JSON
- アクセストークン

これらはコミットしないこと。

詳細な運用ルールは `AGENTS.md` を参照してください。

## 既知の制約

- ルールの厳密な自動強制は行っていない
- プレイヤー同士がルールを理解して手動操作する前提
- スマホ最適化はまだ本格対応前で、現状は PC 優先
- `CardForm.js` など、一部に現行導線では使っていない旧実装 / 検証用コードが残っている
- Create React App ベースのため、将来的にはビルド基盤の刷新余地がある

## References

- `references/documents/260218_3_db_session_requirements_spec.md`
- `references/documents/260218_4_full_implementation_roadmap.md`
- `references/documents/260220_1_notes_on_how_each_operation_should_be_implemented.md`
- `references/documents/260222_2_free_deployment_hosting_options_analysis.md`
