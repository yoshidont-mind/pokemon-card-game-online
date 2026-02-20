# Phase 05 完了判定用 手動検証シナリオ

作成日: 2026-02-19（JST）  
対象フェーズ: `references/implementation_plans/260218_phase05_operations_wave1.md`  
関連台帳: `references/implementation_plans/260218_master_operation_coverage_tracker.md`

---

## 1. 目的

Phase 05 の完了判定に必要な「2端末での実操作検証」を、再現可能な手順として固定化する。  
本書で定義するシナリオをすべて `Pass` にできれば、Phase 05 の手動検証要件を満たしたと判定する。

---

## 2. 前提条件

必須:

- 同一セッションに `player1` / `player2` が参加している
- 2端末（または2ブラウザ）で同時接続している
- `OperationPanel` が表示できる
- 手札・山札・ベンチ・トラッシュに最低1枚ずつカードがある状態で開始する

推奨:

- 初期状態の作成は `/session` からデッキ読込で行う
- リロード検証をしやすくするため、各ケースの前後でスクリーンショットを残す

注意:

- ルール自動判定は対象外。本検証は「操作が画面上で再現でき、状態保存できるか」に限定する。

---

## 3. 実施ルール

- 各ケースで以下 3 点を確認する。
1. 操作直後の表示が期待通り
2. 操作後にリロードしても同一状態
3. もう一方の端末にも同期反映される

- 期待結果は **プレイ画面上で直接確認できる現象のみ** を書く。
- `turnContext.*` や内部ドキュメント値の直接確認は、完了判定に使わない。

- `Fail` になった場合は、症状・再現手順・実行時刻をログへ記録する。

---

## 4. ケース一覧（Wave1）

## 4.1 A系（判定・選択・公開）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| A-01 | `OP-A01` | コインオブジェクトをクリックして判定 | コイン面（表/裏）が切り替わり、相手画面も同じ結果になる |
| A-02 | `OP-A02` | 対象選択を実行（note 付き） | 画面上で「選択済み」を識別できる表示が出る（未表示ならFail） |
| A-03 | `OP-A03` | 手札公開を実行 | 対象手札の公開状態が変化する |
| A-04 | `OP-A04` | 閲覧操作を実行（note 付き） | 閲覧対象が画面上で確認できる（閲覧UIが開く/閉じる） |
| A-05 | `OP-A05` | ランダム選択（source=hand,count=2） | 選択結果が画面表示され、手札の実枚数は変化しない |
| A-06 | `OP-A06` | `orderCardIds` で山札上順序を指定 | 山札上部の順序が指定通りになる |

## 4.2 B系（山札・手札）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| B-01 | `OP-B01` | 山札シャッフル | 山札構成は同一、順序が更新される |
| B-02 | `OP-B02` | source=deck,target=hand,count=1 | 山札-1、手札+1 |
| B-03 | `OP-B03` | ドロー count=2 | 山札-2、手札+2 |
| B-04 | `OP-B04` | 山札上破棄 count=1 | 山札-1、トラッシュ+1 |
| B-05 | `OP-B05` | source=hand,target=deck-top,count=1 | 手札-1、山札先頭へ移動 |
| B-07 | `OP-B07` | `orderCardIds` で山札上並べ替え | 山札上部順序が反映される |
| B-09 | `OP-B09` | 手札トラッシュ count=1 | 手札-1、トラッシュ+1 |
| B-10 | `OP-B10` | 手札山札戻し | 手札0、山札へ戻る |
| B-11 | `OP-B11` | `player1` が request 作成 → `player2` が承認/拒否 | 承認時: 相手手札ランダム破棄。拒否時: rejected 表示 |
| B-12 | `OP-B12` | `player1` が request 作成 → `player2` が承認 | `player1` 側に公開カード結果が表示される |

## 4.3 C系（場の配置・入れ替え）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| C-02 | `OP-C02` | benchIndex 指定で入れ替え | 自分 active と bench[n] が交換される |
| C-03 | `OP-C03` | 手札からベンチ展開（OperationPanel または DnD） | ベンチにカードが置かれる |
| C-04 | `OP-C04` | 相手ベンチ指定で呼び出し | 相手 active と bench[n] が交換される |
| C-05 | `OP-C05` | 自分ベンチ指定でバトル場配置 | active と bench[n] が交換される |

## 4.4 D系（ゾーン移動）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| D-01 | `OP-D01` | `set-from-hand` / `take` を各1回 | サイド設置と取得ができる |
| D-02 | `OP-D02` | source=hand,target=discard,count=1 | 手札→トラッシュ移動 |
| D-03 | `OP-D03` | evolve / devolve を各1回 | stack の重なりと戻しが機能する |
| D-04 | `OP-D04` | source=discard,target=hand,count=1 | トラッシュ→手札回収 |
| D-05 | `OP-D05` | source=discard,target=deck-bottom,count=1 | トラッシュ→山札戻し |
| D-06 | `OP-D06` | source=hand,target=lost,count=1 | 手札→ロスト移動 |
| D-07 | `OP-D07` | source=discard,target=hand,count=1 | 指定カードが手札へ戻る |
| D-08 | `OP-D08` | active 自己離脱（targetZone=hand） | active が空になりカードが手札へ移動 |

## 4.5 E系（エネルギー/どうぐ/スタジアム）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| E-01 | `OP-E01` | 対象stackから1枚破棄 | stack 添付カードがトラッシュへ移動 |
| E-02 | `OP-E02` | 手札→対象stackへ付与（Panel or DnD） | stack にカードが追加される |
| E-04 | `OP-E04` | `mode=stadium` と stack破棄を各1回 | スタジアム除去 / stack破棄が機能 |
| E-05 | `OP-E05` | stack間で添付カード移動 | source から target へ移動 |
| E-06 | `OP-E06` | どうぐ装備（Panel or DnD） | 対象stackへ装備される |
| E-07 | `OP-E07` | set / clear を各1回 | スタジアム設置と解除が機能 |

## 4.6 F系（ダメージ・状態異常）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| F-01 | `OP-F01` | ダメージ適用 value=20 | 対象 stack.damage が増加 |
| F-02 | `OP-F02` | 状態異常付与（poison など） | 対象 specialConditions が更新 |
| F-03 | `OP-F03` | きぜつ処理 | 対象 stack が除去されトラッシュへ移動 |
| F-04 | `OP-F04` | ダメカン配置 value=10 | 対象 damage が増加 |
| F-05 | `OP-F05` | 回復 value=10 | 対象 damage が減少 |
| F-06 | `OP-F06` | 反動 value=10 | 自分 active damage が増加 |
| F-07 | `OP-F07` | `clear-status` / marker 記録を各1回 | 状態解除または marker 記録が機能 |
| F-08 | `OP-F08` | ダメカン移動 value=10 | source減少・target増加 |

## 4.7 G/I系（制約・ターン）

| Case | OpID | 実施内容 | 期待結果 |
|---|---|---|---|
| G-02 | `OP-G02` | supportUsed=true,count=2 | 使用回数表示が画面上で更新される（未表示ならFail） |
| G-03 | `OP-G03` | ワザロック note 付きで実行 | ロック状態を示す表示が画面上で確認できる |
| G-04 | `OP-G04` | 使用禁止一般 note 付きで実行 | 制約表示が画面上で確認できる |
| I-01 | `OP-I01` | 回数制限 note 付きで実行 | 回数制限表示が画面上で確認できる |
| I-03 | `OP-I03` | `end-turn` / `extra-turn` を各1回 | ターン表示または状態表示が画面上で切り替わる |

---

## 5. 横断シナリオ（完了判定必須）

| Case | 内容 | 手順 | 期待結果 |
|---|---|---|---|
| X-01 | 競合再試行導線 | 2端末で同時に同一操作を確定 | 片側が競合メッセージ、再試行可能 |
| X-02 | リロード復元 | 任意操作後に両端末リロード | 完全に同じ盤面へ復元 |
| X-03 | 1ゲーム通し | セットアップ〜サイド取得まで一連進行 | 進行が破綻せず継続できる |

---

## 6. 記録テンプレート

本シナリオの結果は以下ログへ記録する。  
`references/implementation_logs/260219_phase05_manual_validation_scenarios_log.md`

記録必須項目:

- 実施日時
- 実施者
- 使用ブランチ/コミット
- Case ごとの Pass/Fail
- Fail 時の再現手順とスクリーンショットパス

---

## 7. 完了判定条件（Phase 05）

以下すべてを満たした場合のみ、Phase 05 を `Done` とする。

- 4章（Wave1 ケース）全件 `Pass`
- 5章（横断シナリオ）全件 `Pass`
- `CI=true npm test -- --watch=false` が `Pass`
- `npm run build` が `Pass`
- `references/implementation_plans/260218_master_operation_coverage_tracker.md` が最新化されている
