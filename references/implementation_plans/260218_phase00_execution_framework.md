# Phase 00 実装手順書: 実行基盤セットアップ

作成日: 2026-02-18（JST）  
対象リポジトリ: `pokemon-card-game-online`  
対象フェーズ: `references/documents/260218_4_full_implementation_roadmap.md` の Phase 00  
ステータス: 未着手（この手順書は実装前準備）

---

## 1. 本手順書の目的

本手順書は、ロードマップの Phase 00 を **再現可能・検証可能** な形で完了させるための、実装者向けステップバイステップ解説書である。

Phase 00 の完了定義（Exit Criteria）は以下。

1. 各フェーズで使う手順書テンプレートが存在する。  
2. 81操作の管理台帳に全ID（OP-A01〜OP-I07）が列挙済み。  
3. `260218_3` の全要件がチェック可能な粒度で台帳化済み。  

---

## 2. 適用範囲（In/Out）

### 2.1 In Scope

- 実装フェーズ運用テンプレートの整備
- 操作カバレッジ台帳（81項目）作成
- DB/セッション要件トラッキング台帳作成
- 検証コマンドおよび完了判定プロセスの整備

### 2.2 Out of Scope

- Phase 01以降のアプリ実装そのもの
- Firebase Console 上の設定変更
- Firestore Rules の本体実装
- PR作成/マージ（必要なら別手順として実施）

注記: 本フェーズは **リポジトリ内文書整備が中心** であり、GUI操作（Firebase Console等）は原則発生しない。

---

## 3. 参照ドキュメント

- ロードマップ: `references/documents/260218_4_full_implementation_roadmap.md`
- DB/セッション要件: `references/documents/260218_3_db_session_requirements_spec.md`
- 操作網羅リスト: `references/documents/260218_2_card_effect_operation_matrix.md`
- 参考手順書（文体・粒度）:
  - `references/temporary/260218_1_implementation_plan_from_another_project.md`

---

## 4. 成果物（作成すべきファイル）

Phase 00 で作成する成果物は以下の 3 種。

1. フェーズ手順書テンプレート  
   - `references/implementation_plans/260218_phase_template.md`
2. 操作カバレッジ台帳（81操作）  
   - `references/implementation_plans/260218_master_operation_coverage_tracker.md`
3. DB/セッション要件台帳（`260218_3`全要件）  
   - `references/implementation_plans/260218_master_db_requirements_tracker.md`

補助成果物（任意だが推奨）:
- 生成補助スクリプト（使い捨て）: `references/temporary/*.sh`

---

## 5. 事前準備

## 5.1 前提コマンド

以下コマンドが使用可能であること。

- `git`
- `rg`（ripgrep）
- `sed`
- `awk`
- `wc`

確認コマンド:

```bash
command -v git rg sed awk wc
```

## 5.2 作業ディレクトリ

```bash
cd /Users/yoshidont_mind/Desktop/personal_projects/pokemon-card-game-online
```

## 5.3 既存状態確認

```bash
git status --short
ls -la references/implementation_plans
ls -la references/implementation_logs
```

期待結果:
- `references/implementation_plans` と `references/implementation_logs` が存在
- 既存ファイル有無を把握できる

---

## 6. 実装手順（CLI実行順）

以下は、実装担当者がそのまま順に実行できる形で記載する。

## Step 1. フェーズ手順書テンプレートを作成

### 目的

以降の Phase 01〜09 で使い回す「標準フォーマット」を固定し、粒度のばらつきを防ぐ。

### 作業

`references/implementation_plans/260218_phase_template.md` を作成し、以下の章立てを必須化する。

- メタ情報（作成日・対象Phase・ステータス）
- 目的
- In/Out Scope
- 参照資料
- 事前準備
- 実装手順（順序付き）
- テスト手順（自動/手動）
- ロールバック
- Exit Criteria
- 実装ログ記録欄

### 推奨チェック

```bash
rg -n '^## ' references/implementation_plans/260218_phase_template.md
```

期待結果:
- 必須章が漏れなく列挙される

---

## Step 2. 81操作カバレッジ台帳を作成

### 目的

`260218_2` の 81操作（OP-A01〜OP-I07）の実装/検証状況を一元管理する。

### 台帳仕様（必須列）

| 列名 | 必須 | 説明 |
|---|---|---|
| `OpID` | Yes | 例: `OP-A01` |
| `カテゴリ` | Yes | A〜I |
| `操作名` | Yes | `260218_2` の操作名 |
| `実装Phase` | Yes | 予定フェーズ（05/06等） |
| `実装状態` | Yes | `Not Started / In Progress / Done` |
| `検証状態` | Yes | `Not Started / Pass / Fail / Blocked` |
| `証跡` | Yes | 検証ログへのリンク |
| `備考` | No | 補足 |

### 作業

1. `references/documents/260218_2_card_effect_operation_matrix.md` から OP行を抽出
2. `references/implementation_plans/260218_master_operation_coverage_tracker.md` に表形式で出力
3. 初期状態として `実装状態=Not Started`, `検証状態=Not Started` を設定

### 抽出補助コマンド（推奨）

```bash
rg '^\| `OP-[A-I][0-9]{2}` \|' references/documents/260218_2_card_effect_operation_matrix.md
```

### 件数検証（必須）

```bash
rg -o 'OP-[A-I][0-9]{2}' references/implementation_plans/260218_master_operation_coverage_tracker.md | sort -u | wc -l
```

期待結果:
- `81`

### 欠損検証（必須）

- `OP-A01` から `OP-I07` まで欠損がないこと
- 重複IDがないこと

補助コマンド例:

```bash
rg -o 'OP-[A-I][0-9]{2}' references/implementation_plans/260218_master_operation_coverage_tracker.md | sort | uniq -d
```

期待結果:
- 何も出力されない（重複なし）

---

## Step 3. DB/セッション要件台帳を作成

### 目的

`260218_3` の要件（MUST/SHOULD）を、実装完了判定に使えるチェックリストへ変換する。

### 台帳仕様（必須列）

| 列名 | 必須 | 説明 |
|---|---|---|
| `ReqID` | Yes | 固定ID（例: `DB-REQ-001`） |
| `優先度` | Yes | `MUST` / `SHOULD` |
| `要件本文` | Yes | 原文要約ではなく判定可能な文 |
| `根拠箇所` | Yes | `260218_3` の節/行参照 |
| `実装Phase` | Yes | 想定対応フェーズ |
| `実装状態` | Yes | `Not Started / In Progress / Done` |
| `検証状態` | Yes | `Not Started / Pass / Fail / Blocked` |
| `検証方法` | Yes | コマンド or 手動手順 |
| `証跡` | Yes | ログファイル参照 |

### 作業

1. `260218_3` から `MUST:` / `SHOULD:` を抽出
2. 不変条件/完了判定/移行要件も含めて req 項目化
3. `references/implementation_plans/260218_master_db_requirements_tracker.md` に整形

### 抽出補助コマンド（推奨）

```bash
rg -n 'MUST:|SHOULD:' references/documents/260218_3_db_session_requirements_spec.md
```

### 最低検証項目

- MUST/SHOULD 行の抽出漏れがない
- `260218_3` セクション 11（完了判定）のチェック項目が台帳へ反映されている
- すべての台帳行に `実装Phase` が割り当てられている

---

## Step 4. Phase 00の完了判定チェックを実施

### 完了判定コマンド（必須）

```bash
# 1) テンプレート存在
ls references/implementation_plans/260218_phase_template.md

# 2) 81操作ID検証
rg -o 'OP-[A-I][0-9]{2}' references/implementation_plans/260218_master_operation_coverage_tracker.md | sort -u | wc -l

# 3) DB要件台帳存在
ls references/implementation_plans/260218_master_db_requirements_tracker.md

# 4) 差分確認
git status --short
```

### 判定基準

- 1) が存在する
- 2) が `81`
- 3) が存在する
- 4) に想定ファイルのみ出る

---

## Step 5. 実装ログへ記録

### 目的

後続フェーズで追跡可能な監査証跡を残す。

### 記録先

- `references/implementation_logs/260218_phase00_execution_framework.md`

### 記録ルール

- 実施日時
- 実施者
- 実行コマンド（要点）
- 検証結果（Pass/Fail）
- 残課題

---

## 7. テスト/検証プロセス（詳細）

## 7.1 静的検証

```bash
# 操作台帳の表ヘッダと最低件数
rg -n '^\| OpID \|' references/implementation_plans/260218_master_operation_coverage_tracker.md
rg -o 'OP-[A-I][0-9]{2}' references/implementation_plans/260218_master_operation_coverage_tracker.md | sort -u | wc -l

# DB要件台帳の表ヘッダ確認
rg -n '^\| ReqID \|' references/implementation_plans/260218_master_db_requirements_tracker.md
```

## 7.2 論理検証

- 81操作の各IDに `実装Phase` が設定されている
- DB要件台帳で `MUST` が全て `ReqID` を持つ
- `根拠箇所` が空欄の行がない

補助コマンド:

```bash
# 空セルざっくり検知（簡易）
rg -n '\|\s*\|' references/implementation_plans/260218_master_db_requirements_tracker.md
```

## 7.3 レビュー検証

- 1名以上のレビューで「この台帳だけでPhase進捗が追える」ことを確認

---

## 8. ロールバック方針

- 文書のみ変更のため、ロールバックは Git で対象ファイル差し戻し
- 誤生成が発生した場合は対象ファイル単位で修正コミット
- 途中ファイル（`references/temporary/*`）を生成した場合は、最終的に不要なら削除

---

## 9. 想定トラブルと対処

1. `rg` が未インストール  
   - 対処: `grep` に置換して実施（ただし性能低下に注意）
2. OP件数が81にならない  
   - 対処: `260218_2` の抽出正規表現を再確認し、A〜I の全カテゴリ漏れを確認
3. MUST/SHOULD 抽出漏れ  
   - 対処: `260218_3` の該当節（5,8,9,11）を目視再確認
4. 台帳列定義がぶれる  
   - 対処: 本手順書の「台帳仕様（必須列）」に合わせて修正

---

## 10. 実行順サマリ（最短版）

1. `260218_phase_template.md` 作成
2. `260218_master_operation_coverage_tracker.md` 作成（81件確認）
3. `260218_master_db_requirements_tracker.md` 作成
4. 完了判定コマンド実行
5. `implementation_logs/260218_phase00_execution_framework.md` に記録

---

## 11. Phase 00 完了報告テンプレート

以下を `implementation_logs` に記録する。

```md
## Phase 00 完了報告
- 実施日:
- 実施者:
- 成果物:
  - references/implementation_plans/260218_phase_template.md
  - references/implementation_plans/260218_master_operation_coverage_tracker.md
  - references/implementation_plans/260218_master_db_requirements_tracker.md
- 検証:
  - OP件数: 81（Pass/Fail）
  - DB要件台帳: 作成済（Pass/Fail）
  - Exit Criteria: 全件Pass/未達あり
- 残課題:
```

---

## 12. 品質基準（この手順書自体の品質）

- 実装者が追加質問なしで着手できること
- コマンドがコピペ可能であること
- 判定条件が数値/存在確認で明確であること
- 後続フェーズで再利用可能であること

