#!/usr/bin/env node
/**
 * build-pattern-samples.cjs — 検索パターンごとの NGSD 小辞典サンプルを作る（キュー #418）
 *
 * 1. scripts/search-hits-harness.cjs で検索画面を実際に動かし、各 URL のヒット集合（新約分）を取り出す
 *    （--harness <json> で既存の取り出し結果を使うこともできる）
 * 2. ヒット集合を scripts/build-ngsd-pdf-sample.cjs --hits に渡して HTML・PDF を作る
 * 3. docs/samples/ngsd-pdf/patterns/hits.json に、パターンごとの URL・ヒット件数（トークン／見出し語）・ページ数を書く
 *
 * 実行: node scripts/build-pattern-samples.cjs [--harness <json>] [--date 2026-11-28]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'docs/samples/ngsd-pdf/patterns');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DATE = arg('--date', '2026-11-28');

/* パターンと代表クエリ。path は本番と同じ URL のパス（/ja/search/…）。allSenses は単一の見出し語に解決されるパターン（2・3・5） */
const PATTERNS = [
  { id: 'p1-japanese', no: '1', name: '日本語の単語検索（意味から引く）', q: 'いちじく', path: '/ja/search/' + encodeURIComponent('いちじく') },
  { id: 'p2-lemma', no: '2', name: 'ギリシャ語の単語検索：見出し語', q: 'ἀφορίζω', path: '/ja/search/' + encodeURIComponent('ἀφορίζω'), allSenses: true },
  { id: 'p3-inflected', no: '3', name: 'ギリシャ語の単語検索：活用形（見出し語へ解決）', q: 'κλητοί', path: '/ja/search/' + encodeURIComponent('κλητοί'), allSenses: true },
  { id: 'p4-form-mode', no: '4', name: '形モード（表面形の完全一致・引用符）', q: '"κλητοί"', path: '/ja/search/' + encodeURIComponent('"κλητοί"') },
  { id: 'p5-strong', no: '5', name: 'ストロング番号検索', q: 'G1543', path: '/ja/search/G1543', allSenses: true },
  { id: 'p6-morph', no: '6', name: '形態検索（軸ごとの NOT を含む）', q: 'καλέω ＋ 時制＝アオリスト、法≠直説法', path: '/ja/search/' + encodeURIComponent('καλέω') + '?tense=A&mood=-I' },
  { id: 'p7a-relation', no: '7a', name: '関係タブ（2語の近接・フレーズ）', q: 'πίστις ἐλπίς', path: '/ja/search/' + encodeURIComponent('πίστις ἐλπίς') },
  { id: 'p7b-syntax', no: '7b', name: '統語タブ（構文タイプ：同族対格）', q: '構文タイプ：同族対格', path: '/ja/search?tab=syn&syntax_id=accusative.cognate' },
  { id: 'p8-not', no: '8', name: 'Not検索（語と語の除外）', q: 'κλητός − ἀπόστολος', path: '/ja/search/' + encodeURIComponent('κλητός') + '?excl=' + encodeURIComponent('κλητός:ἀπόστολος') },
];

const display = (p) => 'moreskosh.com' + decodeURIComponent(p);

let harness = arg('--harness', null);
if (!harness) {
  harness = path.join(OUTDIR, 'harness-raw.json');
  fs.mkdirSync(OUTDIR, { recursive: true });
  execFileSync('node', [path.join(__dirname, 'search-hits-harness.cjs'), harness, ...PATTERNS.map((p) => p.path)], { stdio: 'inherit' });
}
const raw = JSON.parse(fs.readFileSync(harness, 'utf8'));
const byUrl = new Map(raw.map((r) => [r.url, r]));
const senseMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/data/igsd/sense-map-gi.json'), 'utf8'));
const loose = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

fs.mkdirSync(OUTDIR, { recursive: true });
const summary = [];
for (const p of PATTERNS) {
  const r = byUrl.get(p.path);
  if (!r || r.error) { console.error(`STOP: ${p.id} のヒット集合が無い（${r && r.error}）`); process.exit(2); }
  const gis = r.nt.map((h) => h.gi);
  // 見出し語数：NGSD の割り当てがあれば割り当て元の見出し語、無ければ lemma（生成スクリプトの項目の単位と同じ）
  const heads = new Set(r.nt.map((h) => { const s = senseMap[String(h.gi)]; return s ? s.split(':')[0] : 'X:' + loose(h.lemma); }));
  const hitsFile = path.join(OUTDIR, p.id + '.hits.json');
  const note = r.lxxCount ? `LXX のヒット ${r.lxxCount.toLocaleString('en-US')} 語は除く` : '';
  fs.writeFileSync(hitsFile, JSON.stringify({ title: `「${p.q}」の検索から`, url: display(r.kind === 'search' ? (r.finalUrl || p.path) : p.path), note, allSenses: !!p.allSenses, gis }, null, 1) + '\n');
  let pages = 0;
  if (gis.length) {
    const outBase = path.join(OUTDIR, p.id);
    const log = execFileSync('node', [path.join(__dirname, 'build-ngsd-pdf-sample.cjs'), '--hits', hitsFile, '--out', path.relative(ROOT, outBase), '--date', DATE], { cwd: ROOT }).toString();
    const m = /pages=(\d+)/.exec(log);
    pages = m ? Number(m[1]) : 0;
    if (/STOP/.test(log) || !m) { console.error(log); process.exit(2); }
    process.stdout.write(log.split('\n').filter((l) => /^(PDF|OVERFLOW|WARN)/.test(l)).map((l) => `  ${p.id}: ${l}`).join('\n') + '\n');
  }
  summary.push({ no: p.no, id: p.id, name: p.name, query: p.q, url: display(r.kind === 'search' ? (r.finalUrl || p.path) : p.path), tokensNT: gis.length, headwords: heads.size, lxxExcluded: r.lxxCount || 0, pages, allSenses: !!p.allSenses, formResolve: r.formResolve || null, rev: r.rev || null, syn: r.syn || null, excl: r.excl || null, morphSel: r.morphSel || null, morphNeg: r.morphNeg || null });
}
fs.writeFileSync(path.join(OUTDIR, 'hits.json'), JSON.stringify(summary, null, 1) + '\n');
console.log('\n| # | パターン | URL | 新約トークン | 見出し語 | LXX除外 | ページ |');
for (const s of summary) console.log(`| ${s.no} | ${s.name} | ${s.url} | ${s.tokensNT} | ${s.headwords} | ${s.lxxExcluded} | ${s.pages} |`);
