# NGSD 低頻度帯 多言語化 SPEC（英・西・瑞）

## 目的
頻度25以下帯の確定済み項目（4,333項目・5,640語義）に、公開中の頻度26以上482語と
同じ完全な形を付ける。各語義に英・西・瑞の label と def を追加してから公開する
（ユーザー決定 2026-11-27：「全部同じように完全な状態にしたい」）。

## 入力（変更禁止の確定データ）
自ブランチ `claude/notion-queue-268-wf1xqd` の `collation/<wave>/final/*.json`。
次の部分は確定済みであり、一字も変えない：
- strong / lemma / status
- 各 sense の n / label_ja / def_ja / layers / note
- assignments / unresolved / layer_notes / excluded

## 出力
`collation/<wave>/final-i18n/<入力と同じファイル名>` に、入力の全内容をそのまま含み、
各 sense に次の6フィールドを追加した JSON を置く：
- label_en / def_en（英語）
- label_es / def_es（スペイン語）
- label_sv / def_sv（スウェーデン語）
フィールドの追加以外の変更は一切しない（並び替え・再整形もしない）。

## 訳し方の規則
1. label は訳語候補（短い語句）、def は本質定義（1文）。JA の二層構造をそのまま写す。
2. JA の def の内容を過不足なく訳す。新しい解釈・情報を足さない。略しすぎて
   JA にある限定（対象・場面・比喩の範囲）を落とさない。
3. 語義の切り分けは確定済みの JA に従う。他の辞書（Abbott-Smith 等）の分け方に
   寄せない。材料パケットの abbott_hypothesis_en は参考に留める。
4. EN：明快な現代英語。ES：中立的な現代スペイン語。
   SV：現代スウェーデン語。公開中の482語の SV（本番
   https://moreskosh.pages.dev/assets/data/igsd/ の index.json と lemmas/）の
   語彙とトーンに合わせる。
5. note / layer_notes は訳さない（JA のままコピー）。争いのある箇所について
   note が保っている立場を、訳文の側で強めたり弱めたりしない。
6. 比喩の指す対象の同定を訳文で新たにしない（JA が同定していないものはしない）。

## 作業と報告
- モデルは Sonnet。作業単位は1レンマ、成果物はウェーブ単位で push する。
- 報告はコンパクトに：処理レンマ数・語義数、追加フィールドの欠けゼロの自己確認、
  訳しにくかった語義（flagged：レンマ・語義番号・理由）を列挙する。
- 欠けたフィールドや空文字を残したまま完了としない。
