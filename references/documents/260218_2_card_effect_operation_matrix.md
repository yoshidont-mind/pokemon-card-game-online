# カード効果から抽出した「実装操作」網羅リスト

作成日: 2026-02-18  
対象: ポケモンカードオンライン対戦シミュレーター要件定義

---

## 1. 目的

カードテキスト由来の効果を、実装可能な「操作プリミティブ」に分解して定義する。

---

## 2. 確認方法（データソース）

- 公式カード検索 API（ID母集団）: `https://www.pokemon-card.com/card-search/resultAPI.php`
  - 2026-02-18 時点で `22,723` 件のカードIDを確認
- カードテキスト母集団: `PokemonTCG/pokemon-tcg-data`（公開JSON）
  - https://github.com/PokemonTCG/pokemon-tcg-data
  - `cards/en/*.json` 全 `20,078` 枚を走査
  - 効果文スニペット総数: `33858`

注記: 公式詳細ページへの大量アクセスは CloudFront 403 制限が発生したため、全文効果の機械抽出は公開データセットを併用した。

---

## 3. 網羅率

- 操作辞書で分類できた効果文: `33425` / `33858`
- 未分類: `433` (`98.72%` カバー)
- 未分類は主に「非常に古いカードの個別文言」「同義表現の揺れ」「極端に特殊な継続効果」。
- これを吸収するため、末尾に `カスタム効果スクリプト` の実装要件を追加している。

---

## 4. 実装すべき操作プリミティブ（全81項目）

凡例:
- `Hit`: 効果文ヒット件数（重複文含む）
- `例`: 効果文サンプル（英語原文）

### A. 判定・選択・公開

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-A01` | コイン判定 | コインを投げて結果分岐する | 5303 | Flip a coin. If heads, this attack does 20 more damage. |
| `OP-A02` | 対象選択 | カード/ポケモン/領域を選ぶ | 1380 | Discard any amount of Water Energy from this Pokémon. Then, for each Energy card you discarded in this way,... |
| `OP-A03` | 公開 | カードを公開する | 937 | Your opponent reveals their hand. This attack does 40 damage for each Trainer card you find there. |
| `OP-A04` | 閲覧 | 非公開領域を閲覧する | 453 | Look at the top card of your deck. You may discard that card. |
| `OP-A05` | ランダム選択 | 相手/自分の非公開領域からランダムに選ぶ | 181 | Discard a random card from your opponent's hand. |
| `OP-A06` | 順序選択 | 複数カードの戻し順・処理順を選ぶ | 109 | Put as many cards from your hand as you like on the bottom of your deck in any order. Then, draw a card for... |
| `OP-A07` | 判定結果置換 | コイン結果を強制変更する | 21 | Whenever your opponent flips a coin during his or her next turn, treat it as tails. |
| `OP-A08` | サイコロ判定 | ダイス結果で分岐する | 0 | - |

### B. 山札・手札操作

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-B01` | 山札シャッフル | 山札を切り直す | 2523 | Search your deck for a Caterpie and put it onto your Bench. Then, shuffle your deck. |
| `OP-B02` | 山札サーチ | 条件に合うカードを山札から探す | 2120 | Search your deck for a Caterpie and put it onto your Bench. Then, shuffle your deck. |
| `OP-B03` | ドロー | 山札からカードを引く | 1358 | You may draw cards until you have 6 cards in your hand. |
| `OP-B04` | 山札上破棄 | 山札上から捨てる | 380 | When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you must flip a coi... |
| `OP-B05` | 山札上/下に置く | カードを山札の上または下に置く | 256 | Once during your turn, if this Pokémon is in your hand, you may reveal it and put it on the bottom of your ... |
| `OP-B06` | デッキ構築例外 | 同名制限/枚数制限の例外を判定する | 178 | You can't have more than 1 ACE SPEC card in your deck. |
| `OP-B07` | 山札上並べ替え | 山札上N枚の順序を決める | 159 | Look at the top 5 cards of your deck and put them back on top of your deck in any order. |
| `OP-B08` | プレイ条件判定 | カードの使用可否条件を判定する | 156 | Draw 2 cards. If you go second and it's your first turn, draw 3 more cards. |
| `OP-B09` | 手札トラッシュ | 手札を捨てる | 144 | Discard your hand and draw 7 cards. |
| `OP-B10` | 手札山札戻し | 手札を山札に戻して切る | 125 | Shuffle your hand into your deck. Then, draw 5 cards. |
| `OP-B11` | 相手手札破壊 | 相手手札を捨てさせる | 115 | Discard a random card from your opponent's hand. |
| `OP-B12` | 相手手札確認 | 相手手札を見て選択する | 79 | Flip a coin. If heads, look at your opponent's hand, choose 1 card, and discard it. |
| `OP-B13` | 手札枚数調整 | 手札枚数を指定値まで増減させる | 0 | - |

### C. 場の配置・入れ替え

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-C01` | にげる制御 | にげる禁止/にげるコスト増減を扱う | 770 | The Retreat Cost of each of your Pokémon that has any Fire Energy attached is ColorlessColorless less. |
| `OP-C02` | 入れ替え | 自分または相手のバトル場を入れ替える | 740 | You may switch this Pokémon with 1 of your Benched Pokémon. |
| `OP-C03` | ベンチ展開 | 手札/効果でベンチに出す | 521 | Search your deck for a Caterpie and put it onto your Bench. Then, shuffle your deck. |
| `OP-C04` | 相手呼び出し | 相手ベンチをバトル場へ引きずり出す | 135 | Switch this Pokémon with 1 of your Benched Pokémon. If you do, your opponent switches their Active Pokémon ... |
| `OP-C05` | バトル場配置 | アクティブに出す | 67 | Once during your turn (before your attack), if Machamp is on your Bench, you may move all Fighting Energy a... |
| `OP-C06` | ベンチ上限変更 | ベンチ許容量を増減する | 14 | As long as this Pokémon is in the Active Spot, your opponent can't have more than 3 Benched Pokémon. If the... |
| `OP-C07` | ベンチ攻撃許可 | ベンチでもワザ使用可能にする | 8 | This attack can be used even if this Pokémon is on the Bench. |

### D. ゾーン移動（進化/ロスト/サイド含む）

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-D01` | サイド操作 | サイド取得/サイド設置を行う | 3431 | V rule: When your Pokémon V is Knocked Out, your opponent takes 2 Prize cards. |
| `OP-D02` | トラッシュ移動 | カードをトラッシュへ移動する | 2458 | Discard any number of Pokémon Tool cards from your hand. This attack does 50 damage for each card you disca... |
| `OP-D03` | 進化/退化 | 進化・退化・進化参照を処理する | 1140 | When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may make your o... |
| `OP-D04` | トラッシュ回収 | トラッシュから回収する | 873 | Put up to 2 Pokémon from your discard pile into your hand. |
| `OP-D05` | 山札戻し | 場/領域のカードを山札へ戻す | 574 | Heal all damage from each of your Benched Pokémon. If you healed any damage in this way, shuffle this Pokém... |
| `OP-D06` | ロスト送り | カードをロストゾーンへ送る | 131 | Flip a coin. If heads, choose 1 Energy card attached to 1 of your opponent's Pokémon and put it in the Lost... |
| `OP-D07` | 手札戻し | 場/領域のカードを手札へ戻す | 109 | Rescue Energy provides Colorless Energy. If the Pokémon this card is attached to is Knocked Out by damage f... |
| `OP-D08` | 自己離脱 | 自身を手札/山札へ戻す・離脱する | 106 | Heal all damage from each of your Benched Pokémon. If you healed any damage in this way, shuffle this Pokém... |

### E. エネルギー・どうぐ・スタジアム

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-E01` | エネルギー破棄 | 付いているエネルギーを捨てる | 2378 | Discard a Grass Energy from your opponent's Active Pokémon. |
| `OP-E02` | エネルギー付与 | エネルギーを付ける | 972 | Attach a Lightning Energy card from your discard pile to this Pokémon. |
| `OP-E03` | エネルギー条件参照 | 付いているエネルギー枚数/種類を参照する | 609 | If this Pokémon has at least 3 extra Energy attached (in addition to this attack's cost), this attack also ... |
| `OP-E04` | どうぐ/スタジアム破棄 | 場のどうぐやスタジアムを捨てる | 483 | Discard any number of Pokémon Tool cards from your hand. This attack does 50 damage for each card you disca... |
| `OP-E05` | エネルギー移動 | 付いているエネルギーの移動先を変える | 416 | Move an Energy from this Pokémon to 1 of your Benched Pokémon. |
| `OP-E06` | どうぐ装備 | ポケモンのどうぐを付ける | 390 | Attach a Pokémon Tool to 1 of your Pokémon that doesn't already have a Pokémon Tool attached. |
| `OP-E07` | スタジアム設置/置換 | スタジアムの設置・置換を扱う | 304 | Discard any Stadium card in play. |
| `OP-E08` | エネルギー提供変更 | 提供タイプや提供量を変更する | 240 | This card can only be attached to a Fusion Strike Pokémon. If this card is attached to anything other than ... |
| `OP-E09` | エネルギー手札戻し | 付いているエネルギーを手札へ戻す | 74 | Put all Energy attached to this Pokémon into your hand. This attack does 100 damage to 1 of your opponent's... |
| `OP-E10` | ワザコスト増減 | ワザ必要エネルギーを増減する | 68 | During your opponent's next turn, the attack cost of each of the Defending Pokémon's attacks is ColorlessCo... |
| `OP-E11` | どうぐ枠拡張 | どうぐ複数装備ルールを扱う | 14 | This Pokémon may have up to 4 Pokémon Tool cards attached to it. (If this Pokémon loses this Ability, disca... |
| `OP-E12` | どうぐ付け替え | どうぐを他ポケモンへ移す/手札へ戻す | 9 | As often as you like during your turn (before your attack), you may put a Pokémon Tool card attached to 1 o... |
| `OP-E13` | エネルギー山札戻し | 付いているエネルギーを山札上へ置く | 4 | When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may put an Ener... |
| `OP-E14` | どうぐ無効化 | 付いているどうぐ効果を無効化する | 4 | As long as the Pokémon this card is attached to is in the Active Spot, Pokémon Tools attached to your oppon... |

### F. ダメージ・きぜつ・特殊状態

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-F01` | ダメージ適用 | ワザ/効果ダメージを与える | 9099 | This Pokémon takes 20 less damage from attacks (after applying Weakness and Resistance). |
| `OP-F02` | 特殊状態付与 | どく/やけど/ねむり/マヒ/こんらんを付与 | 3585 | When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may make your o... |
| `OP-F03` | きぜつ処理 | 即時きぜつやきぜつ判定を行う | 2903 | V rule: When your Pokémon V is Knocked Out, your opponent takes 2 Prize cards. |
| `OP-F04` | ダメカン配置 | ダメカンを任意配置する | 2251 | Put 5 damage counters on your opponent's Pokémon in any way you like. |
| `OP-F05` | 回復 | ダメージ/ダメカンを取り除く | 1207 | Heal all damage from each of your Benched Pokémon. If you healed any damage in this way, shuffle this Pokém... |
| `OP-F06` | 反動 | 自分にもダメージを与える | 500 | This Pokémon also does 30 damage to itself. |
| `OP-F07` | 特殊状態解除/耐性 | 特殊状態の解除・付与不可を扱う | 468 | Each of your Pokémon that has any Grass Energy attached to it can't be affected by any Special Conditions. ... |
| `OP-F08` | ダメカン移動 | ダメカンをポケモン間で移す | 413 | The Defending Pokémon is now Burned and Poisoned. Remove 3 damage counters from Victreebel. |
| `OP-F09` | きぜつ回避 | きぜつを防止・置換する | 77 | If this Pokémon would be Knocked Out by damage from an attack, flip a coin. If heads, this Pokémon is not K... |
| `OP-F10` | 回復禁止 | 回復不可状態を付与する | 12 | Pokémon (both yours and your opponent's) can't be healed. |
| `OP-F11` | 全体状態異常耐性 | 味方全体への状態異常耐性を付与 | 9 | Each of your Pokémon that has any Grass Energy attached to it can't be affected by any Special Conditions. ... |

### G. ロック・無効・軽減

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-G01` | 与ダメ増加 | 与えるダメージを増やす | 3222 | If this Pokémon was damaged by an attack during your opponent's last turn, this attack does that much more ... |
| `OP-G02` | サポート/グッズ基本制約 | サポート1回制限やグッズ無制限を扱う | 1829 | You may play only 1 Supporter card during your turn. |
| `OP-G03` | ワザロック | ワザ使用禁止や攻撃不発を付与する | 1798 | Flip a coin. If tails, this attack does nothing. |
| `OP-G04` | 使用禁止一般 | 特定カード/効果の使用を禁止する | 1632 | During your next turn, this Pokémon can't use Impact Blow. |
| `OP-G05` | 被ダメ軽減 | 受けるダメージを減らす/無効化する | 891 | This Pokémon takes 20 less damage from attacks (after applying Weakness and Resistance). |
| `OP-G06` | 効果無効 | ワザ/特性の効果を受けない状態にする | 553 | This attack's damage isn't affected by any effects on your opponent's Active Pokémon. |
| `OP-G07` | 特性ロック | 特性/能力の使用を禁止する | 149 | Your opponent's Rapid Strike Pokémon in play have no Abilities. |
| `OP-G08` | トレーナーズロック | グッズ/サポート/トレーナーズ使用を制限 | 36 | Whenever your opponent plays an Item or Supporter card from their hand during their next turn, prevent all ... |

### H. コピー・タイプ/名前/HP変更

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-H01` | タイプ/弱点/抵抗力変更 | タイプや弱点・抵抗力を変更する | 3341 | This Pokémon takes 20 less damage from attacks (after applying Weakness and Resistance). |
| `OP-H02` | カード名変更 | カード名を別名として扱う | 166 | If this Pokémon evolved from Eelektrik during this turn, your opponent's Active Pokémon is now Paralyzed. |
| `OP-H03` | ワザコピー | 他カードのワザを使う | 118 | Choose 1 of your Benched Fusion Strike Pokémon's attacks and use it as this attack. |
| `OP-H04` | 特性コピー | 他カードの特性を使う | 78 | Put this card onto your Active Empoleon. Empoleon LV.X can use any attack, Poké-Power, or Poké-Body from it... |
| `OP-H05` | HP補正 | HP増減を適用する | 76 | If all your Pokémon in play are Fusion Strike Pokémon, your opponent's Pokémon VMAX in play get -30 HP. |

### I. ターン/ルール制御

| ID | 操作 | 説明 | Hit | 例 |
|---|---|---|---:|---|
| `OP-I01` | 回数制限 | 1ターン/1ゲーム制限を管理する | 1724 | Once during your turn, you may attach a Water Energy card or a Fighting Energy card from your hand to 1 of ... |
| `OP-I02` | 特別ルールカード処理 | Rule Box/GX/VSTAR/ACE SPEC等の制約処理 | 822 | You can't have more than 1 ACE SPEC card in your deck. |
| `OP-I03` | ターン終了/延長 | ターン終了や追加ターンを扱う | 380 | You can play only one Supporter card each turn. When you play this card, put it next to your Active Pokémon... |
| `OP-I04` | 追加サイド取得 | 通常より多くサイドを取る | 94 | If your opponent's Basic Pokémon is Knocked Out by damage from this attack, take 2 more Prize cards. |
| `OP-I05` | 装備カード由来ワザ付与 | 装備カードのワザを使えるようにする | 35 | The Pokémon this card is attached to can use the attack on this card. (You still need the necessary Energy ... |
| `OP-I06` | 先攻1ターン例外 | 先攻1ターン制約を上書きする | 14 | If you go first, you may play this card during your first turn. |
| `OP-I07` | 大会使用不可フラグ | フォーマット外カードを弾く | 7 | (This card cannot be used at official tournaments.) |

---

## 5. 未分類文への対策（必須）

未分類文がゼロにならないため、以下の汎用機能を必ず実装する。

1. カスタム効果スクリプト実行
   - 操作プリミティブで表現できない効果を、カードID単位で補完する。
2. 継続効果レイヤー
   - 「〜しているかぎり」「次の相手の番まで」等をレイヤー管理する。
3. 置換効果フック
   - きぜつ置換、ダメージ置換、判定結果置換をイベントフックで差し替える。
4. 参照解決器
   - 「Defending Pokémon」「that Pokémon」「this Pokémon」等の参照先を厳密解決。
5. 監査ログ
   - どの効果がどの操作に展開されたかを時系列で保存・再生可能にする。

---

## 6. このプロジェクトで最低限先に実装すべき操作（優先順）

1. 山札/手札/場/トラッシュ/サイド/ロストのカード移動
2. 対象選択・公開・ランダム選択・コイン判定
3. ダメージ/ダメカン/きぜつ/サイド取得
4. 特殊状態の付与・解除
5. 入れ替え（自分/相手）・にげる・進化/退化
6. エネルギー/どうぐ/スタジアムの付与・破棄・移動
7. 使用制限（サポート1回、攻撃不可、特性ロック等）
8. 継続効果の期間管理（次の相手の番まで、永続）

---

## 7. 参考

- 公式カード検索: https://www.pokemon-card.com/card-search/
- 公式ルール: https://www.pokemon-card.com/rules/
- 公開カードデータ: https://github.com/PokemonTCG/pokemon-tcg-data
