# デプロイ前テスト自動化（Playwright / Tier0・Tier1・Tier2 / 差分→実行タグ設計）手順書（設計案）

作成日: 2026-02-09（JST）  
最終更新: 2026-02-12（JST）  
ステータス: **実装完了**（`260209_2_pre_deploy_test_automation.md` の計画内容は反映済み）  
対象:
- `yamacomi`（Next.js + Express / 本体）
- AWS（デプロイ先: EB、将来: ステージングをデプロイ時のみ作成してE2E）
- GitHub Actions（CIで必須化）
- 外部サービス（Cognito / reCAPTCHA / Mailtrap）

このドキュメントの目的（最終到達状態）:
- 本番反映前に、**ステージング（デプロイ時だけ作成）へ候補版をデプロイし、E2Eテストを必ず通す**ことで可用性事故を予防する
- E2Eテストは **Tier0（3分以内） / Tier1（15分以内） / Tier2（3時間以内）** に分割し、実行時間と網羅性の両立を図る
- 変更差分に応じて、Tier1（機能回帰）を **必要十分だけ追加実行**できる（paths filter → タグ）

> 重要: ここでの「テスト」は、主に **本番と同じURLにアクセスするブラウザE2E**（Playwright）を指します。  
> APIユニットテスト等も有効ですが、本タスクの主眼は「デプロイ前に“サイトが普通に使える”ことを自動で保証する」ことです。

---

## 重要（秘匿情報・個人情報の取り扱い）

- 認証情報（CognitoテストユーザーのID/パスワード、Mailtrap API token、reCAPTCHA secret、Discord Webhookなど）は **コミット禁止**。
- CIに必要なシークレットは原則 **AWS Secrets Manager** または **GitHub Actions Secrets** で管理する（手順書に値のコピペを残さない）。
- テスト実行ログに、個人メールアドレスやアクセストークン等を貼らない（必要なら `<REDACTED>` で伏せる）。

---

## 0. この会話で確定した意思決定（前提）

> 途中でブレないようにここで固定します。

- ステージング環境: **B) デプロイ時だけ作成してテスト後に削除**
- `/contact` のメール検証: **Mailtrap（テスト受信箱）**
- reCAPTCHA: **テストキー**（必要なら「本番で絶対ONにならない」ガード付きで検証バイパスも検討可）
- テストデータ: ステージングDBに **固定のテスト用product/variant** を用意する

---

## 1. まず理解する（非エンジニア向け超要約）

- Tier0（3分）は「サイトが壊れてないか」の最短チェック（落ちたらデプロイ禁止）
- Tier1（15分）は「主要機能の回帰テスト」（変更が関係する時は必ず追加）
- Tier2（3時間）は「重い/壊れやすい/破壊的操作も含む」長時間回帰（毎回は回さず、夜間やリリース前に実施）

---

## 2. Tier設計（実行時間の目標）

### 2-1. Tierの使い分け（おすすめ運用）

**Pull Request（PR）時**
- 常に: Tier0
- 追加: 「差分に応じて」Tier1（paths filter → タグ）

**本番デプロイ時（週1想定）**
- 推奨: Tier0 + Tier1（全部）  
  - 週1なら 15分の安全投資が割に合う
  - “差分判定漏れ”による事故が減る

**夜間（定期）**
- Tier2（可能なら毎晩 / 週数回でもOK）

> 注: 「Tier1を全部」か「差分で絞る」かは運用の思想。  
> 本番デプロイ時は “全部” が安全。PR時は “差分で絞る” が効率的。

### 2-2. タグ設計（Playwrightで使う）

- Tierタグ
  - `@tier0` / `@tier1` / `@tier2`
- 機能タグ（差分判定用）
  - `@search` `/`（絞り込み検索、一覧、並び替え）
  - `@product` `/product/*`（詳細、画像、スペック、レビュー表示、価格表示ガード）
  - `@compare` 比較表
  - `@auth` 認証フロー（Hosted UI / callback / 同意）
  - `@rbac` 権限（未ログイン、user/editor/admin）
  - `@profile` `/profile/*`（タブ、並び替え、削除、解除、編集）
  - `@account` `/account`（設定変更、アカ削除はTier2寄せ）
  - `@history` `/history/view`
  - `@review` `/write-review/*`（登録、詳細項目追加のページネーション）
  - `@contact` `/contact`
  - `@admin` `/admin/*`
  - `@external` 外部遷移（楽天/Yahoo/Amazonリンクの検証）
  - `@mail` Mailtrap到達確認
  - `@recaptcha` reCAPTCHA表示/バッジ等

---

## 3. Tier0（3分以内）: “壊れてたら即止める”最小セット

> 目標: **3分以内**（CIで毎回回しても苦にならない）  
> 方針: 破壊的操作はしない / 外部サイトへ実アクセスはしない / リトライは最小

### 3-1. 実施するテストケース（案）

#### T0-1. トップページが表示できる（`@tier0 @search`）
- `/` を開く
- カテゴリ選択 → フィルタで絞り込み → 結果が表示される
- 期待:
  - 主要UIが表示される（ロード中で止まらない）
  - 結果が0件でも “0件UI” が崩れない（=例外が出ない）

#### T0-2. 商品詳細が表示できる（`@tier0 @product`）
- 固定テストデータの `productId` + `variantId` を使い `/product/[productId]?variantId=[variantId]` を開く
- 期待:
  - 画像が少なくとも1枚表示（またはプレースホルダ表示が正常）
  - スペック欄が表示
  - レビュー欄が表示（0件でも崩れない）
  - 価格は「24h内のデータだけ数値表示、それ以外はlink-only」になっている（表示ガードが働く）

#### T0-3. アクセス制御（未ログイン）スモーク（`@tier0 @rbac`）
- 未ログインで以下に直接アクセスし、意図どおり拒否されることを確認
  - `/history/view`
  - `/account`
  - `/write-review/[productId]`
  - `/admin`
- 期待（どれかに統一して判定する）:
  - `/login` にリダイレクトされる、または
  - 403/404等の拒否ページになる

> Tier0で「Cognito Hosted UIログイン」や「/contact送信→Mailtrap到達」までやると、外部要因で3分を超えやすいので Tier1 に寄せる。

---

## 4. Tier1（15分以内）: “主要機能の回帰”セット（差分実行の中心）

> 目標: **15分以内**（週1デプロイなら毎回回しても許容）  
> 方針: Hosted UIログインを1回は通す / Mailtrap到達を確認 / 主要導線を広く触る

### 4-1. 実施するテストケース（案）

#### T1-1. 価格リンクの妥当性検証（`@tier1 @product @external`）
- 商品詳細で楽天/Yahoo/Amazonのリンク要素を取得
- “外部サイトへ本当に遷移する” は不安定なので、以下を検証:
  - URLが想定ドメイン（楽天/Yahoo/Amazon）である
  - Amazonは `tag=` が現行のストアIDになっている
  - クリックで新規タブ/遷移が発生する（`popup` / `page` イベント）

#### T1-2. Cognito Hosted UIログイン→callback→同意→/account（`@tier1 @auth @rbac`）
- 未ログインで `/account` にアクセス
- Hosted UIでテストユーザーでログイン
- `/callback` へ復帰 → 同意 → `/account` を表示
- 期待:
  - `/account` が表示され、ユーザー情報が取得できている

> 実装上は、Playwrightの `storageState` を使い、  
> - 1回だけHosted UIログインを実施（setup）  
> - 以降のテストはログイン済み状態を再利用  
> にすると、安定 & 高速化できる。

#### T1-3. `/contact` 送信→Mailtrap到達（`@tier1 @contact @recaptcha @mail`）
- `/contact` を開く
- reCAPTCHAバッジが表示される（DOM要素または script load の検証）
- フォーム送信
- Mailtrap APIで「新着メール」を確認（タイムアウトは短め、リトライは数回）
- 期待:
  - 送信成功表示
  - Mailtrapに1通到達（件名/送信元等の最小検証）

> 実装で想定する env（GitHub Actions Secrets/Vars）:
> - `E2E_MAILTRAP_API_TOKEN`（Secrets）
> - `E2E_MAILTRAP_INBOX_ID`（Vars でOK）
> - `E2E_MAILTRAP_API_BASE_URL`（任意。通常は不要）

#### T1-4. profile（閲覧系のみの最小回帰）（`@tier1 @profile`）
- `/profile/[username]` を開く（自分/他人は固定データで決める）
- タブ切替（プロフィール / クチコミ / ほしい物 / マイギア）
- 並び替え（UIがあれば）
- 期待: 例外なく表示され、主要要素が描画される

> 実装で想定する env:
> - `E2E_PROFILE_USERNAME`（Vars でOK。`/profile/[username]` の `username`）

#### T1-5. 履歴（閲覧系）（`@tier1 @history`）
- `/history/view` を開く（ログイン済み）
- 一覧が表示される / 検索が機能する（固定データで判定）

#### T1-6. クチコミ記載（登録は“軽量”に）（`@tier1 @review`）
- `/write-review/[productId]` を開く（ログイン済み）
- 入力→送信（破壊的になりやすいので “専用のテスト用productId” に限定）
- 「より詳細な項目を追加」欄のページネーション操作

> レビュー投稿はDBを書き換えるため、テストデータ戦略（専用product/専用ユーザー）が必要。  
> 不安定なら「投稿はTier2」「画面表示だけTier1」に落とす。

---

## 5. Tier2（3時間以内）: “長時間回帰” + “破壊的操作も含む”

> 目標: **3時間以内**  
> 方針: 破壊的操作（削除/解除/アカ削除）はここに寄せる。夜間やリリース前に回す。

### 5-1. 実施するテストケース（案）

- profile（更新系）
  - クチコミ削除
  - ほしい物解除 / マイギア解除
  - プロフィール編集（保存→反映）
- account（更新系）
  - 設定変更
  - アカウント削除（※超注意。捨てユーザーを毎回作って消す設計が必要）
- admin / RBAC（role別）
  - user: `/admin` 拒否
  - editor: `/admin` OK、制限対象の `/admin/*` は拒否
  - admin: 全 `/admin/*` OK
- 比較表（複数製品・UI確認）
- 画像/価格のガード挙動（期限切れデータの表示崩れがない）
- クロスブラウザ（Chromium/Firefox/WebKit）
- レイアウト（スマホ幅）・主要ページのスクリーンショット差分（必要なら）

---

## 6. 「差分 → 実行タグ（paths filter）」対応表（案）

> 目的: PR時にTier1を必要な範囲に絞る。  
> 実装: GitHub Actionsで `paths-filter` を使い、該当フラグに応じて `npx playwright test --grep ...` を組み立てる。

| 変更パス（例） | 影響しやすい範囲 | 追加で回すタグ（Tier1） |
|---|---|---|
| `src/middleware.ts` | 認証/権限/リダイレクト全般 | `@auth @rbac @admin @account @history @review`（≒広め） |
| `src/app/(search)/**` | 検索/一覧/並び替え | `@search @compare` |
| `src/app/product/**` | 商品詳細/価格表示/画像 | `@product @external` |
| `src/app/profile/**` | プロフィール周り | `@profile` |
| `src/app/account/**` | アカウント設定 | `@account @auth` |
| `src/app/history/**` | 閲覧履歴 | `@history @auth` |
| `src/app/write-review/**` `src/app/edit-review/**` | レビュー投稿/編集 | `@review @auth` |
| `src/app/contact/**` | お問い合わせ | `@contact @mail @recaptcha` |
| `src/app/admin/**` | 管理画面 | `@admin @rbac` |
| `src/components/**` `src/hooks/**` `src/services/**` | 横断的に影響しやすい | 原則 Tier1全部（または `@search @product @auth @profile ...` 広め） |
| `server/**` | API/サーバ | 原則 Tier1全部（UIの結果が変わりうる） |
| `src/models/**` | スキーマ/表示ロジック | 原則 Tier1全部 |
| `references/**` `README.md` | ドキュメントのみ | Tier0のみ（またはスキップ可） |

> 注: “絞り込み過ぎ” が一番危険。迷ったら広く回す。  
> PR時の短縮よりも「本番事故の回避」を優先する。

---

## 7. テストデータ/テストユーザー（固定化の方針）

### 7-1. 固定テストデータ（product/variant）

- Tier0/1で「常に存在する」と期待する `productId` / `variantId` を固定で1〜3個用意する
- それぞれ以下が満たせるとテストが安定する
  - 画像あり/なし
  - 価格あり（24h内）/期限切れ
  - レビュー0件/1件以上

### 7-2. テストユーザー（Cognito）

- `e2e-user`（一般ユーザー）
- `e2e-editor`（role=editor）
- `e2e-admin`（role=admin）

> role付与の方法（Cognitoのcustom attribute / DBのユーザープロフィール等）に合わせて準備する。  
> 値はSecrets Managerや安全なメモに保持し、Gitに残さない。

---

## 8. 失敗しにくくする運用（フレーク対策）

- 外部サイトへ“実遷移”しない（URL/タブopenの検証で止める）
- 1テストが長くならないよう、ログインは `storageState` 再利用
- リトライはTier0で最小（0〜1回）、Tier1で必要最小（1〜2回）
- テスト失敗時に、スクショ/traceをArtifactsに残して原因調査を容易にする

---

## 9. 次に作るべき実装物（チェックリスト）

> このチェックリストは、実装完了に伴いチェック済みに更新しています。

- [x] Playwright導入（`tests/e2e` 追加、`playwright.config.ts`）
- [x] タグ付きテスト（Tier0/1/2 + 機能タグ）
- [x] GitHub Actions（PR: Tier0 + 差分Tier1、Main: Tier0+Tier1、Nightly: Tier2）
- [x] ステージング（デプロイ時だけ作成→削除）パイプライン
- [x] Mailtrap / reCAPTCHA test key / テストユーザーなどのSecrets運用
- [x] 固定テストデータ投入（ステージングDB）

---

## 10. ステージング環境（CIで作成→E2E→削除）実装の要点

> 「ステージングを常時稼働しない（=コスト最小化）」方針を取る場合に必要になる実装メモです。

### 10-1. 前提（固定URL）

- E2Eの `E2E_BASE_URL` は `https://stg.yamacomi.jp` を固定で使う
  - Cognito callback/logout URL は固定URLを要求するため（ワイルドカード不可）
  - そのため、`stg.yamacomi.jp` は Route 53 で **固定CNAME** として持つ（例: `yamacomi-stg.ap-northeast-1.elasticbeanstalk.com`）

### 10-2. AWS側で必要なもの（概略）

- GitHub Actions OIDC provider（`token.actions.githubusercontent.com`）
- GitHub Actions が AssumeRole する IAM Role
  - EB操作（create env / terminate env / create version / delete version）
  - EB artifact を置く S3 bucket への put/get/delete
  - ALB 443 listener へ ACM証明書を追加（SNI）
- EB configuration template（CI用）
  - `NEXTAUTH_URL=https://stg.yamacomi.jp` などのステージング固有のenv
  - `CONTACT_FORCE_SMTP=true` + Mailtrap SMTPの `environmentsecrets` 注入

### 10-3. GitHub Actions側の実装方針（概略）

- 1つの workflow（`workflow_dispatch`）で次を行う:
  1) EB application version 作成（zip→S3→`create-application-version`）
  2) `yamacomi-stg` を terminate（残骸があれば）→ `create-environment`（templateで作成）
  3) `https://stg.yamacomi.jp` 疎通待ち
  4) Playwright Tier0 / Tier1 / Tier2 を実行
  5) 成否に関わらず `yamacomi-stg` を terminate（必ず後始末）
- `concurrency` を必ず入れる（同時に2本走るとDNS/環境が衝突するため）

> 注: 既存の `E2E (PR/main/nightly)` を「常時stg前提」で走らせると、stgが存在しない時間帯は失敗します。  
> 運用としては、stgを消す場合は **`workflow_dispatch`（必要な時だけ実行）**へ寄せるか、E2E workflow側で “stg作成→E2E→削除” を内包する設計に統一するのがおすすめです。
