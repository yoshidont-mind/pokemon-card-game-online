# 実装ログ: デプロイ前テスト自動化（Playwright / Tier0・Tier1・Tier2）

作成日: 2026-02-09（JST）

> ルール:
> - 秘匿情報は貼らない（必要なら `<REDACTED>`）。
> - ターミナル出力はこのファイル内に貼る（別ファイルに分離しない）。

## 進捗サマリ（随時更新）

- [x] 実装手順書の作成
- [x] Playwright導入（最小）
- [x] Tier0 実装（3分以内）
- [x] Tier1 実装（15分以内）
- [x] Tier2 実装（3時間以内）
- [x] GitHub Actions（PR / Main / Nightly）
- [x] 差分→Tier1絞り込み（paths filter → grep）
- [x] ステージングURL（`stg.yamacomi.jp`）初回準備（ACM/DNS/EB環境）
- [x] ステージング環境（デプロイ時だけ作成→削除）パイプライン（CI自動化）
- [x] E2E用Secrets（Mailtrap / reCAPTCHA / Cognito test user）
- [x] 検証（E2E / 成功・失敗時の後始末 / コスト）

## 作業ログ

### 2026-02-09（JST）

- 手順書/ログの作成（設計案）
  - `references/implementation_plans/260209_2_pre_deploy_test_automation.md`
  - `references/implementation_logs/260209_2_pre_deploy_test_automation.md`
- 併せて別タスクの計画/ログ（未追跡だったもの）も含めてコミット済み
  - commit: `7d72709f`（メッセージ: `手順書: デプロイ前E2E自動化案とベンダーマッチ精度改善計画を追加`）
- 同時並行タスクと干渉しないよう、作業用ブランチを作成

#### 実行コマンド/出力

```bash
$ git checkout -b codex/260209_2_pre_deploy_e2e
Switched to a new branch 'codex/260209_2_pre_deploy_e2e'
```

---

### Playwright導入（最小） + Tier0/Tier1/Tier2（骨組み）+ GitHub Actions（下地）

#### 実施内容（概要）

- `@playwright/test` を追加し、`playwright.config.ts` と `tests/e2e/*` を追加
- Tier0/Tier1/Tier2 の最小テスト（まずはスモーク中心）を実装
- selector安定化のため、必要最小限の `data-testid` をUI側へ追加
  - 検索結果: `data-testid="search-results"` など
  - reCAPTCHA/contact: `data-testid="contact-..."` など
  - ConsentGate: `data-testid="consent-..."`（E2Eで同意処理を自動化できるように）
- GitHub Actions（PR / main / nightly）を追加（実行に必要なGitHub Secrets/Varsは別途設定が必要）

#### 実行コマンド/出力（抜粋）

```bash
$ npm view @playwright/test version
1.58.2

$ npm install
(npm warn: peer dependency conflictが既存で出るが、install自体は成功)
added 4 packages, and audited 987 packages in 23s
29 vulnerabilities (2 low, 4 moderate, 22 high, 1 critical)

$ npx playwright test --list
Listing tests:
  [chromium] › tier0.smoke.spec.ts ... (@tier0 ...)
  [chromium] › tier1.core.spec.ts ... (@tier1 ...)
  [chromium] › tier2.rbac.spec.ts ... (@tier2 ...)
Total: 9 tests in 3 files
```

#### 追加対応（ログ整備）

- `playwright-report/` がローカル生成物として作成されるため、`.gitignore` に追加してコミット対象から除外
- GitHub Actions の Node.js を `22` → `20` に変更（安定運用向け / `@types/node@20` と整合）

#### 追加対応（Tier1拡充）

- `/contact` の送信後に、Mailtrap API をポーリングして到達確認できるようにした（設定が無い場合は注記の上スキップ）
  - env: `E2E_MAILTRAP_API_TOKEN` / `E2E_MAILTRAP_INBOX_ID`（任意: `E2E_MAILTRAP_API_BASE_URL`）
- Tier1 に profile の最小スモークを追加（タブが表示されることの確認）
  - env: `E2E_PROFILE_USERNAME`
- GitHub Actions の env / paths-filter に profile / Mailtrap を追加

---

### ステージングURL（`stg.yamacomi.jp`）初回準備（ACM / Route 53 / EB環境）

> ゴール: GitHub Actions の `E2E_BASE_URL=https://stg.yamacomi.jp` で、ステージングに対してE2Eが実行できる状態にする。

#### 実施内容（概要）

- Route 53（`yamacomi.jp` のホストゾーン）に `stg.yamacomi.jp` のDNSレコードを追加
- ACM（東京リージョン）で `stg.yamacomi.jp` の証明書を発行し、ALB（ステージング側）でSNI利用できるよう設定
- Elastic Beanstalk で本番環境をクローンし、`yamacomi-stg` 環境を作成
- Cognito（Hosted UI）にステージングURLの callback/logout URL が含まれていることを確認

> 注意: この時点では「デプロイ時だけ作って削除」のCI自動化までは未対応。まずはステージングURL実体を作り、E2Eが成立する最低限の土台を作る。

#### 確認コマンド/出力（抜粋）

##### Route 53: `stg.yamacomi.jp` のレコード（CNAME）

```bash
$ aws route53 list-resource-record-sets --hosted-zone-id Z05059742VEQFQO00X0SH --profile eb-cli --region ap-northeast-1 | jq '.ResourceRecordSets[] | select(.Name=="stg.yamacomi.jp.")'
{
  "Name": "stg.yamacomi.jp.",
  "Type": "CNAME",
  "TTL": 300,
  "ResourceRecords": [
    {
      "Value": "yamacomi-stg.ap-northeast-1.elasticbeanstalk.com."
    }
  ]
}
```

##### ACM: `stg.yamacomi.jp` 証明書（ISSUED）

```bash
$ aws acm describe-certificate --certificate-arn arn:aws:acm:ap-northeast-1:971422707241:certificate/46cd4cfb-9c98-4236-8d67-0aeaf42ab4e9 --profile eb-cli --region ap-northeast-1 | jq '.Certificate | {DomainName, Status, InUseBy}'
{
  "DomainName": "stg.yamacomi.jp",
  "Status": "ISSUED",
  "InUseBy": [
    "arn:aws:elasticloadbalancing:ap-northeast-1:971422707241:loadbalancer/app/awseb--AWSEB-YBY4FskoVETx/b1941e689925cf7a"
  ]
}
```

##### ALB(443 listener): SNI用に `stg` 証明書がアタッチされていること（defaultではない）

```bash
$ aws elbv2 describe-listener-certificates --listener-arn arn:aws:elasticloadbalancing:ap-northeast-1:971422707241:listener/app/awseb--AWSEB-YBY4FskoVETx/b1941e689925cf7a/d1b47e12aa17a668 --profile eb-cli --region ap-northeast-1 | jq '.Certificates[] | {CertificateArn, IsDefault}'
{
  "CertificateArn": "arn:aws:acm:ap-northeast-1:971422707241:certificate/46cd4cfb-9c98-4236-8d67-0aeaf42ab4e9",
  "IsDefault": false
}
{
  "CertificateArn": "arn:aws:acm:ap-northeast-1:971422707241:certificate/5f12e19d-5378-4262-b0f3-c335a3e2a62e",
  "IsDefault": true
}
```

##### 動作確認: `https://stg.yamacomi.jp/` が200で返る（HTTPSの証明書も一致）

```bash
$ curl -sS -I https://stg.yamacomi.jp/ | sed -n '1,12p'
HTTP/2 200
date: Mon, 09 Feb 2026 11:27:56 GMT
content-type: text/html; charset=utf-8
server: nginx
x-powered-by: Next.js

$ echo | openssl s_client -servername stg.yamacomi.jp -connect stg.yamacomi.jp:443 2>/dev/null | openssl x509 -noout -subject | sed -n '1p'
subject=CN=stg.yamacomi.jp
```

##### Elastic Beanstalk: `yamacomi-stg` 環境が Ready/Green

```bash
$ aws elasticbeanstalk describe-environments --application-name yamacomi --profile eb-cli --region ap-northeast-1 | jq '.Environments[] | select(.EnvironmentName=="yamacomi-stg") | {EnvironmentName, Status, Health, CNAME, EndpointURL}'
{
  "EnvironmentName": "yamacomi-stg",
  "Status": "Ready",
  "Health": "Green",
  "CNAME": "yamacomi-stg.ap-northeast-1.elasticbeanstalk.com",
  "EndpointURL": "awseb--AWSEB-YBY4FskoVETx-715572661.ap-northeast-1.elb.amazonaws.com"
}
```

##### Cognito: callback/logout URL に `stg.yamacomi.jp` が含まれている

```bash
$ aws cognito-idp describe-user-pool-client --user-pool-id ap-northeast-1_G6GpwwXes --client-id 12u82q7d9s4fdeor3srbqttipa --profile eb-cli --region ap-northeast-1 | jq '.UserPoolClient | {CallbackURLs, LogoutURLs, AllowedOAuthFlowsUserPoolClient, AllowedOAuthFlows, AllowedOAuthScopes, SupportedIdentityProviders}'
{
  "CallbackURLs": [
    "...",
    "https://stg.yamacomi.jp/callback",
    "https://stg.yamacomi.jp/silent-redirect",
    "..."
  ],
  "LogoutURLs": [
    "...",
    "https://stg.yamacomi.jp/",
    "..."
  ],
  "AllowedOAuthFlowsUserPoolClient": true,
  "AllowedOAuthFlows": [
    "code",
    "implicit"
  ],
  "AllowedOAuthScopes": [
    "aws.cognito.signin.user.admin",
    "email",
    "openid",
    "profile"
  ],
  "SupportedIdentityProviders": [
    "COGNITO"
  ]
}
```

---

### 2026-02-12（JST）

#### 差分→Tier1絞り込み（paths filter → grep）の実装（PR時の実行時間短縮）

> 背景: PR時は「差分に応じてTier1を必要十分だけ」実行したいが、これまで「Tier1全実行」しかできず、
> また将来 `--grep` による絞り込みを入れると「該当タグのテストが存在しない=0件マッチ」で失敗し得る。

- `E2E (PR)` で `paths-filter` の結果から `tier1_grep` を生成し、reusable workflow へ渡す形に変更
  - `@tier1.*(@search|@compare|...)` 形式の grep regex を生成
- `e2e_ephemeral_stg.yml`（reusable workflow）側で `tier1_grep` が指定された場合は
  `npx playwright test --grep "${tier1_grep}"` でTier1を絞って実行するように変更
- `paths-filter` の誤りを修正（compare/account/review などが現行のコード配置とズレていたため）
- Tier1 のタグ網羅を補完（PR側で出力され得るタグが0件マッチにならないよう、最低1本ずつ追加）
  - `@search`（検索→結果表示）
  - `@compare`（比較表タブ）
  - `@account`（ログイン済みで /account 表示）
  - `@history`（ログイン済みで /history/view 表示）
  - `@review`（ログイン済みで /write-review 表示）

#### 実行コマンド/出力（抜粋）

```bash
$ npx playwright test --list
...（Total: 15 tests in 7 files）
```

---

### ユーザー側の手動動作確認（ステージング）

実施日: 2026-02-09（JST）

ユーザーが以下を確認:

- `https://stg.yamacomi.jp/` が開ける
- 画面上の「ログイン」ボタンを押下 → Cognito Hosted UI に遷移 → ログイン → `/account` に戻る

補足（既知の挙動/別タスクで対応予定）:

- 未ログイン状態で `/account` に直接アクセスすると、
  - `https://stg.yamacomi.jp/account` でも `https://yamacomi.jp/account` でも
  - 「アカウント情報を読み込み中...」のローディング表示が継続してしまう不具合がある。
- 本タスク（デプロイ前E2E自動化）では、この不具合の修正は行わない。
  - E2Eではログイン導線を `/login` → Hosted UI 経由で通す実装になっているため（=再現しにくく、別タスクでの修正が適切）

---

### `/contact` をステージングで安全にテストするための下準備（SMTP切替の実装）

背景:
- Tier1 のE2Eで `/contact` を自動送信して検証したい
- 本番と同じGmail（SMTP）で送ってしまうと、テストの度に本番サポート宛メールが増える
- そのため、ステージングでは Mailtrap 等のテストSMTPへ切り替えられるようにする

対応:
- `src/app/api/contact/route.ts` を更新し、以下の環境変数が設定されている場合は SMTP で送るようにした
  - `SMTP_HOST`（必須）
  - `SMTP_PORT`（任意。未指定は 587）
  - `SMTP_SECURE`（任意。`true` の場合は 465）
  - `SMTP_USER` / `SMTP_PASS`（任意。認証が必要なSMTPの場合に使用）
  - `CONTACT_MAIL_FROM`（任意。未指定は `GMAIL_USER` → `SMTP_USER` → `no-reply@yamacomi.jp` の順にfallback）
- 上記が未設定の場合は、従来どおり `GMAIL_USER` / `GMAIL_APP_PASSWORD` を使った Gmail 送信を継続（後方互換）

メモ:
- ステージング側のSMTP（Mailtrap）値は秘匿なのでログに貼らない。Secrets Manager から注入する運用に寄せる。

#### 追加: ステージングの `NEXTAUTH_URL` を `stg` に揃える

- `yamacomi-stg` は本番クローンで作っているため、初期状態では `NEXTAUTH_URL=https://yamacomi.jp` のままだった。
- ステージングでのHosted UI遷移やE2Eの安定性の観点から、`NEXTAUTH_URL=https://stg.yamacomi.jp` に更新。

```bash
$ aws elasticbeanstalk update-environment --environment-name yamacomi-stg --profile eb-cli --region ap-northeast-1 \\
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=NEXTAUTH_URL,Value=https://stg.yamacomi.jp
```

---

### ユーザー側の手作業（reCAPTCHA / Mailtrap / GitHub Actions への登録）

実施日: 2026-02-09（JST）

#### reCAPTCHA（ステージング対応）

- Google Cloud（reCAPTCHA管理画面）で、キー `yamacomi_v3` の許可ドメインに `stg.yamacomi.jp` を追加して保存
- 古いキー `yamacomi_v2` が残っていたため削除（整理）

#### Mailtrap（Email Sandbox）

- Mailtrap にサインアップ（Email Sandbox のみ / `nodemailer` を選択）
- API Token を作成
  - Token名: `yamacomi-stg-e2e-mailtrap-reader`
  - Permissions: `Sandbox > My Project > Viewer` のみ（最小権限）

#### AWS Secrets Manager（ステージングSMTP用）

- Secret名: `yamacomi/stg/smtp/mailtrap`
- keys: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- Secret ARN:
  - `arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-8OH7Z8`

#### GitHub Actions（E2E用）

※ 実値（API TokenやSMTPパスワード等）はチャット/ログに貼らない。

- `yamacomi` リポジトリの Actions Secrets:
  - `E2E_MAILTRAP_API_TOKEN` を登録
- `yamacomi` リポジトリの Actions Variables:
  - `E2E_MAILTRAP_INBOX_ID` を登録

---

### 2026-02-10（JST）

### ステージングEBへ Mailtrap SMTP を注入（Secrets Manager連携）

ゴール:
- `yamacomi-stg` の `/contact` が **Gmailではなく Mailtrap SMTP に送る**（E2Eでメール到達確認するため）

方針:
- ステージング環境のシークレットは、値を平文でEBに入れず、`aws:elasticbeanstalk:application:environmentsecrets` で注入する

#### 1) EBのSecrets注入が AccessDenied でロールバックしたため、EC2ロールに権限を追加

状況:
- `yamacomi-stg` に `SMTP_*` を `environmentsecrets` で注入しようとしたところ、EBのEC2ロールがSecrets Manager参照権限を持っておらず、環境更新が失敗・ロールバックした。

対応:
- IAM role `aws-elasticbeanstalk-ec2-role` の inline policy `yamacomi-app-extra-permissions` に、ステージング用シークレットの参照権限を追加。

確認（現在のポリシー抜粋）:

```bash
$ aws iam get-role-policy --role-name aws-elasticbeanstalk-ec2-role --policy-name yamacomi-app-extra-permissions --profile eb-cli --region ap-northeast-1 | jq '.PolicyDocument.Statement[] | select(.Action|tostring|contains("secretsmanager:GetSecretValue"))'
{
  "Sid": "ReadYamacomiSecrets",
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:DescribeSecret"
  ],
  "Resource": [
    "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/prod/mongodb_uri-*",
    "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/prod/smtp/gmail-*",
    "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/prod/recaptcha-*",
    "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-*"
  ]
}
```

#### 2) `environmentsecrets` に `SMTP_*` を設定（Mailtrap secret参照）

現在の `environmentsecrets`（`yamacomi-stg`）確認:

```bash
$ aws elasticbeanstalk describe-configuration-settings --application-name yamacomi --environment-name yamacomi-stg --profile eb-cli --region ap-northeast-1 | jq '.ConfigurationSettings[0].OptionSettings[] | select(.Namespace=="aws:elasticbeanstalk:application:environmentsecrets") | {OptionName, Value}'
{
  "OptionName": "SMTP_HOST",
  "Value": "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-8OH7Z8:SMTP_HOST"
}
{
  "OptionName": "SMTP_PASS",
  "Value": "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-8OH7Z8:SMTP_PASS"
}
{
  "OptionName": "SMTP_PORT",
  "Value": "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-8OH7Z8:SMTP_PORT"
}
{
  "OptionName": "SMTP_SECURE",
  "Value": "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-8OH7Z8:SMTP_SECURE"
}
{
  "OptionName": "SMTP_USER",
  "Value": "arn:aws:secretsmanager:ap-northeast-1:971422707241:secret:yamacomi/stg/smtp/mailtrap-8OH7Z8:SMTP_USER"
}
```

#### 3) ステージングへデプロイ（環境更新）

```bash
$ eb deploy yamacomi-stg
2026-02-10 00:34:25    INFO    Environment update is starting.
2026-02-10 00:34:37    INFO    Immutable deployment policy enabled. Launching one instance with the new settings to verify health.
2026-02-10 00:34:53    INFO    Created temporary auto scaling group awseb-e-vddtf6c2wz-immutable-stack-AWSEBAutoScalingGroup-1Bo5KTHTnM64.
2026-02-10 00:36:37    INFO    Instance deployment completed successfully.
2026-02-10 00:36:41    INFO    Adding new instance(s) (i-0bb4b9c4a89dfc31d) to the load balancer.
2026-02-10 00:36:42    INFO    Waiting for instance(s) (i-0bb4b9c4a89dfc31d) to pass health checks. 
2026-02-10 00:38:46    INFO    Detached new instance(s) from temporary auto scaling group awseb-e-vddtf6c2wz-immutable-stack-AWSEBAutoScalingGroup-1Bo5KTHTnM64.
2026-02-10 00:38:50    INFO    Attached new instance(s) to the permanent auto scaling group awseb-e-vddtf6c2wz-stack-AWSEBAutoScalingGroup-hq8L6ykJ9A3f.
2026-02-10 00:39:17    INFO    Starting post-deployment configuration on new instances.
2026-02-10 00:39:28    INFO    Instance deployment completed successfully.
2026-02-10 00:39:31    INFO    Waiting for post-deployment configuration to complete.
2026-02-10 00:41:05    INFO    Deployment succeeded. Terminating old instances and temporary Auto Scaling group.
2026-02-10 00:44:17    INFO    New application version was deployed to running EC2 instances.
2026-02-10 00:44:17    INFO    Environment update completed successfully.
```

デプロイ完了確認（環境が Ready/Green に戻ること、VersionLabelが更新されること）:

```bash
$ aws elasticbeanstalk describe-environments --application-name yamacomi --environment-names yamacomi-stg --profile eb-cli --region ap-northeast-1 | jq '.Environments[0] | {EnvironmentName, Status, Health, HealthStatus, VersionLabel, DateUpdated}'
{
  "EnvironmentName": "yamacomi-stg",
  "Status": "Ready",
  "Health": "Green",
  "HealthStatus": "Ok",
  "VersionLabel": "app-41e5-260210_093358259037",
  "DateUpdated": "2026-02-10T00:44:18.256000+00:00"
}
```

---

### ステージングの `/contact` が Mailtrap に送られず、Gmailで配信されてしまう問題

実施日: 2026-02-10（JST）

#### ユーザー側の確認結果

ユーザーが `https://stg.yamacomi.jp/contact` から送信（件名: `テスト１` / 送信時刻: 09:59 JST）したところ、

- ユーザー本人のメール（`yoshidon.com@gmail.com`）に自動返信が届いた
- `support@yamacomi.jp` にサポート宛メールが届いた
- Mailtrap（Email Sandbox）には何も届かなかった

⇒ ステージングで SMTP（Mailtrap）に切り替わっておらず、**Gmail送信が実行されている**可能性が高い。

#### ログ確認（CloudWatch）

`/contact` 実行時刻付近で `audit:contact:*` のログを確認（値は秘匿が含まれ得るため、ここではメッセージのみ記録）:

```bash
$ aws logs filter-log-events --log-group-name '/aws/elasticbeanstalk/yamacomi-stg/var/log/web.stdout.log' --start-time 1770684600000 --end-time 1770685800000 --filter-pattern '"audit:contact"' --profile eb-cli --region ap-northeast-1 | jq -r '.events[].message'
Feb 10 00:59:15 ip-172-31-2-120 web[2406]: [INFO] audit:contact:auto-reply:sent { toDomain: 'gmail.com' }
Feb 10 00:59:15 ip-172-31-2-120 web[2406]: [INFO] audit:contact:send { toDomain: 'yamacomi.jp' }
```

#### 対応方針

- ステージングで `SMTP_*` が有効化されていない状態でも実メール送信してしまうと危険（E2E実行の度に本番宛メールが増える）。
- そのため、`/api/contact` に以下を追加する:
  - 送信時に **SMTP or Gmail のどちらが選ばれたか**をログに出す（秘匿なし）
  - 環境変数 `CONTACT_FORCE_SMTP=true` の場合、`SMTP_HOST` 未設定なら 500 を返して **Gmail送信を防止**

#### ステージング環境に `CONTACT_FORCE_SMTP=true` を設定

```bash
$ aws elasticbeanstalk update-environment --environment-name yamacomi-stg --profile eb-cli --region ap-northeast-1 \\
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=CONTACT_FORCE_SMTP,Value=true
```

#### 追加実装: `/api/contact` の送信トランスポートをログ出し + SMTP強制フラグ対応

- `src/app/api/contact/route.ts` に以下を追加
  - `CONTACT_FORCE_SMTP=true` の場合、`SMTP_HOST` 未設定なら 500 を返す（=Gmail送信を防止）
  - `audit:contact:transport` として `smtp` / `gmail` をログ出し（秘匿なし）

（コミット）

```bash
$ git log -1 --oneline
618c1436 contact: stgでSMTP強制（Mailtrap）+ 送信トランスポートをログ出し
```

#### ステージングへデプロイ（コード反映）

```bash
$ eb deploy yamacomi-stg
Creating application version archive "app-618c-260210_103852962614".
(upload...)
2026-02-10 01:39:41    INFO    Environment update is starting.
...
2026-02-10 01:49:08    INFO    New application version was deployed to running EC2 instances.
2026-02-10 01:49:08    INFO    Environment update completed successfully.
```

デプロイ後確認:

```bash
$ aws elasticbeanstalk describe-environments --application-name yamacomi --environment-names yamacomi-stg --profile eb-cli --region ap-northeast-1 | jq '.Environments[0] | {Status, Health, VersionLabel}'
{
  "Status": "Ready",
  "Health": "Green",
  "VersionLabel": "app-618c-260210_103852962614"
}
```

---

### `/contact` の再スモーク（ステージング → Mailtrap 到達）

実施日: 2026-02-10（JST）

#### ユーザー側の確認結果（成功）

ユーザーが `https://stg.yamacomi.jp/contact` から送信（件名: `テスト２` / 送信時刻: 11:15 JST）したところ、

- Mailtrap（My Sandbox）に `【yamacomi】テスト２` が着信
- ユーザー本人（`yoshidon.com@gmail.com`）には着信しない
- `support@yamacomi.jp` にも着信しない

⇒ ステージングでは Gmail 送信が抑止され、**Mailtrap SMTPへ切り替わっている**ことが確認できた。

#### CloudWatch Logs で transportKind を確認

```bash
$ aws logs filter-log-events --log-group-name '/aws/elasticbeanstalk/yamacomi-stg/var/log/web.stdout.log' --start-time 1770689400000 --end-time 1770690000000 --filter-pattern '"audit:contact:"' --profile eb-cli --region ap-northeast-1 | jq -r '.events[].message'
Feb 10 02:15:06 ip-172-31-10-251 web[2407]: [INFO] audit:contact:transport { kind: 'smtp' }
Feb 10 02:15:10 ip-172-31-10-251 web[2407]: [INFO] audit:contact:send { toDomain: 'yamacomi.jp' }
```

---

### ローカルE2Eスモーク: Tier1（外部リンク）固定データの候補確認 + テスト安定化

目的:
- GitHub Actions の `E2E_PRODUCT_ID` / `E2E_VARIANT_ID` に設定する「固定の検証用データ」の候補を確認する
- Tier1の外部リンクテストが、商品詳細ページの **ロード中** に評価して落ちないように安定化する

#### Playwrightブラウザ（Chromium）をインストール（ローカル）

```bash
$ npx playwright install chromium
(download...)
```

#### 固定候補1: Rakuten表示確認に使っていたvariant（Yahooリンクが無く失敗）

```bash
$ E2E_BASE_URL='https://stg.yamacomi.jp' E2E_PRODUCT_ID='686ce14e87f1f14818505eeb' E2E_VARIANT_ID='686ce57687f1f14818505f00' \\
  npx playwright test tests/e2e/tier1.core.spec.ts --grep \"外部リンク\" --project=chromium
(結果: Yahooリンクが無く失敗)
```

#### 固定候補2: Yahoo表示確認に使っていたvariant（Rakuten/Yahoo/Amazonリンクが揃って成功）

```bash
$ E2E_BASE_URL='https://stg.yamacomi.jp' E2E_PRODUCT_ID='687027dc27018e83f3dd3178' E2E_VARIANT_ID='6871aca91687f4095354b800' \\
  npx playwright test tests/e2e/tier1.core.spec.ts --grep \"外部リンク\" --project=chromium
(結果: pass)
```

⇒ `E2E_PRODUCT_ID` / `E2E_VARIANT_ID` の固定候補は、現状はこちらを推奨:
- `E2E_PRODUCT_ID`: `687027dc27018e83f3dd3178`
- `E2E_VARIANT_ID`: `6871aca91687f4095354b800`

#### 追加実装: 外部リンクテストで商品詳細のロード完了を待つ

- `tests/e2e/tier1.core.spec.ts` で、リンク抽出前に `h2` が描画されるまで待つように修正
  - 読み込み中（`商品情報を読み込み中...`）はリンクが描画されないため

#### `/contact` のTier1テストをローカルでスモーク（Mailtrap到達確認はCIで実施）

```bash
$ E2E_BASE_URL='https://stg.yamacomi.jp' \\
  npx playwright test --grep \"(?=.*@tier1)(?=.*@contact)\" --project=chromium
(結果: pass)
```

---

### GitHub Actions Variables を設定（E2E_BASE_URL 等）

目的:
- GitHub Actions（PR / main / nightly）が参照する `E2E_*` Variables を設定し、CI側でE2Eが成立する状態に近づける

実施内容:
- `E2E_BASE_URL`: `https://stg.yamacomi.jp`
- `E2E_PRODUCT_ID`: `687027dc27018e83f3dd3178`
- `E2E_VARIANT_ID`: `6871aca91687f4095354b800`

（実行コマンド）

```bash
$ gh variable set E2E_BASE_URL --body "https://stg.yamacomi.jp"
$ gh variable set E2E_PRODUCT_ID --body "687027dc27018e83f3dd3178"
$ gh variable set E2E_VARIANT_ID --body "6871aca91687f4095354b800"
```

補足:
- `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` は Secrets（秘匿）なので、このログには貼らず、GitHub Actions Secrets 側に登録する

---

### GitHub Actions Secrets を設定（E2E_USER_EMAIL / E2E_USER_PASSWORD）

実施日: 2026-02-10（JST）

目的:
- Tier1の Hosted UI ログイン（`@auth`）を CI で実行できるようにする

ユーザーが実施:
- GitHub（`yamacomi` repo）に以下の Secrets を追加
  - `E2E_USER_EMAIL`
  - `E2E_USER_PASSWORD`

こちらで確認（値は秘匿のため出さない）:

```bash
$ gh secret list | rg '^E2E_'
```

---

### Tier0（@search）の安定化: 初期状態が「カテゴリ選択」で検索結果DOMが無いケースに対応

背景:
- `/` の初期表示は「カテゴリ選択グリッド」になり得るため、`data-testid="search-results"` が存在しないことがある
- `<header>` が ARIAの `banner` にならない構造の場合もあるため、ロゴで生存確認する方が安定

対応:
- `tests/e2e/tier0.smoke.spec.ts` を以下の方針に変更
  - ヘッダー判定: `role=img name="yamacomi logo"` が表示される
  - 「検索結果 or 0件表示 or カテゴリ選択」のいずれかが表示される

ローカルでTier0をスモーク（stgを対象）:

```bash
$ E2E_BASE_URL='https://stg.yamacomi.jp' \\
  E2E_PRODUCT_ID='687027dc27018e83f3dd3178' \\
  E2E_VARIANT_ID='6871aca91687f4095354b800' \\
  npm run test:e2e:tier0 -- --project=chromium
(結果: pass)
```

---

### GitHub Actions（E2E PR）が失敗: Mailtrap API Token の種類が違う（403）

状況:
- PRのE2E（Tier1）が `/contact` の Mailtrap 到達確認で失敗する

失敗ログ（要点）:

```bash
$ gh run list --branch codex/260210_1_e2e_ci_enable --limit 1
(最新runがfailure)

$ gh run view 21856554178 --log-failed | rg -n \"Mailtrap API error|Endpoint is not supported\"
(抜粋)
Mailtrap API error: 403 Forbidden (token type mismatch)
Raw: {\"errors\":\"Endpoint is not supported for API tokens\"}
```

原因:
- E2Eは **Mailtrap Email Sandbox v1 API**（`https://mailtrap.io/api/v1/inboxes/<id>/messages`）を叩いている
- このAPIは **Inbox専用 API Token** が必要
- Mailtrap の `Settings > API Tokens` で作成した “API Token” はこのエンドポイントでは弾かれる

対応:
- `references/documents/260209_1_e2e_ci_variables_secrets_setup_guide.md` を修正し、
  - `Sandboxes → My Sandbox → API → Create API Token` で作る「Inbox専用 token」を使う旨を追記
- GitHub Secrets `E2E_MAILTRAP_API_TOKEN` は、上記で作成した token へ差し替えが必要

次アクション（ユーザー手作業）:
- Mailtrap: `Sandboxes → My Sandbox → API → Create API Token` で token を発行
- GitHub: `yamacomi` repo → `Settings → Secrets and variables → Actions → Secrets`
  - `E2E_MAILTRAP_API_TOKEN` を差し替え

#### ユーザー対応（完了）

実施日: 2026-02-10（JST）

ユーザーが実施:
- Mailtrap: `Sandboxes → My Sandbox → API` から **Inbox専用 token** を発行
- GitHub: `E2E_MAILTRAP_API_TOKEN` を、上記の Inbox専用 token へ差し替え

#### 追加調査: Inbox専用 token に差し替えても 403 が継続

状況:
- `E2E_MAILTRAP_API_TOKEN` を差し替えた後の run（例: `21857224665`）でも同じ 403 が発生

```bash
$ gh secret list | rg '^E2E_MAILTRAP_API_TOKEN'
E2E_MAILTRAP_API_TOKEN  2026-02-10T08:20:39Z

$ gh run view 21857224665 --log-failed | rg -n \"Mailtrap API error|Endpoint is not supported\"
(抜粋)
Mailtrap API error: 403 Forbidden (token type mismatch)
Raw: {\"errors\":\"Endpoint is not supported for API tokens\"}
```

考えられる原因:
- Mailtrap側のUI/トークン体系が変わっており、`/api/v1/inboxes/<id>/messages` が受け付ける token と合っていない
  - 結果として、token を差し替えても v1 endpoint 側で弾かれ続ける

対応（方針変更）:
- E2Eの Mailtrap 到達確認を、Mailtrap API v2 も含めて **自動判定（v2→v1フォールバック）** するよう修正
  - v2: `/api/accounts/<accountId>/inboxes/<inboxId>/messages`（accountIdは `/api/accounts` で解決）
  - v1: `/api/v1/inboxes/<inboxId>/messages`
- `references/documents/260209_1_e2e_ci_variables_secrets_setup_guide.md` も、
  - “方法A（Sandboxes側token）/ 方法B（Settings側token）どちらでもOK” として記述を更新

結果:
- PRのE2E（Tier1）が成功することを確認

```bash
$ gh run watch 21857545810 --exit-status
(success)
✓ codex/260210_1_e2e_ci_enable E2E (PR) yoshidont-mind/yamacomi#1 · 21857545810
...
✓ e2e in 1m47s (ID ...)
...
ANNOTATIONS
-   1 skipped
  3 passed (...)
```

---

### Tier1 `/contact` のテストをフレークしにくくする

背景:
- CIのretryで `お問い合わせを送信しました` の表示待ちが15秒でタイムアウトすることがあった

対応:
- `tests/e2e/tier1.core.spec.ts` を修正し、
  - 送信ボタン押下後に `/api/contact` の `POST` が完了するまで待つ
  - 成功メッセージ待ちのtimeoutを60秒に延長

---

### 2026-02-10（JST）

### ステージング環境（デプロイ時だけ作成→削除）パイプラインの下準備（AWS: EB template / IAM(OIDC)）

> 目的: `stg.yamacomi.jp`（固定CNAME）に対して、CIが **環境を作ってE2Eして消す** 方式を取れるようにする。

#### 1) EB configuration template を作成

- 既存の `yamacomi-stg`（env id: `e-vddtf6c2wz`）から、CI用の設定テンプレートを作成
  - template name: `yamacomi-stg-ci`

```bash
$ aws elasticbeanstalk create-configuration-template \
  --application-name yamacomi \
  --template-name yamacomi-stg-ci \
  --environment-id e-vddtf6c2wz \
  --description 'CI: ephemeral stg for E2E' \
  --profile eb-cli --region ap-northeast-1
```

#### 2) GitHub Actions OIDC の AssumeRole（IAM Role）を作成

背景:
- CIからEB環境を create/terminate するにはAWS操作が必要
- 長期Access Keyは避けたいので、GitHub Actions OIDC（`token.actions.githubusercontent.com`）でAssumeRoleする

実施（要点のみ）:
- OIDC provider（既に作成済み）:
  - `arn:aws:iam::971422707241:oidc-provider/token.actions.githubusercontent.com`
- Role:
  - role name: `yamacomi-github-actions-e2e-stg`
  - trust policy: `sub=repo:yoshidont-mind/yamacomi:ref:refs/heads/main` に限定
  - permissions（最小）:
    - Elastic Beanstalk（env create/terminate, app version create/delete, describe）
    - S3（EB artifact bucket への upload/delete）
    - ELBv2（443 listener へのSNI証明書追加）

※ policy本文（JSON）は長くなるのでこのログには貼らない（秘匿値は含まないがノイズが多いため）。

---

### 2026-02-10（JST）

### GitHub Actions: 一時stg作成→E2E→削除 workflow を追加（未検証）

実施:
- `.github/workflows/e2e_ephemeral_stg.yml` を追加
  - `workflow_dispatch` で起動し、以下を実行する
    1) EB application version 作成（`git archive` → S3 upload → `create-application-version`）
    2) `yamacomi-stg` を terminate（残骸があれば）→ `create-environment`（template=`yamacomi-stg-ci`）
    3) `stg.yamacomi.jp` のHTTPS疎通確認
    4) Tier0/Tier1/Tier2 を選択して Playwright を実行
    5) `yamacomi-stg` を terminate（必ず）＋ application version を削除（必ず）
- 既存の `e2e_pr.yml` / `e2e_main.yml` / `e2e_nightly.yml` に `concurrency: yamacomi-stg-e2e` を追加（競合防止）

コミット:

```bash
$ git log -1 --oneline
b2b7ea28 CI: 一時stg作成→E2E→削除workflowを追加
```

---

### 2026-02-10（JST）

### E2E (ephemeral stg) の検証で判明した問題と対応（terminate待ちタイムアウト）

#### 状況

`E2E (ephemeral stg)`（`workflow_dispatch`）を実行したところ、

- `Ensure stg environment exists (terminate stale => create)` ステップで失敗
- 原因は `aws elasticbeanstalk wait environment-terminated` が **標準の wait 設定だと 6分程度で打ち切られる**ため
  - EB の terminate は ALB/ASG/CloudFormation の削除を伴い **10分以上かかることがある**

失敗した run:
- `https://github.com/yoshidont-mind/yamacomi/actions/runs/21866264592`

失敗ログ（要点）:

```bash
Waiter EnvironmentTerminated failed: Max attempts exceeded. Previously accepted state: For expression "Environments[].Status" all members matched excepted path: "Terminating"
```

補足:
- 失敗後も `Cleanup (terminate stg + delete app version)` は成功し、
  - stg環境は terminate される（リソース/コストが残り続ける状況は回避）
  - EB application version / S3 bundle も削除できた

#### 追加で判明した権限不足（CloudFormation）

同時期に、CIが AssumeRole している IAM role に CloudFormation の describe 権限が不足しているエラーが出ていたため、
IAM role の inline policy を更新して解消した。

- IAM role: `yamacomi-github-actions-e2e-stg`
- 追加したアクション:
  - `cloudformation:DescribeStackResource`
  - `cloudformation:DescribeStackResources`
  - `cloudformation:DescribeStacks`
  - `cloudformation:DescribeStackEvents`

```bash
$ aws iam get-role-policy --role-name yamacomi-github-actions-e2e-stg --policy-name yamacomi-github-actions-e2e-stg --profile eb-cli --region ap-northeast-1 \\
  | jq -r '.PolicyDocument.Statement[] | select(.Sid==\"CloudFormationDescribe\") | .Action[]'
cloudformation:DescribeStackEvents
cloudformation:DescribeStackResource
cloudformation:DescribeStackResources
cloudformation:DescribeStacks
```

#### 対応（workflowの修正）

`.github/workflows/e2e_ephemeral_stg.yml` を修正し、

- EBの terminate 待ちを、標準waiterではなく **自前polling（最大40分）** に置き換え
- さらに CNAME 再利用のタイミングずれを吸収するため、
  - `create-environment` を数回リトライするようにした
  - `--cname-prefix yamacomi-stg` を指定して stg の固定CNAME運用（`stg.yamacomi.jp` → `yamacomi-stg...`）を維持

コミット:

```bash
$ git log -1 --oneline
5c8bfc8d CI: 一時stg terminate待ちを強化（タイムアウト対策）
```

#### 追加で判明した権限不足（S3: EB platform assets bucket）

直近の GitHub Actions run で `aws elasticbeanstalk create-environment` が以下のエラーで失敗した。

- GitHub Actions run: `21866903820`（workflow: `E2E (ephemeral stg)`）
- 失敗ステップ: `Ensure stg environment exists (terminate stale => create)`
- 失敗内容（抜粋）:

```text
An error occurred (InsufficientPrivilegesException) when calling the CreateEnvironment operation:
Access Denied: S3Bucket=elasticbeanstalk-platform-assets-ap-northeast-1,
S3Key=stalks/.../packs/Nodejs22Template.pack
```

原因:
- GitHub Actions が AssumeRole している IAM role（`yamacomi-github-actions-e2e-stg`）に、
  EB platform assets bucket への `s3:GetObject` が不足していた。

対応（AWS設定変更）:
- IAM Role: `yamacomi-github-actions-e2e-stg`
- Inline policy: `yamacomi-github-actions-e2e-stg`
- 追加した Statement:

```json
{
  "Sid": "ElasticBeanstalkPlatformAssetsRead",
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": ["arn:aws:s3:::elasticbeanstalk-platform-assets-ap-northeast-1/*"]
}
```

---

### E2E (ephemeral stg) が 502（.next 不在）で落ちる問題

状況:
- `E2E (ephemeral stg)` が環境作成に成功しても、`https://stg.yamacomi.jp/` が `502 Bad Gateway` になり、E2Eが実行できない。
- EBのログを確認すると、Next.js の起動時に以下のエラーでクラッシュしていた:
  - `Error: Could not find a production build in the '.next' directory. Try building your app with 'next build' before starting the production server.`

原因:
- 本番/手元の `eb deploy` では、事前に `next build` が走って `.next` が zip に同梱されていた。
- 一方、`E2E (ephemeral stg)` の workflow では `git archive` で zip を生成しており、
  - `.next/` は `.gitignore` 対象のため zip に含まれず
  - EB側でもビルド（`npm run build`）が走らないため
  - 起動時に `.next` が無くて落ちる、という状態になっていた。

対応:
- `E2E (ephemeral stg)` の workflow を修正し、EB application version の zip を作る前に
  - `npm ci`
  - `npm run build`（=`next build`）
  - `.ebignore` を尊重しつつ `.next`（cache以外）を含めて zip を作成
  するように変更した。
- 併せて、`NEXT_PUBLIC_*`（Cognito / reCAPTCHA site key）は EB config template（`yamacomi-stg-ci`）から自動取得し、
  build 時に埋め込まれる値が `stg` と一致するようにした（GitHub側に重複して保持しない）。

コミット:

```bash
$ git log -1 --oneline
2cb2e620 CI: 一時stg(E2E)のEB bundleに.nextを同梱
```

---

### Next build が `Missing MONGODB_URI` で失敗する問題（CI上の build 前提と相性が悪い）

状況:
- `.next` をCI上で生成する方針に切り替えた結果、GitHub Actions 上の `next build` が以下で失敗した:
  - `Error: Missing MONGODB_URI environment variable`
  - `Failed to collect page data for /api/admin/session`

原因:
- `src/utils/db.ts` が **import 時（=モジュール読み込み時）に MONGODB_URI を検証して throw** していた。
- Next.js の build フェーズでは、route module が評価され得るため、**Secrets（MONGODB_URI）が無いCI上で build できない**状態になっていた。

対応:
- `src/utils/db.ts` を修正し、MONGODB_URI の検証（fail-fast）は `dbConnect()` の呼び出し時に行うよう変更。
  - これにより、SecretsをCIに持ち込まずに `next build` が可能になる。
- 併せて、`E2E (ephemeral stg)` workflow の Cleanup を改善し、`Create EB application version` まで到達していない場合でも Cleanup が落ちないようにした（version_label が空ならスキップ）。

---

### 2026-02-11（JST）

### `E2E (ephemeral stg)` のE2E自体は動くが、Tier0 が strict mode locator で失敗

状況:
- `E2E (ephemeral stg)` の run で、以下が成立することを確認できた:
  - CI上で `.next` をビルドし、EB環境を作成し、`stg.yamacomi.jp` へ到達できる
  - 失敗時でも Cleanup が最後まで走り、stg環境・app version が残らない
- ただし Tier0 の `@rbac` テストが locator の strict mode で失敗した:
  - `getByText("ログインが必要です")` が `h1` と `p` の2要素にマッチしてしまう

対応:
- `tests/e2e/tier0.smoke.spec.ts` を修正し、
  - `getByText("ログインが必要です")` → `getByRole("heading", { name: "ログインが必要です" })`
  へ置き換えて安定化した。

コミット:

```bash
$ git log -1 --oneline
db643f35 E2E: Tier0 RBACテストのlocatorを安定化
```

---

### `E2E (ephemeral stg)` が `wait environment-exists` のタイムアウトで落ちるフレーク

状況:
- `Ensure stg environment exists (terminate stale => create)` の末尾で実行していた
  - `aws elasticbeanstalk wait environment-exists`
  が、環境作成が遅いケースで 6分程度でタイムアウトして失敗することがあった。

原因:
- AWS CLI の waiter は最大試行回数が固定で、EB環境作成が遅いと間に合わない。
- その後に `Wait until stg is Ready/Green` で最大30分待つ実装が既にあるため、ここで短いwaiterを挟むこと自体がフレーク要因になっていた。

対応:
- `wait environment-exists` を廃止し、`describe-environments` を用いた自前polling（最大20分）へ置き換えた。

確認コマンド/出力:

```bash
$ aws iam get-role-policy --role-name yamacomi-github-actions-e2e-stg --policy-name yamacomi-github-actions-e2e-stg --query 'PolicyDocument.Statement[?Sid==`ElasticBeanstalkPlatformAssetsRead`]' --output json --profile eb-cli | jq
[
  {
    "Sid": "ElasticBeanstalkPlatformAssetsRead",
    "Effect": "Allow",
    "Action": [
      "s3:GetObject"
    ],
    "Resource": [
      "arn:aws:s3:::elasticbeanstalk-platform-assets-ap-northeast-1/*"
    ]
  }
]
```

---

### `E2E (ephemeral stg)` を main で再検証（Tier0 成功）

状況:
- main ブランチで `E2E (ephemeral stg)` を `tier0` で実行し、Tier0 が成功することを確認した。
  - GitHub Actions run: `21888375885`

結果（概要）:
- `.next` 同梱の bundle で EB 環境作成まで進み、E2E_BASE_URL へ到達できた
- Tier0 が成功（3 tests passed）
- Cleanup が成功し、stg 環境と EB app version を残さずに終了した

---

### Tier1（Hosted UIログイン）がタイムアウトするフレーク

状況:
- main ブランチで `E2E (ephemeral stg)` を `tier0+tier1` で実行したところ、
  - Tier1 の `Cognito Hosted UI ログイン→/account 表示` がタイムアウトで失敗した。
  - GitHub Actions run: `21888665856`

失敗内容（要点）:
- `tests/e2e/helpers/auth.ts` の以下でタイムアウト:
  - `page.waitForURL(/amazoncognito\.com/i, { timeout: 60_000 })`
- `waitForURL` の既定が `waitUntil: "load"` のため、Hosted UI 側の load が遅い/発火しないケースで待ちが外れず、フレークし得る。

対応:
- Hosted UI 遷移待ちを以下に変更して安定化:
  - `waitUntil: "commit"` にする（load を待たない）
  - `NEXT_PUBLIC_COGNITO_DOMAIN` がある場合は、そのドメインに基づいて Hosted UI を待つ
  - click と wait を `Promise.all` で同時に開始して取りこぼしを減らす

コミット:

```bash
$ git log -1 --oneline
f7b66c2f E2E: Cognito Hosted UI 遷移待ちを安定化
```

---

### PR / main / nightly の E2E workflow が “常時ステージング前提” になっていた問題

状況:
- `E2E (PR)` / `E2E (main)` / `E2E (nightly)` が
  - `E2E_BASE_URL=https://stg.yamacomi.jp` を直接叩く形式のままで、
  - stg の EB 環境が存在しないタイミング（= ephemral stg の Cleanup 後）に `net::ERR_NAME_NOT_RESOLVED` で落ちることがあった。
  - 例: GitHub Actions run: `21889130426`（PR）

原因:
- 「ステージングはデプロイ時だけ作ってテスト後に削除する（ephemeral）」方針に対し、
  - PR/main/nightly が “常時 stg が稼働している” 前提の workflow のままだった。

対応:
- `E2E (PR)` / `E2E (main)` / `E2E (nightly)` を修正し、
  - それぞれが `E2E (ephemeral stg)`（= EB 環境作成→E2E→削除）の reusable workflow を呼び出す形に統一。
- 併せて、PRでは E2Eハーネス（tests/e2e / workflows / playwright.config.ts）変更時は `tier0+tier1` を回すようにした。

コミット:

```bash
$ git log -3 --oneline
6816e9ac CI: PRでE2Eハーネス変更時はTier1も実行
14e67f4c CI: E2Eをephemeral stgワークフローに統一
f7b66c2f E2E: Cognito Hosted UI 遷移待ちを安定化
```

---

### reusable workflow 呼び出しの `uses` 記法が原因で “workflow file issue” になる

状況:
- `E2E (PR)` / `E2E (main)` / `E2E (nightly)` の `jobs.<job>.uses` を
  - `uses: ./.github/workflows/e2e_ephemeral_stg.yml`
  のように “ローカルパス” で呼び出す形にしていたが、
  - workflow自体が即 failure（jobsが1つも作られない）になる事象が発生した。
  - `gh run view` 上も `This run likely failed because of a workflow file issue.` と表示される。

確認:
- `E2E (PR)` が `decide` だけ成功し、workflow全体は failure になる（e2e jobが作られない）
  - run: `21895634487`
- `E2E (main)` の workflow_dispatch が jobsなしで即 failure（workflow file issue）
  - run: `21896324440`

原因:
- reusable workflow の呼び出しは `owner/repo/.github/workflows/<file>@<ref>` 形式が必要で、
  “ローカルパス（`./.github/workflows/...`）指定” は無効だった。

対応:
- `E2E (PR)` / `E2E (main)` / `E2E (nightly)` の `uses` を以下に統一:
  - `uses: yoshidont-mind/yamacomi/.github/workflows/e2e_ephemeral_stg.yml@main`

コミット:

```bash
$ git log -1 --oneline
687ab947 CI: reusable workflow 呼び出しを@main参照に修正
```

---

### `workflow_call` の inputs 定義が原因で呼び出し側workflowが即死する

状況:
- `E2E (main)` / `E2E (nightly)` / `E2E (PR)` が `E2E (ephemeral stg)` を reusable workflow として呼び出す際、
  - workflow自体が即 failure（workflow file issue / jobsが作られない）になる事象が発生した。

原因:
- `E2E (ephemeral stg)` の `on.workflow_call.inputs.tier` に `required: true` と `default:` を同時指定していた。
  - GitHub Actions 側の仕様上、`workflow_call` inputs ではこの組み合わせが無効扱いになり得るため、呼び出し側workflowが起動できなくなる。

対応:
- `on.workflow_call.inputs.tier` から `default:` を削除し、
  - 呼び出し側が必ず `tier` を渡す（= `with: tier: ...`）運用に統一した。

コミット:

```bash
$ git log -1 --oneline
55e91039 CI: workflow_call inputsのdefaultを削除
```

---

### `workflow_call` で使うSecretsを宣言していないと呼び出し側が起動できない

状況:
- `E2E (main)` / `E2E (nightly)` / `E2E (PR)` は、E2E実行に必要な資格情報（テストユーザーやMailtrap API token等）を
  - `secrets: inherit`
  で `E2E (ephemeral stg)` に渡す前提になっている。
- しかし `E2E (ephemeral stg)` 側で `on.workflow_call.secrets` を宣言していないと、
  - 呼び出し側workflowが “workflow file issue” として即死（jobsが作られない）し得る。

対応:
- `E2E (ephemeral stg)` の `on.workflow_call.secrets` に、利用するSecretsを列挙して宣言した。
  - `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` / `E2E_MAILTRAP_API_TOKEN` は必須
  - `E2E_EDITOR_*` / `E2E_ADMIN_*` は将来Tier2で使う想定のため optional（未設定でも呼び出しは可能）

コミット:

```bash
$ git log -1 --oneline
d7b84a9e CI: reusable workflowのworkflow_call secretsを宣言
```

---

### `secrets: inherit` をやめて “必要なSecretsだけ” を明示的に渡す

状況:
- 呼び出し側workflow（`E2E (main)` / `E2E (nightly)` / `E2E (PR)`）で `secrets: inherit` を使っていたが、
  - リポジトリが個人アカウント配下であるため、GitHub Actions の仕様上 `inherit` が使えず、
  - reusable workflow 呼び出しが “workflow file issue” で即死する可能性があった。

対応:
- 呼び出し側workflowは `secrets: inherit` を廃止し、必要なSecretsを `secrets:` で明示的に渡す形へ変更。
  - 必須: `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` / `E2E_MAILTRAP_API_TOKEN`
  - 任意: `E2E_EDITOR_*` / `E2E_ADMIN_*`（未設定でも呼び出し自体は可能）

コミット:

```bash
$ git log -1 --oneline
f66cb4f7 CI: E2E reusable workflowへSecretsを明示的に渡す
```

---

### 呼び出し側jobにも `id-token: write` を付ける（OIDC / AWS AssumeRole 用）

状況:
- reusable workflow（`E2E (ephemeral stg)`）では AWS AssumeRole（OIDC）を使うため `id-token: write` が必須。
- GitHub Actions の仕様上、呼び出し側workflowのトップレベル `permissions:` だけでは不足するケースがあるため、
  - reusable workflowを呼び出す job（`jobs.e2e`）側にも `permissions` を明示しておく方が安全。

対応:
- `E2E (main)` / `E2E (nightly)` / `E2E (PR)` の `jobs.e2e` に `permissions` を追加:
  - `contents: read`
  - `id-token: write`

コミット:

```bash
$ git log -1 --oneline
146f9962 CI: 呼び出し側jobにid-token権限を明示
```

---

### GitHub Actions の `concurrency` デッドロックを解消（E2Eが即キャンセルされる問題）

状況:
- `E2E (main)` / `E2E (nightly)` / `E2E (PR)` が 1〜2秒で即失敗することがある。
- 失敗理由（Annotations）:
  - `Canceling since a deadlock was detected for concurrency group: 'yamacomi-stg-e2e' between a top level workflow and 'e2e'`

原因:
- 呼び出し側workflow（`e2e_main.yml` 等）と、reusable workflow（`e2e_ephemeral_stg.yml`）の双方で
  同じ `concurrency.group: yamacomi-stg-e2e` を設定していた。
- 呼び出し側が concurrency lock を保持したまま reusable workflow 呼び出しに入り、
  reusable 側も同じ lock を取ろうとして待機 → 呼び出し側は job 完了待ちで lock を解放できず、
  GitHub Actions に “deadlock” と判定されてキャンセルされる。

対応:
- 呼び出し側workflowの `concurrency:` を削除し、`concurrency` は reusable workflow（`e2e_ephemeral_stg.yml`）側で一元管理する形に変更。
  - 修正ファイル:
    - `.github/workflows/e2e_main.yml`
    - `.github/workflows/e2e_pr.yml`
    - `.github/workflows/e2e_nightly.yml`

（以後）確認:
- `E2E (main)` を再実行し、`deadlock` で即キャンセルされないことを確認する。

リモート反映:

```bash
$ git push -u origin fix/e2e-job-permissions
To https://github.com/yoshidont-mind/yamacomi.git
   113d2c8c..436f44ba  fix/e2e-job-permissions -> fix/e2e-job-permissions
branch 'fix/e2e-job-permissions' set up to track 'origin/fix/e2e-job-permissions'.
```

```bash
$ gh pr create --base main --head fix/e2e-job-permissions --title "CI: E2E concurrency deadlock fix" --body "(省略)"
https://github.com/yoshidont-mind/yamacomi/pull/15
```

---

### PRワークフローで OIDC AssumeRole が失敗する（`sts:AssumeRoleWithWebIdentity`）

状況:
- `E2E (PR)` が `aws-actions/configure-aws-credentials@v4` で失敗:
  - `Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`

原因:
- IAMロール `yamacomi-github-actions-e2e-stg` の信頼ポリシー（`token.actions.githubusercontent.com:sub`）が
  `repo:yoshidont-mind/yamacomi:ref:refs/heads/main` など “branch ref” のみ許可しており、
  `pull_request` イベントの `sub=repo:yoshidont-mind/yamacomi:pull_request` が許可されていなかった。

対応:
- `yamacomi-github-actions-e2e-stg` の信頼ポリシーに `repo:yoshidont-mind/yamacomi:pull_request` を追加。

```bash
$ aws iam get-role --role-name yamacomi-github-actions-e2e-stg --profile eb-cli \\
  --output json | jq '.Role.AssumeRolePolicyDocument.Statement[0].Condition.StringLike[\"token.actions.githubusercontent.com:sub\"]'
[
  \"repo:yoshidont-mind/yamacomi:pull_request\",
  \"repo:yoshidont-mind/yamacomi:ref:refs/heads/codex/260210_1_ephemeral_stg_ci\",
  \"repo:yoshidont-mind/yamacomi:ref:refs/heads/main\"
]
```

（以後）確認:
- `E2E (PR)` を rerun し、AWS assume role を通過することを確認。

---

### Tier1: Hosted UI ログインのタイムアウト（60s）でフレーク

状況:
- Tier0 は通るが、Tier1 の Hosted UI ログインテストが 60s で落ちることがある:
  - `Error: page.waitForURL: Test timeout of 60000ms exceeded.`

原因:
- `playwright.config.ts` の `timeout: 60_000`（テスト全体の最大時間）により、
  Hosted UI → /callback → 同意 → 復帰 が 60s を超えた時点でテストが強制中断される。

対応:
- `tests/e2e/tier1.core.spec.ts` の Hosted UI ログインテストだけ `test.setTimeout(180_000)` を設定。

追加で判明したこと:
- 上記だけでは不十分で、`signInViaHostedUI()` 内部の
  `page.waitForURL(hostedUiUrlRe, { timeout: 60_000 })` が 60s で落ちるケースがあり、Tier1 が失敗した。

追加対応:
- `tests/e2e/helpers/auth.ts` の Hosted UI 遷移待ち (`waitForURL`) を 60s → 120s に延長。
- しかしそれでも URL が `https://stg.yamacomi.jp/login` のまま変わらないケースがあり、
  「クリックは通っているが hydrate が間に合わず JS ハンドラが動かない」可能性が高い（フレーク）。

再発防止（フレーク吸収）:
- `tests/e2e/helpers/auth.ts` の Hosted UI への遷移部分を
  `waitForURL + click` を短いtimeoutで複数回リトライする方式に変更した
  （40s × 3回 = 最大120s、途中で成功すれば即抜け）。

補足:
- 上記の実装変更の際に `signInButton` の変数名が重複してしまい、Tier0 が TypeScript の SyntaxError で落ちた。
  - `Identifier 'signInButton' has already been declared`
- `/login` の「Sign in」ボタンと Hosted UI の submit ボタンで変数名を分けて解消した。

---

### Hosted UI遷移が「/loginのまま」になるフレークへの追加対策（hydrate遅延の吸収）

状況:
- 直近の PR（`fix/e2e-job-permissions`）の実行でも、Tier1 の Hosted UI ログインが
  - `/login` のまま Hosted UI に遷移せず（URLが変わらず）
  - `waitForURL` / `waitForURL+retry` がタイムアウト
  するケースがあった。
- 体感として「`/login` が client component のため、環境作成直後は hydrate が遅く、クリックが空振りする」挙動に近い。

対応:
- `tests/e2e/helpers/auth.ts` をさらに見直し、`/login` の「Sign in」クリック後に
  1) Hosted UI のURLへ **遷移開始（waitUntil=commit）**できたか（=クリックが効いたか）
  2) Hosted UI のフォーム（username input）が見えるか
  の2段階で判定し、一定回数リトライして吸収するようにした。
- 合計で `test.setTimeout(180_000)` を超えにくいように、1回あたりの timeout を抑えた（リトライ回数でカバー）。

コミット:

```bash
$ git log -1 --oneline
a237082a CI: Hosted UIログイン遷移のフレークをcommit+フォーム待ちで吸収
```

---

### Hosted UI遷移待ち（commit 20s）が短すぎて失敗（/loginのまま）

状況:
- `fix/e2e-job-permissions` の `E2E (PR)` で Tier1 が以下で失敗した:
  - `TimeoutError: page.waitForURL: Timeout 20000ms exceeded.`
  - 失敗箇所: `tests/e2e/helpers/auth.ts` の `waitForURL(hostedUiUrlRe, { waitUntil: "commit" })`
- つまり `/login` の「Sign in」クリック後、Hosted UI への遷移が 20s 以内に開始されなかった。

原因（推定）:
- 依然として `/login` の hydrate 遅延で click が空振りするケースがあり、
  - click 自体は実行されても onClick が効かず、URLが変わらない。
- 20s は短く、環境作成直後の stg では OIDC redirect 開始までがブレる可能性がある。

対応:
- `tests/e2e/helpers/auth.ts` の `/login` → Hosted UI 遷移部分を再調整:
  - ページ再読み込みを繰り返すのではなく、同一ページで click をリトライする方式へ寄せた。
  - クリック前に「React が hydrate 済みか」を best-effort で検知し、クリック空振りを減らす:
    - DOM node に付与される `__reactFiber$...` / `__reactProps$...` の存在を確認
  - `waitForURL(..., waitUntil="commit")` の timeout を 60s に延長
  - Hosted UI 側のフォーム表示待ちも 60s に延長
- Tier1 のログインテスト自体の timeout も 300s へ延長（ephemeral stg 作成直後のブレを吸収）。

---

### Hosted UI遷移前に `/login` の「Sign in」ボタンが消え、elementHandle待ちで 300s タイムアウト

状況:
- `E2E (PR)` の Tier1 が以下で失敗:
  - `Error: locator.elementHandle: Test timeout of 300000ms exceeded.`
  - 失敗箇所: `tests/e2e/helpers/auth.ts` の `loginSignInButton.elementHandle()`
  - Call log: `waiting for getByRole('button', { name: 'Sign in' })`

原因（推定）:
- 「hydrate遅延の検知」目的で `elementHandle()` を呼んでいたが、
  - `Sign in` ボタンが一時的に描画されない/置き換わるタイミングに当たると
  - `elementHandle()` が「ボタンが現れるまで待つ」挙動になり
  - 結果としてテスト全体の timeout (300s) まで待ち続けて落ちる。

対応:
- hydrate検知（`elementHandle + __reactFiber$...`）を撤廃し、
  `/login` → click → Hosted UI URL(commit) を条件にリトライする方式へ戻した。
- さらに、リトライ時は「必ず `/login` を `page.goto` で開き直す」ようにして、
  途中でページ状態が崩れても次のattemptが確実に `/login` から始まるようにした。

コミット:

- このログ追記と同じコミットに含める。

---

### Hosted UI遷移待ち（commit 60s）で再びタイムアウト（クリック空振りの再発）

状況:
- `E2E (PR)` の Tier1 が再び以下で失敗:
  - `TimeoutError: page.waitForURL: Timeout 60000ms exceeded. waiting for navigation until "commit"`
  - 失敗箇所: `tests/e2e/helpers/auth.ts` の `waitForURL(hostedUiUrlRe, { waitUntil: "commit" })`

原因（推定）:
- `/login` の `Sign in` ボタンは SSR で描画されるため「見えてはいる」が、
  hydrate 前のタイミングだと click が空振り（onClick がまだ効かない）するケースがある。

追加対応:
- `elementHandle()` は待ちが長くなり得るため使わず、
  `page.waitForFunction()` で `Sign in` ボタンに `__reactFiber$... / __reactProps$...` が付与されるまでを
  best-effort で待ってから click する（= onClick が効く確率を上げる）。
- これにより「hydrate待ち」と「waitForURL(commit) + retry」を両方持ち、フレーク吸収を強化する。

---

### `/login` の click 空振りを根絶するため、アプリ側に「hydrate完了マーカー」を追加

状況:
- 依然として `waitForURL(waitUntil=commit)` がタイムアウトすることがあり、
  `/login` の `Sign in` click が空振りしている可能性が高い。

原因（推定）:
- Reactの内部キー（`__reactFiber$...` など）は、環境によって enumerable でない可能性があり、
  `Object.keys()` ベースの検知が安定しない（＝ hydrate 完了を取りこぼす）。

対応:
- アプリ側（`src/app/login/page.tsx`）の `Sign in` ボタンに以下を追加:
  - `data-testid="login-signin"`（Playwright の安定 locator 用）
  - `data-hydrated="true|false"`（`useEffect` で true にする＝hydrate後に確実に変わる）
- Playwright 側（`tests/e2e/helpers/auth.ts`）は
  `data-testid="login-signin" かつ data-hydrated="true"` になるまで待ってから click するように変更。

期待効果:
- `Sign in` が見えていても onClick がまだ効かない（hydrate前）状態を確実に弾けるため、
  Hosted UI への遷移開始が安定し、Tier1 フレークが大幅に減る見込み。

---

### 失敗時の調査効率を上げるため Playwright の成果物（trace/video/report）をArtifactsとして保存

状況:
- `E2E (PR)` の Tier1 Hosted UI ログインが引き続きフレークする可能性があり、
  GitHub annotations だけでは原因特定が難しい（ページ内部のエラー/遷移/DOM状態が追えない）。

対応:
- `playwright.config.ts` の trace を CI 時のみ `retain-on-failure` に変更（失敗時は常に trace を残す）
- `.github/workflows/e2e_ephemeral_stg.yml` に `actions/upload-artifact@v4` を追加し、
  以下を必ずアップロードする（成功/失敗に関わらず）:
  - `playwright-report`
  - `test-results`

狙い:
- 失敗したテストの trace/video/screenshot をダウンロードして、
  クリックが効いていないのか、JSエラーが出ているのか、リダイレクトが止まっているのかを
  具体的に観察できるようにする。

---

### Hosted UI遷移が始まらない場合に備え、console/pageerror を収集してエラーに添付

状況:
- `waitForURL(waitUntil=commit)` のタイムアウトは「遷移が始まっていない」ことしか分からず、
  実際には `/login` のクリックハンドラ内で例外が出ている可能性がある。

対応:
- `tests/e2e/helpers/auth.ts` で `page.on('console')` / `page.on('pageerror')` を仕込み、
  `console.error` と `pageerror` を最大20行だけ収集。
- 3回リトライしても遷移が開始しない場合は、収集した内容を Error メッセージに添付して throw する。

狙い:
- GitHub annotations（スタックトレース）だけで、原因が「クリック空振り」なのか
  「例外で signInRedirect が落ちている」なのかを切り分けられるようにする。

---

### 根本原因: E2E用bundleの `NEXT_PUBLIC_*` が build 時に埋め込まれておらず `/login` が `client_id` エラーになっていた

状況:
- Tier1 の Hosted UI ログインが `waitForURL(waitUntil=commit)` でタイムアウトし続ける。
- Playwright artifacts（`test-failed-1.png`）を見ると、`/login` に以下が表示されていた:
  - `Encountering error... client_id`
  - `src/app/login/page.tsx` の `auth.error.message` がそのまま表示されている状態。

原因:
- `react-oidc-context` / `oidc-client-ts` の設定で `client_id` が必須だが、
  - `NEXT_PUBLIC_COGNITO_APP_CLIENT_ID` が build 時に埋め込まれていない bundle がデプロイされていた。
- `.github/workflows/e2e_ephemeral_stg.yml` の Build step で
  - `NEXT_PUBLIC_*` を `$GITHUB_ENV` に書いていたが、**同じ step 内の `next build` には反映されない**。
  - その結果、`next build` が `NEXT_PUBLIC_*` 未設定のまま実行され、client bundle 内の `client_id` が `undefined` になっていた。

対応:
- `.github/workflows/e2e_ephemeral_stg.yml` の Build step を修正し、
  - `$GITHUB_ENV` への追記に加えて、同じ step 内で `export KEY=VALUE` も行うようにした。
- これで `next build` が正しい `NEXT_PUBLIC_*` を見てビルドされ、`/login` の `client_id` エラーが解消される見込み。

---

### 2026-02-12（JST）

#### 検証: `E2E (PR)` が成功し、ephemeral stg の作成→E2E→削除が一連で完走

状況:
- PR #16（`codex/260212_pre_deploy_e2e_plan_complete`）にて、
  - 差分→Tier1絞り込み（paths filter → `tier1_grep` → `--grep`）の最終調整
  - Tier1テストのタグ補完（0件マッチ回避）
  - Tier1の認証（storageState生成）の安定化
  を行った。

確認:
- GitHub Actions `E2E (PR)` の `e2e / e2e` job が success（Tier0 + Tier1）で完走
- E2E終了後に EB環境（`yamacomi-stg`）が `Terminated` になっている（cleanup成功）

#### 実行コマンド/出力（抜粋）

```bash
$ gh pr checks 16
decide  pass  7s      https://github.com/yoshidont-mind/yamacomi/actions/runs/21934088729/job/63344446023
e2e / e2e  pass  13m46s  https://github.com/yoshidont-mind/yamacomi/actions/runs/21934088729/job/63344456181

$ aws elasticbeanstalk describe-environments \
  --application-name yamacomi \
  --environment-names yamacomi-stg \
  --profile eb-cli \
  --region ap-northeast-1 \
  --query 'Environments[0].{EnvironmentName:EnvironmentName,Status:Status,Health:Health,DateUpdated:DateUpdated}' \
  --output json
{
  "EnvironmentName": "yamacomi-stg",
  "Status": "Terminated",
  "Health": "Grey",
  "DateUpdated": "2026-02-12T05:08:12.552000+00:00"
}
```

---

#### 課題: `E2E (nightly)`（Tier2）が成功しない（初回は必ず緑にしたい）

目的:
- Nightly（Tier2）の定期実行を「運用監視」として意味のあるものにするため、少なくとも1回は成功（緑）させる。

状況:
- `E2E (nightly)` は `e2e_ephemeral_stg.yml` を `tier=tier2` で呼び出している。
- Nightly は **Hosted UI（Cognito）** を跨ぐため、ブラウザ差・環境作成直後の揺れ・429 が出やすい。

失敗の詳細（代表例）:
- run: https://github.com/yoshidont-mind/yamacomi/actions/runs/21940404702
  - **webkit**: Hosted UI で `fill()` が空振りして `Hosted UI username input was not filled (empty)` で失敗
  - **firefox**: `/admin` が `Request failed with status code 429` を表示し、権限不足メッセージが出ず失敗

方針:
- 「本番のレート制限そのもの」を検証したいわけではないので、E2E環境はレート制限を緩め、E2Eの主要機能検証に集中する。
- Hosted UI の入力については、WebKitの空振りを想定して **セレクタ強化 + 入力リトライ**で安定化する。

対応（コード修正）:
- `tests/e2e/helpers/auth.ts`
  - `getByLabel(/ユーザー名|username/i)` / `getByLabel(/パスワード|password/i)` をセレクタ候補に追加
  - `fill()` 後に `inputValue()` が空の場合、最大3回リトライする（PIIをログに出さない）
- `tests/e2e/tier2.rbac.spec.ts`
  - `/admin` で 429 が一時的に出るケースを短いリトライで吸収（それでも治らなければテストを落とす）
- `.github/workflows/e2e_ephemeral_stg.yml`
  - ephemeral stg 作成時に `RATE_LIMIT_*` を上書きして **429 を出しにくくする**
    - `RATE_LIMIT_MAX_GET=5000`
    - `RATE_LIMIT_MAX_WRITE=1000`

次のアクション:
- 上記修正をPRとしてmainへ反映 → `E2E (nightly)` を手動実行して緑を確認する。
