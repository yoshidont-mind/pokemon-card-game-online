# pokemon-card-game-online

ポケモンカードゲームの対戦を、オンラインでシミュレーションするためのWebアプリです。  
デッキコードから公式デッキページを参照してカード画像を取得し、2人対戦の盤面をリアルタイムで共有することを目指しています。

> この README は、2026-02-18 時点でリポジトリ内コードを確認して書いています。  
> 将来構想と現行実装を混同しないため、未実装の項目は明示しています。

## 目次
- [概要](#概要)
- [技術スタック](#技術スタック)
- [アーキテクチャ概要](#アーキテクチャ概要)
- [画面ルーティング一覧](#画面ルーティング一覧)
- [ローカルAPI（プロキシ）一覧](#ローカルapiプロキシ一覧)
- [Firestore データモデル](#firestore-データモデル)
- [リポジトリ構成](#リポジトリ構成)
- [セットアップ（ローカル開発）](#セットアップローカル開発)
- [開発ルール（AI駆動開発の土台）](#開発ルールai駆動開発の土台)
- [Coding Convention（現行実装ベース）](#coding-convention現行実装ベース)
- [既知の課題 / TODO](#既知の課題--todo)
- [References](#references)

---

## 概要

### 現在できること（実装済み）
- Firestore 上に対戦セッションを作成し、参加できる
- デッキコードを入力し、`https://www.pokemon-card.com/deck/confirm.html/deckID/[deckCode]` からカード画像URLを抽出できる
- 抽出したカードをデッキとして保存し、盤面画面へ遷移できる
- 盤面情報を Firestore の `onSnapshot` でリアルタイム同期できる
- テスト用画面で `public/sample_gamedata.json` をセッションに反映できる

### 盤面UI（Phase 03 時点）
- 盤面レイアウトを「上: 相手領域 / 中央: スタジアム / 下: 自分領域」の紙プレイ寄せ構成に更新
- 主要ゾーンに `data-zone` / `data-drop-group` を付与（Phase 04 の DnD 実装準備）
- 手札エリアを浮遊トレイ化し、トグルで最小化/展開できる
- 小道具BOX（ダメカン/状態異常）を右下ドッキングの折りたたみUIで追加
- 裏向きカード画像は `card-back.jpg` に統一

### これから実現したいこと（要件）
- ポケカ対戦に必要な手動操作を画面上で再現する
  - 例: ドロー、シャッフル、トラッシュ、場に出す、ダメカン配置、重ねる
- 2人対戦時の操作競合を破綻なく扱う
- 将来的にスマホ対応（現状はPC優先）

### 実現しなくてよいこと（現時点）
- カード文言を解釈して処理を自動化するルールエンジン
  - 例: 技選択に応じた自動ダメカン計算、きぜつ時の自動トラッシュ
- ルール遵守をシステム側で厳密に強制する仕組み
  - 例: ターン管理の強制、与ダメージ妥当性チェック、サポート使用回数制限の自動検証

### 運用前提（重要）
- 本サイトは「オンラインで」「友人等の顔見知り同士が」「別途通話等で会話可能な状況」で遊ぶためのカジュアル対戦ツール
- プレイヤー双方がポケカのルールに則って手動操作する前提
- 本アプリは盤面共有・状態再現に主眼を置き、ジャッジ相当の厳密な不正防止はスコープ外

---

## 技術スタック

フロントエンド:
- React `^18.3.1`（Create React App）
- React Router DOM `^6.23.1`
- Bootstrap `^5.3.3` / React Bootstrap `^2.10.2`

ローカルAPI（スクレイピング補助）:
- Express `^4.19.2`
- Axios `^1.7.2`
- Cheerio `^1.0.0-rc.12`
- CORS `^2.8.5`

データストア:
- Firebase Firestore / Firebase Auth（Web SDK `firebase ^12.9.0`）

テスト:
- Jest + React Testing Library（CRA標準）

---

## アーキテクチャ概要

### 実行形態（ローカル）
- フロント: `npm start`（`http://localhost:3000`）
- プロキシ: `node proxy-server.js`（`http://localhost:3001`）
- DB: Firestore（クラウド）

### データフロー
```text
Browser (React)
  ├─ Firestore: セッション作成・更新・購読
  └─ Local Proxy (Express, :3001)
        └─ pokemon-card.com の deck/confirm を取得・解析
```

### 主要フロー
1. セッション作成 (`/home`)
- `Home` が V2 スキーマの `sessions/{sessionId}` と `privateState/{playerId}` を初期化し、`/session?id=...&playerId=1` へ遷移

2. デッキ取り込み (`/session`)
- 入力したデッキコードでプロキシAPIを呼び、カード画像URLを取得
- `cardId` を払い出して `privateState/{playerId}` の `cardCatalog` / `zones.deck` / `zones.hand` に保存
- `sessions/{sessionId}.publicState.players.{playerId}.counters` を同期更新

3. 盤面同期 (`/session` -> `PlayingField`)
- `sessions/{sessionId}`（公開情報）と `privateState/{playerId}`（自分の秘匿情報）を購読して描画

---

## 画面ルーティング一覧

`src/App.js` ベースで整理:

| URL | 実装 | 用途 |
|---|---|---|
| `/home` | `src/components/Home.js` | セッション作成・参加導線 |
| `/join` | `src/components/Join.js` | セッションID入力で参加 |
| `/session?id=...&playerId=...` | `src/components/Session.js` | デッキコード入力・取り込み・保存・盤面遷移 |
| `/test/pokemon` | `src/components/PokemonTest.js` | ポケモン表示コンポーネントの見た目確認 |
| `/test/update-gamedata` | `src/components/UpdateGameDataTest.js` | JSONをセッションへ反映するテスト |
| `/test/playing-field` | `src/components/PlayingFieldTest.js` | テスト用プレースホルダ画面 |

注意:
- `src/App.js` に `/` ルートは定義されていないため、開発時は `http://localhost:3000/home` を直接開く

---

## ローカルAPI（プロキシ）一覧

`proxy-server.js`:

- `GET /proxy?url=<targetUrl>`
  - 取得したHTMLの `script` と `hidden input` を解析
  - 返却:
    - `imageUrls: string[]`
    - `cardData: { id: string, count: number }[]`
  - `url` 未指定時は `400`

想定呼び出し:
- `http://localhost:3001/proxy?url=https://www.pokemon-card.com/deck/confirm.html/deckID/<deckCode>`

---

## Firestore データモデル

主要コレクション:
- `sessions`
- `sessions/{sessionId}/privateState/{playerId}`

`sessions/{sessionId}` の基本形（V2）:

```json
{
  "version": 2,
  "status": "waiting",
  "createdAt": "2026-02-18T00:00:00.000Z",
  "createdBy": "player1",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "updatedBy": "player1",
  "revision": 0,
  "participants": {
    "player1": {
      "uid": null,
      "displayName": null,
      "joinedAt": null,
      "lastSeenAt": null,
      "connectionState": "unknown"
    },
    "player2": {
      "uid": null,
      "displayName": null,
      "joinedAt": null,
      "lastSeenAt": null,
      "connectionState": "unknown"
    }
  },
  "publicState": {
    "turnContext": {
      "turnNumber": null,
      "currentPlayer": null
    },
    "players": {
      "player1": {
        "board": {
          "active": null,
          "bench": [],
          "discard": [],
          "lostZone": [],
          "prize": [],
          "markers": []
        },
        "counters": {
          "deckCount": 0,
          "handCount": 0
        }
      },
      "player2": {
        "board": {
          "active": null,
          "bench": [],
          "discard": [],
          "lostZone": [],
          "prize": [],
          "markers": []
        },
        "counters": {
          "deckCount": 0,
          "handCount": 0
        }
      }
    },
    "stadium": null
  }
}
```

`sessions/{sessionId}/privateState/{playerId}` の基本形:

```json
{
  "ownerPlayerId": "player1",
  "updatedAt": "2026-02-18T00:00:00.000Z",
  "updatedBy": "player1",
  "revision": 0,
  "zones": {
    "deck": [],
    "hand": []
  },
  "cardCatalog": {},
  "initialDeckCardIds": []
}
```

補足:
- 旧V1セッション（`player1/player2` 直下構造）は `compatRead` + `migrateV1ToV2` で読み取り互換対応
- 移行CLI:
  - `npm run migrate:sessions:v2 -- --project <projectId> --dry-run`
  - `npm run migrate:sessions:v2 -- --project <projectId> --write --limit 10`
  - `npm run verify:sessions:v2 -- --project <projectId>`

---

## リポジトリ構成

主要ディレクトリ/ファイル:

- `src/`
  - `components/`: 画面・UIコンポーネント
  - `css/`: 盤面やカード表示のスタイル
  - `firebase.js`: Firebase初期化
  - `game-state/`: V2スキーマ・ビルダー・移行・Invariant
- `scripts/firestore/`: V1→V2移行CLI / V2検証CLI
- `public/`
  - `sample_gamedata.json`: 盤面テスト用データ
- `proxy-server.js`: デッキページ解析用のローカルプロキシ
- `references/documents/`: 設計メモ・運用ドキュメント置き場

---

## セットアップ（ローカル開発）

### 前提
- Node.js 20系（`.nvmrc` は `20.19.6`）
- npm 10系
- Firestore へアクセス可能な Firebase プロジェクト設定

### 1. 依存インストール
```bash
npm ci
```

### 2. プロキシ起動（ターミナル1）
```bash
node proxy-server.js
```

### 3. フロント起動（ターミナル2）
```bash
npm start
```

Auth/Firestore Emulator を使う場合:
```bash
REACT_APP_USE_FIREBASE_EMULATORS=true npm start
firebase emulators:start --only auth,firestore --project demo-pokemon-card-game-online
```

### 4. 動作確認
1. `http://localhost:3000/home` を開く
2. 「セッションを作成」
3. デッキコードを入力して「デッキ情報を取得」
4. 「このデッキを保存」

### トラブルシュート
- `Missing or insufficient permissions`
  - Firestore Rules / 参加者slot（`participants.player1|player2.uid`）を確認
  - Firebase Authentication の Anonymous provider が有効化されているか確認
- `npm ci` の `ENOTEMPTY ... node_modules/.cache/babel-loader`
  - `npm start` が動作中のことが多い。先に停止して再実行

### テスト
```bash
CI=true npm test -- --watch=false
npm run build
firebase emulators:exec --only auth,firestore --project demo-pokemon-card-game-online "npm run test:rules"
```

---

## 開発ルール（AI駆動開発の土台）

### Git運用（main直push禁止）
- `main` への直接 push は禁止
- 必ず:
1. 作業ブランチ作成
2. 変更・コミット
3. push
4. PR 作成
5. レビュー後に merge

### `references` 配下ドキュメントの命名規則
- `references/documents/` に追加するファイル名は、先頭を必ず `yymmdd_n_` 形式にする
  - `yymmdd`: 作成年月日（例: `260218`）
  - `n`: その日の連番（`1`, `2`, `3`, ...）
  - 例: `260218_3_realtime_state_design.md`

### 秘匿情報の扱い
- `.env*`、秘密鍵、トークン、サービスアカウントJSONはコミットしない
- チャットや議事録にも平文で貼らない

詳細なガードレールは `AGENTS.md` を参照。

---

## Coding Convention（現行実装ベース）

- 関数コンポーネント + Hooks ベース（Class Componentなし）
- 盤面状態は Firestore ドキュメントを中心に同期
- CSS は `src/css/*` と module CSS の併用
- コンポーネント名は PascalCase、ルートは React Router で定義

---

## 既知の課題 / TODO

- `PlayingField` の操作ボタンはUI中心で、実際の状態更新ロジックは未実装箇所が多い
- `PlayingFieldTest.js` はサンプルデータ固定の表示確認用途で、実対戦フロー結合テストではない
- `CardForm.js` は `GET /card/:number` を呼ぶが、`proxy-server.js` 側に該当APIがない
- `App.test.js` はスモークテストのみで、ルーティング/操作の実運用テストは未整備
- スマホ最適化は未着手（現状PC優先）

---

## References

- `references/documents/260218_3_db_session_requirements_spec.md`
- `references/documents/260218_4_full_implementation_roadmap.md`
