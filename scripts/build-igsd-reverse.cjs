#!/usr/bin/env node
"use strict";
/*
 * build-igsd-reverse.cjs — NGSD 逆引き索引（4言語）生成
 *
 * 入力: public/assets/data/igsd/index.json（status=final の語のみ）＋ lemmas/*.json（候補抽出の def のみ）
 * 出力: public/assets/data/igsd/reverse-{ja,en,es,sv}.json / reverse-candidates-ja.json
 *
 * 方式A（公開索引）: 語義ラベルから引用語・区切り語を見出しとして抜く。括弧内は見出しにせず qualifier にする。
 *   - 括弧の外の引用（「…」『…』"…"«…»»…»）があれば、それが見出し。括弧外の残りは枠表現として見出しにしない。
 *   - 引用がなければ括弧を除いた残りを区切り（JA: ・／/、  他: /）で分割する。
 *   - JA は先頭・末尾の〜を除く。ギリシャ文字を含むトークンは候補ファイルへ（長さによる除外はしない）。
 *   - 規則7: ギリシャ語句＋括弧説明だけで見出しが0になる場合は括弧内を見出しに昇格し、qualifier に元のギリシャ語句を入れる。
 *   - JA のみ stemAliases（語幹バリアント）と aliases（憐れみ・哀れみ→あわれみ）を持つ。
 * 方式B（候補専用）: def の第一文の列挙節と def 内の引用語。公開索引には混ぜない。
 * 使い方: node scripts/build-igsd-reverse.cjs [--check]   （--check は機械照合のみ・書き込みなし）
 */
const fs = require("fs");
const path = require("path");
const DIR = path.resolve(__dirname, "../public/assets/data/igsd");
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const LANGS = {
  ja: { key: "label", delim: /[・／/、]/ },
  en: { key: "label_en", delim: /\// },
  es: { key: "label_es", delim: /\// },
  sv: { key: "label_sv", delim: /\// },
};
const QUOTES = [/「([^」]*)」/g, /『([^』]*)』/g, /"([^"]*)"/g, /«([^»]*)»/g, /»([^»]*)»/g];

function parse(label, lang) {
  const quals = [];
  let outside = label.replace(/[（(]([^）)]*)[）)]/g, (_, q) => { quals.push(q.trim()); return " "; });
  const heads = [];
  for (const re of QUOTES) {
    outside = outside.replace(re, (_, q) => { heads.push(q.trim()); return " "; });
  }
  let toks;
  if (heads.length) toks = heads; // 括弧外の引用があれば枠表現は見出しにしない
  else toks = outside.split(LANGS[lang].delim).map((t) => t.trim());
  const out = [];
  for (let t of toks) {
    if (lang === "ja") t = t.replace(/^〜+|〜+$/g, "");
    t = t.replace(/^[\s,;:]+|[\s,;:]+$/g, "");
    if (t) out.push(t);
  }
  const qualifier = quals.filter(Boolean).join("；");
  // 規則7: ギリシャ文字を除くと見出しが0になる場合のみ、括弧内の説明を見出しに昇格し、qualifier には元のギリシャ語句を入れる
  if (!out.some((t) => !GREEK.test(t)) && quals.length) {
    const promoted = [];
    for (const q of quals) for (let t of q.split(LANGS[lang].delim)) {
      t = t.trim();
      if (lang === "ja") t = t.replace(/^〜+|〜+$/g, "");
      t = t.replace(/^[\s,;:]+|[\s,;:]+$/g, "");
      if (t && !GREEK.test(t)) promoted.push(t);
    }
    if (promoted.length) return { tokens: out.filter((t) => GREEK.test(t)).concat(promoted), qualifier: outside.trim().replace(/\s+/g, " ") };
  }
  return { tokens: out, qualifier };
}
const STEM = [["ぶ", "び"], ["む", "み"], ["れる", "れ"], ["う", "い"], ["く", "き"], ["す", "し"]];

function build() {
  const idx = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")).filter((x) => x.status === "final");
  const lemmas = {};
  let date = "";
  for (const f of fs.readdirSync(path.join(DIR, "lemmas")).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, "lemmas", f), "utf8"));
    lemmas[j.strong] = j;
    if (j.updated && j.updated > date) date = j.updated;
  }
  const result = {}, cand = [];
  for (const lang of Object.keys(LANGS)) {
    const heads = {};
    for (const e of idx) for (const s of e.senses) {
      const { tokens, qualifier } = parse(s[LANGS[lang].key], lang);
      for (const t of tokens) {
        if (GREEK.test(t)) {
          if (lang === "ja") cand.push({ candidate: t, strong: e.strong, sense: s.id, source: "label", reason: "greek" });
          continue;
        }
        const arr = heads[t] || (heads[t] = []);
        if (!arr.some((p) => p.strong === e.strong && p.sense === s.id)) {
          const p = { strong: e.strong, sense: s.id };
          if (qualifier) p.qualifier = qualifier;
          p.count = s.count;
          arr.push(p);
        }
      }
    }
    const sorted = {};
    for (const k of Object.keys(heads).sort()) sorted[k] = heads[k];
    const aliases = {}, stemAliases = {};
    if (lang === "ja") {
      for (const a of ["憐れみ", "哀れみ"]) aliases[a] = "あわれみ";
      for (const h of Object.keys(sorted)) for (const [from, to] of STEM) {
        if (!h.endsWith(from) || h.length <= from.length) continue;
        const v = h.slice(0, -from.length) + to;
        if (sorted[v] || aliases[v]) continue; // 実在見出し優先
        (stemAliases[v] = stemAliases[v] || []).push(h);
      }
      for (const v of Object.keys(stemAliases)) stemAliases[v].sort();
    }
    const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
    result[lang] = { generated: date, scope: "final482", headwords: sorted, aliases, stemAliases: sortObj(stemAliases) };
  }
  // 方式B 候補（JA のみ）
  for (const e of idx) for (const s of lemmas[e.strong].senses) {
    const def = s.def || "";
    const first = def.split("。")[0];
    const have = new Set(Object.keys(result.ja.headwords));
    const push = (c, source) => { c = c.replace(/^〜+|〜+$/g, "").trim(); if (c && !GREEK.test(c) && !have.has(c)) cand.push({ candidate: c, strong: e.strong, sense: s.id, source }); };
    first.replace(/[（(][^）)]*[）)]/g, "").split(/[、・]/).forEach((c) => push(c, "def"));
    def.replace(/「([^」]*)」/g, (_, q) => { push(q, "def"); return ""; });
  }
  const seen = new Set();
  const cl = cand.filter((c) => { const k = JSON.stringify(c); if (seen.has(k)) return false; seen.add(k); return true; });
  cl.sort((a, b) => (a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : a.strong < b.strong ? -1 : a.strong > b.strong ? 1 : a.sense.localeCompare(b.sense, "en", { numeric: true })));
  return { idx, result, candidates: { generated: date, scope: "final482", note: "編者の確定待ちリスト。UI・公開索引から参照しない", candidates: cl } };
}

function verify({ idx, result }) {
  const errs = [], stats = {};
  const total = idx.reduce((n, e) => n + e.senses.length, 0);
  for (const lang of Object.keys(result)) {
    const hw = result[lang].headwords, cover = new Set(), bySense = {};
    let postings = 0;
    for (const h of Object.keys(hw)) {
      if (GREEK.test(h)) errs.push(`${lang}: ギリシャ文字見出し ${h}`);
      for (const p of hw[h]) { postings++; cover.add(p.strong + ":" + p.sense); bySense[p.strong + ":" + p.sense] = p.count; }
    }
    if (cover.size !== total) errs.push(`${lang}: 被覆 ${cover.size}/${total}`);
    for (const e of idx) {
      const sum = e.senses.reduce((n, s) => n + (bySense[e.strong + ":" + s.id] || 0), 0);
      if (sum !== e.total) errs.push(`${lang}: count 不一致 ${e.strong} ${sum}≠${e.total}`);
    }
    stats[lang] = { headwords: Object.keys(hw).length, postings, covered: cover.size };
  }
  return { errs, stats, totalSenses: total };
}

const b = build();
const v = verify(b);
console.log(JSON.stringify(v.stats), "senses", v.totalSenses, "candidates", b.candidates.candidates.length);
if (v.errs.length) { console.error(v.errs.slice(0, 20).join("\n")); process.exit(1); }
if (!process.argv.includes("--check")) {
  for (const l of Object.keys(b.result)) fs.writeFileSync(path.join(DIR, `reverse-${l}.json`), JSON.stringify(b.result[l], null, 1) + "\n");
  fs.writeFileSync(path.join(DIR, "reverse-candidates-ja.json"), JSON.stringify(b.candidates, null, 1) + "\n");
}
