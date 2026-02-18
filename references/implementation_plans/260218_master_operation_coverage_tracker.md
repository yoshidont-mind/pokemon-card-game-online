# 操作カバレッジ台帳（81操作）

作成日: 2026-02-18（JST）
対象: references/documents/260218_2_card_effect_operation_matrix.md

## 運用ルール
- `実装状態`: `Not Started / In Progress / Done`
- `検証状態`: `Not Started / Pass / Fail / Blocked`
- `証跡`: 実装ログや検証ログのファイルパスを記載

| OpID | カテゴリ | 操作名 | 実装Phase | 実装状態 | 検証状態 | 証跡 | 備考 |
|---|---|---|---|---|---|---|---|
| `OP-A01` | A | コイン判定 | Phase 05 | Not Started | Not Started | - | - |
| `OP-A02` | A | 対象選択 | Phase 05 | Not Started | Not Started | - | - |
| `OP-A03` | A | 公開 | Phase 05 | Not Started | Not Started | - | - |
| `OP-A04` | A | 閲覧 | Phase 05 | Not Started | Not Started | - | - |
| `OP-A05` | A | ランダム選択 | Phase 05 | Not Started | Not Started | - | - |
| `OP-A06` | A | 順序選択 | Phase 05 | Not Started | Not Started | - | - |
| `OP-A07` | A | 判定結果置換 | Phase 06 | Not Started | Not Started | - | - |
| `OP-A08` | A | サイコロ判定 | Phase 06 | Not Started | Not Started | - | - |
| `OP-B01` | B | 山札シャッフル | Phase 05 | Not Started | Not Started | - | - |
| `OP-B02` | B | 山札サーチ | Phase 05 | Not Started | Not Started | - | - |
| `OP-B03` | B | ドロー | Phase 05 | Not Started | Not Started | - | - |
| `OP-B04` | B | 山札上破棄 | Phase 05 | Not Started | Not Started | - | - |
| `OP-B05` | B | 山札上/下に置く | Phase 05 | Not Started | Not Started | - | - |
| `OP-B06` | B | デッキ構築例外 | Phase 06 | Not Started | Not Started | - | - |
| `OP-B07` | B | 山札上並べ替え | Phase 05 | Not Started | Not Started | - | - |
| `OP-B08` | B | プレイ条件判定 | Phase 06 | Not Started | Not Started | - | - |
| `OP-B09` | B | 手札トラッシュ | Phase 05 | Not Started | Not Started | - | - |
| `OP-B10` | B | 手札山札戻し | Phase 05 | Not Started | Not Started | - | - |
| `OP-B11` | B | 相手手札破壊 | Phase 05 | Not Started | Not Started | - | - |
| `OP-B12` | B | 相手手札確認 | Phase 05 | Not Started | Not Started | - | - |
| `OP-B13` | B | 手札枚数調整 | Phase 06 | Not Started | Not Started | - | - |
| `OP-C01` | C | にげる制御 | Phase 06 | Not Started | Not Started | - | - |
| `OP-C02` | C | 入れ替え | Phase 05 | Not Started | Not Started | - | - |
| `OP-C03` | C | ベンチ展開 | Phase 05 | Not Started | Not Started | - | - |
| `OP-C04` | C | 相手呼び出し | Phase 05 | Not Started | Not Started | - | - |
| `OP-C05` | C | バトル場配置 | Phase 05 | Not Started | Not Started | - | - |
| `OP-C06` | C | ベンチ上限変更 | Phase 06 | Not Started | Not Started | - | - |
| `OP-C07` | C | ベンチ攻撃許可 | Phase 06 | Not Started | Not Started | - | - |
| `OP-D01` | D | サイド操作 | Phase 05 | Not Started | Not Started | - | - |
| `OP-D02` | D | トラッシュ移動 | Phase 05 | Not Started | Not Started | - | - |
| `OP-D03` | D | 進化/退化 | Phase 05 | Not Started | Not Started | - | - |
| `OP-D04` | D | トラッシュ回収 | Phase 05 | Not Started | Not Started | - | - |
| `OP-D05` | D | 山札戻し | Phase 05 | Not Started | Not Started | - | - |
| `OP-D06` | D | ロスト送り | Phase 05 | Not Started | Not Started | - | - |
| `OP-D07` | D | 手札戻し | Phase 05 | Not Started | Not Started | - | - |
| `OP-D08` | D | 自己離脱 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E01` | E | エネルギー破棄 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E02` | E | エネルギー付与 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E03` | E | エネルギー条件参照 | Phase 06 | Not Started | Not Started | - | - |
| `OP-E04` | E | どうぐ/スタジアム破棄 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E05` | E | エネルギー移動 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E06` | E | どうぐ装備 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E07` | E | スタジアム設置/置換 | Phase 05 | Not Started | Not Started | - | - |
| `OP-E08` | E | エネルギー提供変更 | Phase 06 | Not Started | Not Started | - | - |
| `OP-E09` | E | エネルギー手札戻し | Phase 06 | Not Started | Not Started | - | - |
| `OP-E10` | E | ワザコスト増減 | Phase 06 | Not Started | Not Started | - | - |
| `OP-E11` | E | どうぐ枠拡張 | Phase 06 | Not Started | Not Started | - | - |
| `OP-E12` | E | どうぐ付け替え | Phase 06 | Not Started | Not Started | - | - |
| `OP-E13` | E | エネルギー山札戻し | Phase 06 | Not Started | Not Started | - | - |
| `OP-E14` | E | どうぐ無効化 | Phase 06 | Not Started | Not Started | - | - |
| `OP-F01` | F | ダメージ適用 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F02` | F | 特殊状態付与 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F03` | F | きぜつ処理 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F04` | F | ダメカン配置 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F05` | F | 回復 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F06` | F | 反動 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F07` | F | 特殊状態解除/耐性 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F08` | F | ダメカン移動 | Phase 05 | Not Started | Not Started | - | - |
| `OP-F09` | F | きぜつ回避 | Phase 06 | Not Started | Not Started | - | - |
| `OP-F10` | F | 回復禁止 | Phase 06 | Not Started | Not Started | - | - |
| `OP-F11` | F | 全体状態異常耐性 | Phase 06 | Not Started | Not Started | - | - |
| `OP-G01` | G | 与ダメ増加 | Phase 06 | Not Started | Not Started | - | - |
| `OP-G02` | G | サポート/グッズ基本制約 | Phase 05 | Not Started | Not Started | - | - |
| `OP-G03` | G | ワザロック | Phase 05 | Not Started | Not Started | - | - |
| `OP-G04` | G | 使用禁止一般 | Phase 05 | Not Started | Not Started | - | - |
| `OP-G05` | G | 被ダメ軽減 | Phase 06 | Not Started | Not Started | - | - |
| `OP-G06` | G | 効果無効 | Phase 06 | Not Started | Not Started | - | - |
| `OP-G07` | G | 特性ロック | Phase 06 | Not Started | Not Started | - | - |
| `OP-G08` | G | トレーナーズロック | Phase 06 | Not Started | Not Started | - | - |
| `OP-H01` | H | タイプ/弱点/抵抗力変更 | Phase 06 | Not Started | Not Started | - | - |
| `OP-H02` | H | カード名変更 | Phase 06 | Not Started | Not Started | - | - |
| `OP-H03` | H | ワザコピー | Phase 06 | Not Started | Not Started | - | - |
| `OP-H04` | H | 特性コピー | Phase 06 | Not Started | Not Started | - | - |
| `OP-H05` | H | HP補正 | Phase 06 | Not Started | Not Started | - | - |
| `OP-I01` | I | 回数制限 | Phase 05 | Not Started | Not Started | - | - |
| `OP-I02` | I | 特別ルールカード処理 | Phase 06 | Not Started | Not Started | - | - |
| `OP-I03` | I | ターン終了/延長 | Phase 05 | Not Started | Not Started | - | - |
| `OP-I04` | I | 追加サイド取得 | Phase 06 | Not Started | Not Started | - | - |
| `OP-I05` | I | 装備カード由来ワザ付与 | Phase 06 | Not Started | Not Started | - | - |
| `OP-I06` | I | 先攻1ターン例外 | Phase 06 | Not Started | Not Started | - | - |
| `OP-I07` | I | 大会使用不可フラグ | Phase 06 | Not Started | Not Started | - | - |
