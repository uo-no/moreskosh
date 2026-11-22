# 自前配信フォントのライセンス（#212）

このディレクトリの woff2 は、Google Fonts の正規の配布物（fonts.gstatic.com）を 2026-11-22 に取得したものです。改変はしていません。読み込みの定義は `fonts.css` にあります。`fonts.css` は次の css2 応答（Chrome の UA で取得）を、woff2 の URL だけこのディレクトリ内の相対パスに差し替えたものです。

- Gentium Plus（400/700、イタリック 400/700）・Noto Sans JP（400/700）・Noto Serif JP（400/700）：
  `https://fonts.googleapis.com/css2?family=Gentium+Plus:ital,wght@0,400;0,700;1,400;1,700&family=Noto+Sans+JP:wght@400;700&family=Noto+Serif+JP:wght@400;700&display=swap`
- Material Symbols Outlined（opsz 20・wght 400・FILL 0・GRAD 0）：
  `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0`

| ファミリー | ディレクトリ | ライセンス | 原文 |
|---|---|---|---|
| Gentium Plus | `gentiumplus/` | SIL Open Font License 1.1 | `gentiumplus/OFL.txt`（google/fonts リポジトリ `ofl/gentiumplus/OFL.txt`） |
| Noto Sans JP | `notosansjp/` | SIL Open Font License 1.1 | `notosansjp/OFL.txt`（google/fonts `ofl/notosansjp/OFL.txt`） |
| Noto Serif JP | `notoserifjp/` | SIL Open Font License 1.1 | `notoserifjp/OFL.txt`（google/fonts `ofl/notoserifjp/OFL.txt`） |
| Material Symbols Outlined | `materialsymbolsoutlined/` | Apache License 2.0 | `materialsymbolsoutlined/LICENSE.txt`（google/material-design-icons `LICENSE`） |
