'use strict';
/* 固有名詞データ（キュー #412）の共通部品。public/bible_data/ を読むだけで、書き換えない。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const NT = path.join(ROOT, 'public/bible_data/nt');
const BOOKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/books.json'), 'utf8')).NT;

/* type が proper のトークンを lemmaId ごとに本文順で集める。
   各トークンに ref（"MAT 1:1"）と、その節の中での同じ lemmaId の何番目か（occ、1始まり）を付ける。 */
function collectProper() {
  const byId = new Map();
  for (const b of BOOKS) {
    for (let c = 1; c <= b.chapters; c++) {
      const toks = JSON.parse(fs.readFileSync(path.join(NT, b.key, c + '.json'), 'utf8'));
      const seen = new Map();
      for (const t of toks) {
        if (t.type !== 'proper') continue;
        const ref = `${b.key} ${c}:${t.verse}`;
        const sk = t.lemmaId + '|' + ref;
        const occ = (seen.get(sk) || 0) + 1;
        seen.set(sk, occ);
        if (!byId.has(t.lemmaId)) byId.set(t.lemmaId, []);
        byId.get(t.lemmaId).push({ ref, occ, lemma: t.lemma.normalize('NFC'), strong: t.strong, japanese: t.japanese, globalIdx: t.globalIdx });
      }
    }
  }
  return byId;
}

/* 代表形：最も多い lemma 表記（同数なら Unicode 順で先） */
function summarize(lemmaId, toks) {
  const cnt = new Map();
  for (const t of toks) cnt.set(t.lemma, (cnt.get(t.lemma) || 0) + 1);
  const forms = [...cnt.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const strongs = [...new Set(toks.map((t) => t.strong))];
  return { lemmaId, lemma: forms[0][0], forms: forms.map(([form, n]) => ({ form, count: n })), strong: strongs.length === 1 ? strongs[0] : strongs, total: toks.length };
}

const band = (n) => (n >= 20 ? '20+' : n >= 10 ? '10-19' : n >= 5 ? '5-9' : n >= 2 ? '2-4' : '1');

module.exports = { ROOT, collectProper, summarize, band };
