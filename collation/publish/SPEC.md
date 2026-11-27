# NGSD 低頻度帯 公開データ変換 SPEC

## 目的
確定済みの低頻度帯データ（final-i18n）を、公開中482語と同じ形式に変換し、
`public/assets/data/igsd/` に追加する。アプリ表示と静的ページは、この変換結果を使う。

## 入力
- ブランチ `claude/notion-queue-268-wf1xqd` の `collation/{batch-01,batch-02,batch-03,wave-01..33}/final-i18n/*.json`（4,334ファイル）
- bible_data はリポジトリ main の `public/bible_data/nt/`（割当ての解決に使う）

## 出力（main から切った新規ブランチ `data/ngsd-lowband-publish`）
- `public/assets/data/igsd/lemmas/<strong>.json` を新規 4,332ファイル
- `public/assets/data/igsd/index.json` を再構築（既存482＋新規4,332＝4,814件）

## 変換規則
公開中の形式（実測）：lemma ファイルは {lemma, lemmaId, strong, status, updated,
senses[{id, label, label_en, label_es, label_sv, def, def_en, def_es, def_sv, note}],
idioms, assignments{トークンキー: senseId}, unresolved}。
index は配列で {strong, strongs[], lemma, status, senses[{id, label×4言語, count}]}。

1. strong：照合側の strong の先頭に G を付ける（例 630→G630、複合 5228+3029→G5228+3029）。
   ファイル名は `<strong>.json`。lemmaId は `grc:<strong>`。strongs は + で分割し各要素に G。
2. senses：n→id（文字列）。label_ja→label、def_ja→def、label_en 等はそのまま。
   note はそのまま。**layers はそのまま保持する**（表示側が使う）。
3. assignments：箇所表記（例 "MAT 5:32"、重複は "#2"）→ main の bible_data から
   その節のトークンを strong 一致で出現順に引き、#N は N 番目（無印は1番目）。
   キーはトークンの verseId フィールドそのもの、値は senseId（文字列）。
   **全件が一意に解決できること。解決できない割当ては推測で埋めず、一覧にして報告する。**
4. unresolved：エントリがあれば箇所表記を同じ方法でトークンキーに変換し、理由は保持する。
   形式は公開中の482語で unresolved を持つ項目の形式に合わせる（生成経路を repo 内で確認）。
5. layer_notes：lemma ファイルのトップレベルにそのまま保持する。
6. idioms：[]。status： "final" のまま。低頻度帯の印として、lemma ファイルと
   index エントリの両方に `"collation": "extended"` を追加する（表示側はこれで出し分ける）。
7. updated：変換実行日（YYYY-MM-DD）。
8. senses が空の項目（G4610、G5024）は公開しない（トークンが指していない）。
9. 改名：照合側の G127a→G127、G5331a→G5331、G5512a→G5512 として出す
   （bible_data 側は正番号で存在する）。他の a 番号は維持する。
10. index の count は語義ごとの割当て件数。既存482件のエントリは変更しない
    （並びは既存の後に新規分を追加する形でよいが、既存エントリの中身は一字も変えない）。

## 検証（実行側の自己確認＋報告）
- 新規 lemma ファイル数＝4,332、index 総数＝4,814。
- 全 assignments が実トークンに解決した件数と、解決できなかった一覧（あれば）。
- 各 lemma ファイルで、変換元 final-i18n と比べて label/def（4言語）・note・layers が
  一致すること（フィールド名の付け替えと collation フィールド追加を除く）。
- index の count 合計＝assignments 総数。
- JSON として妥当で、公開中のファイルの整形（インデント等）の流儀に合わせる。

## 進め方
- モデルは Sonnet。変換はスクリプトで行い、スクリプトも同ブランチの
  `collation/publish/` に残す。
- push はファイルサイズの上限に注意して分割してよい。Notion の結果欄に
  検証結果（件数と未解決一覧の有無）を記入する。
