#!/usr/bin/env node
/**
 * IGSD 拡張208語の語義ラベルの英語訳（label_en）を原データ（igsd/lemmas/G*.json）へ書き込む（#257）。
 *
 * 入力：scripts/igsd-label-en-map.json（{ "<日本語ラベル>": "<英語>" }）。コア274語で同じ日本語ラベルに
 *       既に付いている訳は再利用している。
 * 動作：label_en を持たない各語義の "label" 行の直後に label_en 行を挿入する（テキスト単位の挿入のため、
 *       他のフィールド・書式・エスケープは1バイトも変わらない）。同一の日本語ラベルには同一の訳を当てる。
 *       label_en が既にある語義は触らない（再実行しても同じ結果＝冪等）。
 * 使い方：node scripts/apply-igsd-label-en.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "public", "assets", "data", "igsd", "lemmas");
const map = JSON.parse(fs.readFileSync(path.join(__dirname, "igsd-label-en-map.json"), "utf8"));
let added = 0, skipped = 0;
const missing = new Set();

for (const f of fs.readdirSync(dir).filter(n => /^G.*\.json$/.test(n)).sort()) {
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, "utf8");
    const data = JSON.parse(text);
    let idx = 0;
    /* senses[] の各語義は senses 内に "label" 行を1つずつ持つ（トップレベルの "lemma" とは別キー）。出現順に対応づける。 */
    const out = text.replace(/^([ \t]*)"label": (?:"(?:[^"\\]|\\.)*"),?\r?\n/gm, (m, ind) => {
        const s = data.senses[idx++];
        if ("label_en" in s) { skipped++; return m; }
        const en = map[s.label];
        if (typeof en !== "string" || en === "") { missing.add(s.label); return m; }
        added++;
        const eol = m.endsWith("\r\n") ? "\r\n" : "\n";
        return m + ind + '"label_en": ' + JSON.stringify(en) + "," + eol;
    });
    if (idx !== data.senses.length) throw new Error(f + ": label 行の数（" + idx + "）が語義数（" + data.senses.length + "）と一致しない");
    if (out !== text) fs.writeFileSync(p, out, "utf8");
}
console.log("label_en 追加:", added, "／既存:", skipped, "／訳なし:", missing.size);
if (missing.size) { console.error([...missing].join("\n")); process.exit(1); }
