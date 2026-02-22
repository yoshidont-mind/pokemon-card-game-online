# 無料デプロイ/ホスティング方式調査（Firebase中心・Netlify比較）

作成日: 2026-02-22  
対象: `pokemon-card-game-online`  
調査方針: 公式ドキュメント（Firebase/Netlify）を一次情報として確認

---

## 1. 先に結論

あなたの条件（仲間内の少人数利用・無料優先・できれば Firebase 完結）では、次が最適です。

1. フロントエンド配信は **Firebase Hosting（Spark 無料プラン）** を第一候補にする
2. URL 文字列に `pokemon-tcg-online-simulator` を入れたい場合は、**Firebase プロジェクト ID** にその文字列を含める
3. ただし本プロジェクトは現状 `localhost:3001` のプロキシに依存しているため、
   - フロントだけ公開しても「デッキ情報取得」は他ユーザー環境では動かない
   - 全機能を公開するには、プロキシ API もインターネット公開が必要

要するに「静的サイト公開だけなら無料で簡単」「全機能公開にはプロキシの配置先設計が必要」です。

---

## 2. 質問への直接回答

### Q1. Firebase 内で完結できる？費用は必ず発生する？

- **Firebase Hosting** なら Spark 無料枠で運用開始できます（無料の `web.app` / `firebaseapp.com` ドメインあり）。
- ただし Firebase の **App Hosting は Blaze 必須**（課金アカウント必須）です。
- さらに、プロキシ API を Firebase Functions に置く場合も、**Functions デプロイには Blaze が必要**です（利用量が少なければ実請求 0 円の可能性はあるが、課金アカウント連携自体は必要）。

### Q2. Netlify なら無料で簡単？

- **Netlify Free** で静的配信は可能です。
- デフォルトで `netlify.app` サブドメインが付き、サイト名である程度 URL を調整できます。
- Free は月次クレジット制のため、上限超過時はサイトが paused（停止）状態になります。

---

## 3. 比較表（今回の要件向け）

| 観点 | Firebase Hosting (Spark) | Firebase App Hosting | Netlify Free |
|---|---|---|---|
| 初期導入の簡単さ | 高い（CLIで完結） | 中（構成が重い） | 高い（Git連携が容易） |
| 無料開始 | 可能 | 不可（Blaze必須） | 可能 |
| デフォルトURL | `PROJECT_ID.web.app` | 提供あり（ただしBlaze） | `SITE_NAME.netlify.app` |
| `pokemon-tcg-online-simulator` をURLに入れる容易さ | プロジェクトID命名時に可 | 同左 | サイト名で可 |
| Firebase内完結 | 可能（Hostingのみなら） | 可能 | 不可（分散運用） |
| 本プロジェクトの「デッキ取得」対応 | 別途プロキシ配置が必要 | バックエンド同居しやすいがBlaze | 別途Function/API配置が必要 |
| 無料超過時の挙動 | Spark上限到達で制限/停止 | 従量課金 | Free上限でpaused |

### 3.1 フロント＋プロキシを同時に公開する場合の比較

前提: 本プロジェクトは `src/components/Session.js` で `http://localhost:3001/proxy` を参照しているため、公開運用ではプロキシAPIの外部ホスティングが必要。

| 構成案 | 無料開始 | 課金アカウント要否 | Firebase内完結 | 実装難易度 | 運用難易度 | 向いている状況 |
|---|---|---|---|---|---|---|
| Firebase Hosting + ローカル `proxy-server.js`（現状） | 可能 | 不要 | いいえ | 低 | 高（利用者ごとにローカル起動が必要） | 開発者1人のローカル検証専用 |
| Firebase Hosting + Firebase Functions（HTTP） | 可能（ただし） | 必要（Blaze必須） | はい | 中 | 低〜中 | Firebaseで統一して本番公開したい |
| Firebase Hosting + Cloud Run（プロキシAPI） | 可能（ただし） | 必要（Blaze/課金有効） | はい（GCP含む） | 中 | 中 | 将来プロキシの柔軟性・拡張性を重視 |
| Netlify（フロント）+ Functions/Cloud Run（プロキシ） | 可能（ただし） | 多くの場合必要（プロキシ側） | いいえ | 中 | 中〜高（分散運用） | Firebase以外も許容し、まず公開優先 |
| Vercel（フロント）+ Functions/Cloud Run（プロキシ） | 可能（ただし） | 多くの場合必要（プロキシ側） | いいえ | 中 | 中〜高（分散運用） | Vercel運用に慣れている |

補足:
- 「可能（ただし）」は、無料枠内での運用開始はできるが、Functions/Run を使う時点で課金アカウント連携が前提になることを意味する。
- 仲間内の小規模利用で「フロントもプロキシも公開」したいなら、現実的には **Firebase Hosting + Firebase Functions** が最短。
- 完全無料（課金アカウント連携すら避ける）を厳守する場合、現状構成のままでは利用者全員が各自で `proxy-server.js` を起動する運用になる。

---

## 4. Firebase の最新要点（2026-02-22確認）

### 4.1 Firebase Hosting は無料ドメインあり

- Firebase Hosting では、各プロジェクトに以下の無料ドメインが付きます。
  - `PROJECT_ID.web.app`
  - `PROJECT_ID.firebaseapp.com`

### 4.2 Spark で Hosting 無料枠を使える

- Spark（無料）で Hosting の無償枠を使えます。
- Hosting 使用量ページ上の Spark 枠（確認時点）:
  - Storage: 10 GB
  - Data transfer: 360 MB/day

### 4.3 Firebase App Hosting は今回非推奨

- 公式に「App Hosting でデプロイするには Blaze が必要」と明記されています。
- 「まず無料で小規模公開したい」という要件には不向きです。

### 4.4 Functions も注意

- 公式に「Cloud Functions for Firebase をデプロイするには Blaze が必要」と明記されています。
- つまり、プロキシを Firebase Functions 化する場合は課金アカウント連携が必要です。

---

## 5. Netlify の最新要点（2026-02-22確認）

### 5.1 Free で公開は可能

- Free プランは 0 ドルで利用開始可能。
- デフォルト `netlify.app` サブドメインが付きます。
- カスタムドメイン + SSL も利用可能（ドメイン費は別）。

### 5.2 Free の運用注意

- Free には月次クレジット上限があり、上限到達時は paused になります。
- 「絶対に落ちない公開環境」が必要なら、使用量監視と上限対策が必要です。

---

## 6. このプロジェクト固有の重要論点（最重要）

現状コードでは、デッキ取得 API が固定でローカルを参照しています。

- `src/components/Session.js` で `http://localhost:3001/proxy?...` を呼び出し
- つまり公開サイトから見ると、閲覧者自身のPCに `localhost:3001` が必要
- 他ユーザーは通常この条件を満たさないため、デッキ取得が失敗する

結論:

- **静的ホスティングだけでは全機能公開は未達**
- 本番運用には、`/proxy` 相当のエンドポイントを外部公開する必要がある

---

## 7. 実行パターン（推奨順）

### パターンA（最短・無料優先）

- フロントのみ Firebase Hosting (Spark) で公開
- デッキ取得機能は一時的に制限（または手入力導線を用意）

向いている状況:

- まずUI/対戦機能を仲間内テストしたい
- デッキ取得は暫定で妥協できる

### パターンB（機能完全・Firebase寄せ）

- フロント: Firebase Hosting
- プロキシ: Firebase Functions/Cloud Run

注意:

- Blaze 必須（課金アカウント紐付け）
- 低トラフィックなら実請求がほぼ0円に収まる可能性はあるが、ゼロ保証ではない

### パターンC（機能完全・分散運用）

- フロント: Netlify Free or Firebase Hosting
- プロキシ: 別サービスの API 実行基盤

注意:

- 設定箇所が増えるため運用複雑度が上がる
- 障害切り分けが難しくなる

---

## 8. URL要件の満たし方

要望: URL のどこかに `pokemon-tcg-online-simulator`

### Firebase

- 例: プロジェクトIDを `pokemon-tcg-online-simulator` 系で作成
- 生成URL: `https://pokemon-tcg-online-simulator-xxx.web.app`
- 注意: プロジェクトIDは後から変更不可

### Netlify

- サイト名を `pokemon-tcg-online-simulator` 系に設定
- 生成URL: `https://pokemon-tcg-online-simulator.netlify.app`（空き状況次第）

---

## 9. まずの実装方針（現実解）

1. 先に Firebase Hosting (Spark) でフロントを公開
2. 公開後、実利用で Firestore read/write 量を観測
3. 同時に、`/proxy` の本番配置先を決める
   - 0課金アカウント厳守ならパターンA寄り
   - 全機能重視ならパターンB（Blaze許容）

---

## 10. 参考情報（一次ソース）

Firebase:

- Firebase Hosting 概要（無料サブドメイン）  
  https://firebase.google.com/docs/hosting
- Hosting 使用量/料金（Spark枠）  
  https://firebase.google.com/docs/hosting/usage-quotas-pricing
- Firebase Pricing Plans（Spark/Blaze）  
  https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- App Hosting の料金要件（Blaze必須）  
  https://firebase.google.com/docs/app-hosting/costs
- Cloud Functions for Firebase（デプロイにBlaze必要）  
  https://firebase.google.com/docs/functions/get-started
- Firebase Project ID（変更不可の注意）  
  https://firebase.google.com/docs/projects/learn-more

Netlify:

- Netlify Pricing（Free plan / credits）  
  https://www.netlify.com/pricing/
- Pricing FAQ（上限超過時 paused）  
  https://www.netlify.com/pricing/faq/
- Netlify subdomain（`netlify.app`）  
  https://docs.netlify.com/manage/domains/configure-and-manage-domains/
- Custom domain 設定  
  https://docs.netlify.com/manage/domains/manage-domains/assign-a-domain-to-your-site-app/

---

## 11. 補足

- 本資料は 2026-02-22 時点の公式記載に基づきます。
- 無料枠や条件は今後変更されうるため、実際のデプロイ直前に再確認すること。
