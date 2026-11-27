#!/usr/bin/env node
/* proper-nouns/target-list.json を作る（キュー #412 指示1）。
   public/bible_data/nt の type=proper トークンを lemmaId 単位で数える。仕様の実測値（540レンマ・4,626トークン、
   頻度帯ごとの内訳）と一致しなければ書かずに exit 1。
   実行: node proper-nouns/tools/build-target-list.cjs [--check] */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, collectProper, summarize, band } = require('./lib.cjs');

const EXPECT = { lemmas: 540, tokens: 4626, bands: { '20+': [33, 3169], '10-19': [33, 426], '5-9': [50, 340], '2-4': [172, 439], '1': [252, 252] } };

const byId = collectProper();
const list = [...byId.entries()].map(([id, toks]) => summarize(id, toks));
list.sort((a, b) => b.total - a.total || Number(a.lemmaId.replace(/\D/g, '')) - Number(b.lemmaId.replace(/\D/g, '')) || (a.lemmaId < b.lemmaId ? -1 : 1));
for (const e of list) e.band = band(e.total);

const tokens = list.reduce((s, e) => s + e.total, 0);
const errs = [];
if (list.length !== EXPECT.lemmas) errs.push(`lemmas ${list.length} ≠ ${EXPECT.lemmas}`);
if (tokens !== EXPECT.tokens) errs.push(`tokens ${tokens} ≠ ${EXPECT.tokens}`);
const bands = {};
for (const [k, [n, t]] of Object.entries(EXPECT.bands)) {
  const xs = list.filter((e) => e.band === k);
  const tt = xs.reduce((s, e) => s + e.total, 0);
  bands[k] = { lemmas: xs.length, tokens: tt };
  if (xs.length !== n || tt !== t) errs.push(`band ${k}: ${xs.length}/${tt} ≠ ${n}/${t}`);
}
if (errs.length) { console.error('STOP: 仕様の実測値と一致しない\n' + errs.join('\n')); process.exit(1); }

const out = {
  description: '新約本文（public/bible_data/nt、全260章）で type が proper のトークンを lemmaId 単位で数えた対象リスト。キュー #412。',
  source: 'public/bible_data/nt',
  counted_by: 'lemmaId',
  totals: { lemmas: list.length, tokens, bands },
  pilot: 'band 20+（33レンマ）',
  items: list.map((e) => ({ lemmaId: e.lemmaId, lemma: e.lemma, ...(e.forms.length > 1 ? { forms: e.forms } : {}), strong: e.strong, total: e.total, band: e.band })),
};
const json = JSON.stringify(out, null, 1) + '\n';
const file = path.join(ROOT, 'proper-nouns/target-list.json');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== json) { console.error('DIFF: target-list.json が再生成結果と異なる'); process.exit(1); }
  console.log('OK (check): target-list.json は再生成結果と一致');
} else {
  fs.writeFileSync(file, json);
  console.log(`OK: ${list.length} lemmas, ${tokens} tokens -> proper-nouns/target-list.json`);
}
