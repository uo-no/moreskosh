#!/usr/bin/env node
/**
 * IGSD 拡張208語の語義定義の英語訳（def_en）を原データ（igsd/lemmas/G*.json）へ書き込む（#258）。
 *
 * 入力：scripts/igsd-def-en-map.json（{ "<Gxxx>:<senseId>": "<英語>" }。635語義）
 * 動作：def_en を持たない各語義の "def" 行の直後に def_en 行を挿入する（テキスト単位の挿入のため、
 *       他のフィールド・書式・エスケープは1バイトも変わらない）。def_en が既にある語義は触らない
 *       （再実行しても同じ結果＝冪等）。
 * 使い方：node scripts/apply-igsd-def-en.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "public", "assets", "data", "igsd", "lemmas");
const map = JSON.parse(fs.readFileSync(path.join(__dirname, "igsd-def-en-map.json"), "utf8"));
let added = 0, skipped = 0;
const missing = [];

for (const f of fs.readdirSync(dir).filter(n => /^G.*\.json$/.test(n)).sort()) {
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, "utf8");
    const data = JSON.parse(text);
    const strong = f.replace(/\.json$/, "");
    let idx = 0;
    /* idioms[] の各項目も "def" を持つため、置換は senses[] の範囲（最初の "idioms"／"assignments" キーの手前）に限る。 */
    const cut = text.search(/^ "(?:idioms|assignments)":/m);
    if (cut < 0) throw new Error(f + ": senses の終端が見つからない");
    const head = text.slice(0, cut), tail = text.slice(cut);
    /* senses[] の各語義は "def" 行を1つずつ持つ。出現順に senses[] と対応づけて挿入する。 */
    const out = head.replace(/^([ \t]*)"def": ("(?:[^"\\]|\\.)*")(,?)(\r?\n)/gm, (m, ind, val, comma, eol) => {
        const s = data.senses[idx++];
        if ("def_en" in s) { skipped++; return m; }
        const en = map[strong + ":" + s.id];
        if (typeof en !== "string" || en === "") { missing.push(strong + ":" + s.id); return m; }
        added++;
        /* def が語義の最後のフィールドの場合に備え、カンマの位置を保つ */
        return ind + '"def": ' + val + "," + eol + ind + '"def_en": ' + JSON.stringify(en) + comma + eol;
    });
    if (idx !== data.senses.length) throw new Error(f + ": def 行の数（" + idx + "）が語義数（" + data.senses.length + "）と一致しない");
    if (out + tail !== text) fs.writeFileSync(p, out + tail, "utf8");
}
console.log("def_en 追加:", added, "／既存:", skipped, "／訳なし:", missing.length);
if (missing.length) { console.error(missing.join("\n")); process.exit(1); }
