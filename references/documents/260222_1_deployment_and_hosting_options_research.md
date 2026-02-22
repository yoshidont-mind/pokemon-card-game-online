# 無料デプロイ/ホスティング調査メモ（Firebase / Netlify）

作成日: 2026-02-22  
対象: `pokemon-card-game-online`（仲間内での限定利用を想定）

---

## 1. この文書の目的

- 本プロジェクトを「無料で」「できるだけ簡単に」公開する方法を比較する。
- 特に、以下の疑問に答える。
  - Firebase内で完結できるか
  - 費用発生を避けられるか
  - Netlify等の他サービスの方が適しているか

---

## 2. 結論（先に要点）

### 2.1 最有力案（推奨）

- **Firebase Hosting（App Hostingではなく Hosting）を Spark プランで使う**のが、現状要件に最も適合。
- 理由:
  - Firebaseと同一基盤で完結し、構成がシンプル
  - `web.app` / `firebaseapp.com` の標準ドメインが無料で使える
  - 小規模アクセスなら無料枠内に収まりやすい

### 2.2 重要な注意

- **Firebase App Hosting は Blaze（課金有効）必須**。  
  「Firebase内で完結」したい場合でも、今回の用途では **App Hosting ではなく Firebase Hosting** を選ぶべき。

### 2.3 Netlifyについて

- Netlify Freeでも公開は可能で、導入は簡単。
- ただし現在は「クレジット制」で、月間上限到達時にサイトが一時停止する運用。
- Firebase（Firestore/Auth）と併用する場合、運用が分散する点を許容する必要あり。

---

## 3. 公式情報ベースの整理

## 3.1 Firebase Hosting（今回の候補）

- Firebase Hostingは、静的/SPA配信に適した公式ホスティング。
- デフォルトで `web.app` / `firebaseapp.com` サブドメインを無料で利用可能。
- カスタムドメイン接続にも対応。
- SSLは自動プロビジョニング。

### 無料枠（Hosting）

- ストレージ: **10 GB まで無料**
- データ転送: **10 GB/月 まで無料**
- Sparkで上限超過時:
  - ストレージ上限超過: 新規デプロイ不可
  - 転送上限超過: 猶予後にサイト停止（翌月まで）

## 3.2 Firebase Spark/Blaze と App Hosting の関係

- Sparkプランでも「Hosting/Firestore等の有料階層プロダクトの無料枠」は利用可能。
- Sparkの考え方:
  - 無料枠超過分の従量課金は不可（その月の該当プロダクトが止まる）
- **App Hosting は Blaze 必須**（この時点で課金アカウント紐付けが必要）。

## 3.3 Firestore側の無料枠（本プロジェクトで重要）

- 本アプリは対戦中にFirestoreへ頻繁にread/writeするため、HostingだけでなくFirestore枠も実質上限になる。
- Cloud Firestore無料枠（1DB/プロジェクト）:
  - 保存データ 1 GiB
  - Read 50,000/日
  - Write 20,000/日
  - Delete 20,000/日
  - Outbound 10 GiB/月

## 3.4 Netlify Free（比較対象）

- Freeプランは $0。
- 公式Pricing上、Freeに以下が含まれる:
  - Custom domains with SSL
  - Global CDN
  - 300 credit limit / month
- 月間上限到達時は「paused state（停止）」になり、次サイクルまで待つかアップグレードで再開。
- 「Freeはハード上限で、超過課金は発生しない」と明記。

---

## 4. URL要件（`pokemon-tcg-online-simulator` を入れたい）

## 4.1 追加費用なしで文字列を入れる方法

- Firebase Hostingの標準ドメインは `PROJECT_ID.web.app` 形式。
- したがって、**プロジェクトIDに `pokemon-tcg-online-simulator` を含める**と、無料ドメインにも反映できる。
  - 例: `pokemon-tcg-online-simulator-prod.web.app`

## 4.2 注意点

- FirebaseのプロジェクトIDは、リソース作成後は変更不可（実質固定）。
- 既存プロジェクトIDに文字列が入っていない場合:
  - 新規プロジェクトを作り直して移行するか
  - 既存IDのまま運用するか
  を決める必要がある。

---

## 5. あなたの条件に対する適合評価

条件:
- 仲間内のみ、低トラフィック
- 無料優先
- できればURLに `pokemon-tcg-online-simulator`
- できればFirebase内完結

評価:
- **Firebase Hosting（Spark）**: 適合度 高
  - Firebase内完結
  - 無料運用可（枠内前提）
  - URL文字列要件もプロジェクトID次第で満たせる
- **Netlify Free**: 適合度 中
  - 無料・簡単
  - ただしFirebaseと運用分離、停止条件の考え方が異なる

---

## 6. 推奨実行プラン（現実的な順序）

## Phase A: まずは最短で無料公開（推奨）

1. Firebase Hosting（Spark）で公開
2. `web.app` ドメインで運用開始
3. 1〜2週間、実トラフィック/Firestore使用量を観測

## Phase B: 必要なら調整

- URL文字列をどうしても揃えたい場合:
  - プロジェクトIDを含めた再構成を検討
- 無料枠に近づく場合:
  - まず最適化（無駄read削減、更新頻度調整、release整理）
  - それでも不足するなら Blaze + 予算アラート

---

## 7. 実装手順（Firebase Hosting案 / CLI中心）

前提:
- Reactアプリのビルド出力が `build/`
- Firebase CLIインストール済み

手順:

1. ログイン
```bash
firebase login
```

2. プロジェクトを紐付け（必要なら）
```bash
firebase use --add
```

3. Hosting初期化（初回のみ）
```bash
firebase init hosting
```
- public directory: `build`
- SPAルーティング利用時: single-page app rewriteを有効

4. ビルド
```bash
npm run build
```

5. デプロイ
```bash
firebase deploy --only hosting
```

6. 動作確認
- `https://<PROJECT_ID>.web.app`
- `https://<PROJECT_ID>.firebaseapp.com`

---

## 8. 費用発生リスクの見取り図

## 8.1 Firebase Hosting（Spark）

- Hosting 10GB storage / 10GB月転送以内: 無料
- 超過時:
  - 追加請求ではなく機能制限/停止（Spark）

## 8.2 Firestore（Spark）

- 無料枠超過時、該当プロダクト利用が停止（当月）
- 対戦セッションでのread/write密度次第で、Hostingより先にFirestoreが上限到達しうる

## 8.3 Netlify Free

- 無料プランは課金されない（ハード上限）
- 月次上限到達でサイト停止（paused）

---

## 9. 最終提案

- 現時点では、**Firebase Hosting（Spark）で開始**が最適。
- App Hostingは今回不要（かつBlaze必須）。
- まずは無料枠内で実運用し、実測に基づいてBlaze移行判断するのが安全。

---

## 10. 参照元（一次情報）

Firebase:
- Firebase Hosting overview（標準無料サブドメイン / カスタムドメイン / SSL）  
  https://firebase.google.com/docs/hosting
- Hosting usage quotas & pricing（10GB storage / 10GB月転送 / Spark超過時挙動）  
  https://firebase.google.com/docs/hosting/usage-quotas-pricing
- Firebase pricing plans（SparkにHosting等の無料枠、超過時停止）  
  https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- App Hosting costs（App HostingはBlaze必須）  
  https://firebase.google.com/docs/app-hosting/costs
- Firestore pricing（無料枠）  
  https://firebase.google.com/docs/firestore/pricing
- Firebase project ID（作成後の変更不可）  
  https://firebase.google.com/docs/projects/learn-more

Netlify:
- Netlify Pricing（Free: custom domain + SSL, 300 credits）  
  https://www.netlify.com/pricing/
- Netlify Pricing FAQ（上限到達時paused、Freeはハード上限）  
  https://www.netlify.com/pricing/faq/
- Netlify Docs: create deploys（Git/CLI/drag&drop）  
  https://docs.netlify.com/deploy/create-deploys/
- Netlify Docs: assign custom domain（無料で自分のドメイン利用）  
  https://docs.netlify.com/manage/domains/manage-domains/assign-a-domain-to-your-site-app/

---

## 11. 補足（推論を含む点）

- 「Firebase Hostingのカスタムドメイン自体がSparkで不可」という明示記述は今回確認できなかった。  
  ただし、Hosting公式は「標準無料サブドメイン + カスタムドメイン接続」を同列で説明しており、SparkがHosting無料枠を含むこととも整合するため、**通常運用ではSparkでも利用可能**と判断。
- カスタムドメイン利用時の費用は、Hosting側というより**ドメイン登録/更新費**が別途必要（レジストラ依存）。
