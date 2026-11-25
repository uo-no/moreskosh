#!/usr/bin/env node
/**
 * IGSD 拡張208語の def_en の聖書参照を、コアと同じ3字略号（MAT 20:28 形式）に統一する（#263）。
 *
 * 対象：#258 で def_en を追加した拡張208語（--files で渡すか、既定では下の対象リストを使う）。
 * 動作：def_en の値の中の「長い書名＋数字」（Matt 20:28／1 Cor 12–14／John 10 など）だけを
 *       対応する3字略号へ置換する。散文中の書名（"John the Baptist"、"in Acts" など数字を伴わないもの）と
 *       def_en 以外のフィールドは変えない。再実行しても同じ結果（冪等）。
 * 使い方：node scripts/unify-igsd-def-en-refs.cjs <対象ファイル名リスト（改行区切り）のパス>
 *         リストは #258 のコミットが変更した lemma ファイル名（G*.json）を改行区切りで並べたもの。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const MAP = {
    "Matt": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT", "Rom": "ROM",
    "1 Cor": "1CO", "2 Cor": "2CO", "Gal": "GAL", "Eph": "EPH", "Phil": "PHP", "Col": "COL",
    "1 Thess": "1TH", "2 Thess": "2TH", "1 Tim": "1TI", "2 Tim": "2TI", "Tit": "TIT", "Phlm": "PHM",
    "Heb": "HEB", "Jas": "JAS", "1 Pet": "1PE", "2 Pet": "2PE", "1 John": "1JN", "2 John": "2JN",
    "3 John": "3JN", "Jude": "JUD", "Rev": "REV",
};
const names = Object.keys(MAP).sort((a, b) => b.length - a.length).join("|");
const re = new RegExp("(?<![A-Za-z0-9])(" + names + ") (?=\\d)", "g");

const listPath = process.argv[2];
if (!listPath) { console.error("対象ファイル名リストのパスを渡してください"); process.exit(2); }
const targets = new Set(fs.readFileSync(listPath, "utf8").split(/\s+/).filter(Boolean));
const dir = path.join(__dirname, "..", "public", "assets", "data", "igsd", "lemmas");
let n = 0, files = 0;
const log = [];

for (const f of fs.readdirSync(dir).filter(x => /^G.*\.json$/.test(x)).sort()) {
    if (!targets.has(f)) continue;
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, "utf8");
    const data = JSON.parse(text);
    let idx = 0;
    const cut = text.search(/^ "(?:idioms|assignments)":/m);
    const head = text.slice(0, cut), tail = text.slice(cut);
    let changed = false;
    const out = head.replace(/^([ \t]*"def_en": )("(?:[^"\\]|\\.)*")(,?\r?\n)/gm, (m, pre, val, post) => {
        const s = data.senses[idx++];
        const before = JSON.parse(val);
        const after = before.replace(re, (mm, b) => MAP[b] + " ");
        if (after === before) return m;
        n++; changed = true;
        log.push(f + " sense " + s.id + ": " + (before.match(new RegExp(re.source + "\\S*", "g")) || []).join(", ") + " → " + (after.match(/\b[1-3]?[A-Z]{2,3} \d\S*/g) || []).join(", "));
        return pre + JSON.stringify(after) + post;
    });
    if (changed) { fs.writeFileSync(p, out + tail, "utf8"); files++; }
}
console.log("置換した語義:", n, "／ファイル:", files);
if (process.env.IGSD_REF_LOG) fs.writeFileSync(process.env.IGSD_REF_LOG, log.join("\n") + "\n");
