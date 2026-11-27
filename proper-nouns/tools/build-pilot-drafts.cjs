#!/usr/bin/env node
/* パイロット33レンマの同定ドラフトを proper-nouns/drafts/<Strong>.json に書く（キュー #412 指示2・3）。
   判断は pilot-judgments.cjs。本文（public/bible_data/nt）のトークンに当てて割り当て、次を検査する：
     - refs が実在のトークンに当たる／同じトークンを二重に割り当てない／全トークンがどこかに入る
     - 節に同じ lemmaId が2つ以上あるとき、"#n" なしの ref は使えない（取り違え防止）
     - identifications の count 合計 ＝ total（＝ target-list.json の total）
   実行: node proper-nouns/tools/build-pilot-drafts.cjs        … 生成
         node proper-nouns/tools/build-pilot-drafts.cjs --check … drafts/ を読んで count 合計＝total だけを機械確認 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, collectProper, summarize } = require('./lib.cjs');

const DRAFTS = path.join(ROOT, 'proper-nouns/drafts');
const target = JSON.parse(fs.readFileSync(path.join(ROOT, 'proper-nouns/target-list.json'), 'utf8'));
const pilotIds = target.items.filter((e) => e.band === '20+').map((e) => e.lemmaId);
const fileOf = (lemmaId) => lemmaId.replace(/^grc:/, '') + '.json';

if (process.argv.includes('--check')) {
  let bad = 0;
  for (const id of pilotIds) {
    const f = path.join(DRAFTS, fileOf(id));
    if (!fs.existsSync(f)) { console.log(`NG ${id}: ファイルがない`); bad++; continue; }
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const t = target.items.find((e) => e.lemmaId === id).total;
    const sum = d.identifications.reduce((s, x) => s + x.count, 0);
    const ok = sum === d.total && d.total === t && d.identifications.every((x) => x.count > 0 && x.refs.length > 0);
    console.log(`${ok ? 'OK' : 'NG'} ${id.padEnd(10)} ${d.lemma}\ttotal=${d.total} sum=${sum} ids=${d.identifications.length}`);
    if (!ok) bad++;
  }
  console.log(bad ? `CHECK: ${bad} 件 NG` : `CHECK: ${pilotIds.length} レンマすべて count 合計＝total`);
  process.exit(bad ? 1 : 0);
}

const J = require('./pilot-judgments.cjs');
const byId = collectProper();
const BOOK_ORDER = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/books.json'), 'utf8')).NT.map((b, i) => [b.key, i]));
const refKey = (r) => { const m = /^(\S+) (\d+):(\d+)$/.exec(r); return [BOOK_ORDER.get(m[1]), +m[2], +m[3]]; };
const byRef = (a, b) => { const x = refKey(a), y = refKey(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

const errs = [];
fs.mkdirSync(DRAFTS, { recursive: true });
const report = [];
for (const lemmaId of pilotIds) {
  const j = J[lemmaId];
  if (!j) { errs.push(`${lemmaId}: 判断表に無い`); continue; }
  const toks = byId.get(lemmaId);
  const sum = summarize(lemmaId, toks);
  const perVerse = new Map();
  for (const t of toks) perVerse.set(t.ref, (perVerse.get(t.ref) || 0) + 1);
  const assigned = new Array(toks.length).fill(null);
  j.ids.forEach((idDef, k) => {
    for (const r of idDef.refs || []) {
      const m = /^(\S+ \d+:\d+)(?:#(\d+))?$/.exec(r);
      if (!m) { errs.push(`${lemmaId}: ref の形が不正 ${r}`); continue; }
      const [, ref, occ] = m;
      if (!occ && (perVerse.get(ref) || 0) > 1) { errs.push(`${lemmaId}: ${ref} には ${perVerse.get(ref)} トークンある。#n で指定すること`); continue; }
      const hits = toks.map((t, i) => [t, i]).filter(([t]) => t.ref === ref && (!occ || t.occ === +occ));
      if (!hits.length) { errs.push(`${lemmaId}: ${r} に該当トークンがない`); continue; }
      for (const [, i] of hits) {
        if (assigned[i] !== null) errs.push(`${lemmaId}: ${r} が二重に割り当てられている`);
        assigned[i] = k;
      }
    }
  });
  const defIdx = j.ids.findIndex((x) => x.default);
  if (j.ids.filter((x) => x.default).length > 1) errs.push(`${lemmaId}: default が2つ以上`);
  assigned.forEach((a, i) => {
    if (a === null) {
      if (defIdx < 0) errs.push(`${lemmaId}: ${toks[i].ref}#${toks[i].occ} がどの対象にも入らない`);
      else assigned[i] = defIdx;
    }
  });

  const identifications = j.ids.map((idDef, k) => {
    const mine = toks.filter((_, i) => assigned[i] === k);
    return { id: String(k + 1), label_ja: idDef.label, count: mine.length, refs: [...new Set(mine.map((t) => t.ref))].sort(byRef) };
  });
  for (const x of identifications) if (!x.count) errs.push(`${lemmaId}: 対象 ${x.id}「${x.label_ja}」に割り当てがない`);
  const total = toks.length;
  const csum = identifications.reduce((s, x) => s + x.count, 0);
  if (csum !== total) errs.push(`${lemmaId}: count 合計 ${csum} ≠ total ${total}`);

  const flagged = (j.flags || []).map((f) => {
    const refs = f.refs;
    const to = refs[0] === '*' ? identifications.map((x) => x.id) : [...new Set(refs.map((r) => {
      const m = /^(\S+ \d+:\d+)(?:#(\d+))?$/.exec(r);
      const i = toks.findIndex((t) => t.ref === m[1] && (!m[2] || t.occ === +m[2]));
      if (i < 0) { errs.push(`${lemmaId}: flag の ${r} に該当トークンがない`); return null; }
      return String(assigned[i] + 1);
    }).filter(Boolean))];
    return { refs: refs[0] === '*' ? ['（全体）'] : refs, assigned_to: to, reason_ja: f.reason };
  });

  const draft = {
    lemmaId, lemma: sum.lemma, ...(sum.forms.length > 1 ? { forms: sum.forms } : {}), strong: sum.strong, total,
    status: 'draft',
    identifications,
    ...(j.note ? { note_ja: j.note } : {}),
    ...(flagged.length ? { flagged } : {}),
  };
  fs.writeFileSync(path.join(DRAFTS, fileOf(lemmaId)), JSON.stringify(draft, null, 1) + '\n');
  report.push(`${lemmaId.padEnd(10)} ${sum.lemma}\ttotal=${total}\tids=${identifications.length}\tflags=${flagged.length}`);
}
if (errs.length) { console.error('ERROR\n' + errs.join('\n')); process.exit(1); }
console.log(report.join('\n'));
console.log(`OK: ${report.length} drafts -> proper-nouns/drafts/`);
