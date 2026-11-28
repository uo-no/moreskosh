#!/usr/bin/env node
/**
 * build-ngsd-pdf-sample.cjs — キュー #411 NGSD辞書 PDF の組版サンプル（箇所中心形）
 *
 * #413 改訂：範囲の本文（ギリシャ語＋口語訳）の節を除き、収録順をギリシャ語アルファベット順から範囲内の初出順に変更。
 *
 * #414 改訂：各項目から状態行（確定・全用例割り当て＋拡張照合の出どころ）と語義ごとの裏づけ行、「NGSD 未収録」の説明行を除いた。
 * 根拠の説明（拡張照合／拡張照合（新約のみ））は凡例に一度だけ載せる。固有名詞は、同定ドラフト（proper-nouns/drafts/）が
 * あれば、範囲内のトークンが属する同定（と役割・表記）を見出しの下に示す。ドラフトがない固有名詞は注記なしで見出し・用例・形のみ。
 *
 * 範囲（例：ROM 1:1 / ROM 1）に出るレンマを集め、NGSD の公開データから箇所中心形の小辞典を
 * A4 の HTML に組み、Playwright（Chromium）で PDF に印刷する。サンプル提示用で、/pdf の生成サービスではない。
 *
 * 入力（読み取りのみ）：
 *   proper-nouns/drafts/<Strong>.json（固有名詞の同定ドラフト。あれば）
 *   public/assets/data/igsd/index.json・lemmas/*.json・sense-map-gi.json（NGSD）
 *   public/bible_data/nt/{BOOK}/{ch}.json（本文・形態）
 *   public/books.json（書名）
 *
 * 方針（L-0）：
 *   - データにある語義・件数・定義文・成句をそのまま載せる。語義を選ばない・補わない・言い換えない。
 *   - 「その箇所の語義」は sense-map-gi の割り当てのみに従う。NGSD に項目のない語は、見出しと
 *     本文由来の事実（品詞・出現数・出現形）と、あれば同定ドラフトの内容だけを載せ、説明は添えない（静寂）。
 *   - LXX の用例は載せない（キュー #411 の指定）。lemma の note（LXX の箇所を含む）も載せない。
 *   - 生成日以外は決定的（同じ入力から同じ HTML）。
 *
 * 実行：
 *   node scripts/build-ngsd-pdf-sample.cjs --range "ROM 1:1" --out docs/samples/ngsd-pdf/rom-1-1 [--date 2026-11-27] [--no-pdf]
 *   --out は拡張子なしのパス。<out>.html と <out>.pdf を書く。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const ORIGIN = 'https://moreskosh.pages.dev';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RANGE = arg('--range', 'ROM 1:1');
const OUT = arg('--out', null);
const DATE = arg('--date', new Date().toISOString().slice(0, 10));
const NO_PDF = args.includes('--no-pdf');
if (!OUT) { console.error('usage: --range "ROM 1:1" --out <path-without-ext>'); process.exit(2); }

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(PUB, p), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nfc = (s) => String(s).normalize('NFC');
const num = (n) => Number(n).toLocaleString('en-US');

require(path.join(PUB, 'assets/js/translit.js'));
const translit = globalThis.Translit.of;

/* ───────── 範囲 ───────── */
const m = /^([1-3]?[A-Z]{2,3})\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(RANGE.trim());
if (!m) { console.error('STOP: 範囲の形式が不正: ' + RANGE); process.exit(2); }
const BOOK = m[1], CH = Number(m[2]);
const V1 = m[3] ? Number(m[3]) : null, V2 = m[4] ? Number(m[4]) : V1;
const books = readJson('books.json').NT;
const bookByKey = new Map(books.map((b) => [b.key, b]));
if (!bookByKey.has(BOOK)) { console.error('STOP: 書名が不明: ' + BOOK); process.exit(2); }
const BOOK_JA = bookByKey.get(BOOK).name;
const rangeJa = V1 == null ? `${BOOK_JA} ${CH}章` : V1 === V2 ? `${BOOK_JA} ${CH}:${V1}` : `${BOOK_JA} ${CH}:${V1}–${V2}`;

/* ───────── 入力 ───────── */
const t0 = Date.now();
const igsdIndex = readJson('assets/data/igsd/index.json');
const igsdByStrong = new Map(igsdIndex.map((e) => [e.strong, e]));
const senseMap = readJson('assets/data/igsd/sense-map-gi.json');
const chTokens = readJson(`bible_data/nt/${BOOK}/${CH}.json`);
const inRange = (t) => V1 == null || (Number(t.verse) >= V1 && Number(t.verse) <= V2);
const rangeTokens = chTokens.filter(inRange);

/* 新約全体の Strong ごとのトークン数（NGSD 未収録語の出現数に使う。lemma 一致はアクセント・大文字を無視） */
const loose = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const ntCount = new Map(); // strong + '\u0000' + loose(lemma) → n
for (const b of books) {
  for (let c = 1; c <= b.chapters; c++) {
    for (const t of readJson(`bible_data/nt/${b.key}/${c}.json`)) {
      const k = t.strong + '\u0000' + loose(t.lemma);
      ntCount.set(k, (ntCount.get(k) || 0) + 1);
    }
  }
}

/* ───────── ラベル表（品詞は app/ui/app-shell.js の pos、形態は scripts/build-static-pages.cjs の MORPH.ja と同じ） ───────── */
const POS = { noun: '名詞', adj: '形容詞', verb: '動詞', prep: '前置詞', conj: '接続詞', det: '限定詞', pron: '代名詞', adv: '副詞', ptcl: '添語', num: '数詞', intj: '間投詞' };
const MORPH = {
  person: { 1: '1人称', 2: '2人称', 3: '3人称' }, number: { singular: '単数', plural: '複数' },
  gender: { masculine: '男性', feminine: '女性', neuter: '中性' },
  case: { nominative: '主格', genitive: '属格', dative: '与格', accusative: '対格', vocative: '呼格' },
  tense: { present: '現在', imperfect: '未完了過去', future: '未来', aorist: 'アオリスト', perfect: '完了', pluperfect: '過去完了' },
  voice: { active: '能動', middle: '中動', passive: '受動' },
  mood: { indicative: '直説法', subjunctive: '接続法', optative: '希求法', imperative: '命令法', infinitive: '不定詞', participle: '分詞' },
  degree: { comparative: '比較級', superlative: '最上級' },
};
const MORPH_ORDER = ['mood', 'tense', 'voice', 'person', 'case', 'gender', 'number', 'degree'];
const morphLabel = (t) => MORPH_ORDER.map((k) => (t[k] && MORPH[k][t[k]]) || '').filter(Boolean).join('・');

/* 拡張照合の出どころ（キュー #406 の文言。build-static-pages.cjs の PROV.ja と同一） */
const PROV = {
  extended: '拡張照合 — 語義は新約の全用例から立て、LXX・教父の用例で裏づけを確認した',
  extendedNtOnly: '拡張照合（新約のみ） — LXX・教父に用例がないため、語義は新約の用例のみに基づく',
};

/* 固有名詞の同定ドラフト（proper-nouns/drafts/<Strong>.json。lemmaId grc:G3972 → G3972.json）。無ければ null */
const draftCache = new Map();
function loadDraft(lemmaId) {
  if (draftCache.has(lemmaId)) return draftCache.get(lemmaId);
  const m2 = /^grc:(G\d+)$/.exec(lemmaId || '');
  const p = m2 && path.join(ROOT, 'proper-nouns/drafts', m2[1] + '.json');
  const d = p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  draftCache.set(lemmaId, d);
  return d;
}
const warnings = [];

/* 成句の参照（"ROM 15:6"）を書名に */
const refJa = (r) => { const x = /^(\S+)\s+(.+)$/.exec(r); const b = x && bookByKey.get(x[1]); return b ? `${b.name} ${x[2]}` : r; };

/* ───────── 範囲の語をレンマに寄せる ───────── */
/* キー：NGSD の割り当てがあれば割り当て元の見出し語の strong、無ければ lemma（アクセント・大文字を無視）。
   NGSD 未収録語は同じ lemma の別 Strong（例：ἐγώ の G1473・G1691・G2257・G3450）を1項目にまとめる。 */
const entries = new Map();
for (const t of rangeTokens) {
  const sm = senseMap[String(t.globalIdx)];
  const key = sm ? sm.split(':')[0] : 'X:' + loose(t.lemma);
  if (!entries.has(key)) entries.set(key, { key, ngsd: !!sm, strong: sm ? key : t.strong, strongsX: new Set(), lemmaIds: new Set(), lemma: sm ? nfc(igsdByStrong.get(key).lemma) : nfc(t.lemma), toks: [] });
  const e = entries.get(key);
  if (!sm) { e.strongsX.add(t.strong); e.lemmaIds.add(t.lemmaId); }
  e.toks.push({ t, sense: sm ? sm.split(':')[1] : null });
}

/* 収録順：範囲内での初出順（各レンマの最初のトークンの位置。節、次いで章ファイル内の配列順）。
   Map は挿入順を保つので、rangeTokens を配列順に走査した上のループの挿入順がそのまま初出順になる。 */
const list = [...entries.values()];

/* ───────── KWIC（その箇所の用例：節の中の語を前後5語で示す） ───────── */
const byVerse = new Map();
for (const t of chTokens) { const v = Number(t.verse); if (!byVerse.has(v)) byVerse.set(v, []); byVerse.get(v).push(t); }
const tokText = (t) => nfc(t.text) + (t.after || '');
function kwic(t) {
  const vs = byVerse.get(Number(t.verse));
  const i = vs.indexOf(t);
  const W = 5;
  const a = Math.max(0, i - W), b = Math.min(vs.length, i + W + 1);
  const pre = vs.slice(a, i).map(tokText).join(' ');
  const post = vs.slice(i + 1, b).map(tokText).join(' ');
  return `${a > 0 ? '… ' : ''}${esc(pre)} <b>${esc(tokText(t))}</b> ${esc(post)}${b < vs.length ? ' …' : ''}`.replace(/\s+/g, ' ').trim();
}

/* ───────── 固有名詞の同定（ドラフトがあるときだけ。範囲内のトークンが属する同定・役割のみ） ───────── */
function identHtml(e) {
  const out = [];
  for (const lid of e.lemmaIds) {
    const d = loadDraft(lid);
    if (!d) continue;
    const hit = new Map(); // 同定 id → { ident, roles: Map }
    for (const x of e.toks) {
      if (x.t.lemmaId !== lid) continue;
      const ref = `${BOOK} ${CH}:${x.t.verse}`;
      const ids = d.identifications.filter((i) => (i.refs || []).includes(ref));
      if (ids.length > 1) warnings.push(`複数の同定に該当 ${lid} ${ref}: ${ids.map((i) => i.id).join('・')}（候補をすべて表示）`);
      for (const i of ids) {
        if (!hit.has(i.id)) hit.set(i.id, { ident: i, roles: new Map() });
        for (const r of (i.roles || [])) if ((r.refs || []).includes(ref)) hit.get(i.id).roles.set(r.id, r);
      }
    }
    for (const { ident, roles } of hit.values()) {
      const p = [`<div class="cs"><p class="cl"><span class="lb">${esc(ident.label_ja)}</span></p>`];
      for (const r of roles.values()) {
        p.push(`<p class="rl"><span class="k">役割</span>${esc(r.label_ja)} <span class="cnt">${num(r.count)}回</span> <span class="refs">（${esc((r.refs || []).map(refJa).join('、'))}）</span></p>`);
      }
      const forms = ((ident.variants || {}).ja || []).map((v) => v.form).filter(Boolean);
      if (forms.length) p.push(`<p class="rl"><span class="k">表記</span>${esc(forms.join('、'))}</p>`);
      p.push('</div>');
      out.push(p.join(''));
    }
  }
  return out.join('\n');
}

/* ───────── エントリの組版 ───────── */
const omitted = { noNgsd: [], noDef: [] };
function entryHtml(e) {
  const pos = [...new Set(e.toks.map((x) => POS[x.t.class] || x.t.class))].join('・');
  const tr = translit(e.lemma);
  const h = [];
  if (e.ngsd) {
    const idx = igsdByStrong.get(e.strong);
    const data = readJson(`assets/data/igsd/lemmas/${e.strong}.json`);
    const strongs = (idx.strongs || [e.strong]).filter((s) => s !== e.strong);
    h.push(`<div class="hw"><span class="gk lemma" lang="grc">${esc(e.lemma)}</span> <span class="tr">${esc(tr)}</span> <span class="meta">${esc(e.strong)}${strongs.length ? `（${esc(strongs.join('・'))} を含む）` : ''}　${esc(pos)}　新約 ${num(idx.total)}回</span></div>`);

    const central = [...new Set(e.toks.map((x) => x.sense))].sort((a, b) => Number(a) - Number(b));
    for (const sid of central) {
      const s = data.senses.find((x) => String(x.id) === sid);
      const cnt = idx.senses.find((x) => String(x.id) === sid).count;
      if (!s.def) omitted.noDef.push(`${e.strong}:${sid}`);
      const here = e.toks.filter((x) => x.sense === sid);
      h.push(`<div class="cs"><p class="cl"><span class="sn">${esc(sid)}</span><span class="lb">${esc(s.label)}</span> <span class="cnt">新約 ${num(cnt)}回</span>${central.length > 1 || data.senses.length > 1 ? '' : ''}</p>` +
        (s.def ? `<p class="df">${esc(s.def)}</p>` : '') +
        `<ul class="here">${here.map((x) => `<li><span class="ref">${esc(`${CH}:${x.t.verse}`)}</span> <span class="gk" lang="grc">${kwic(x.t)}</span></li>`).join('')}</ul></div>`);
    }
    const others = data.senses.filter((s) => !central.includes(String(s.id)));
    if (others.length) {
      h.push(`<p class="ot"><span class="k">他の語義</span>${others.map((s) => `<span class="o"><span class="sn2">${esc(s.id)}</span>${esc(s.label)} <span class="cnt">${num(idx.senses.find((x) => String(x.id) === String(s.id)).count)}</span></span>`).join('')}</p>`);
    }
    if (data.idioms && data.idioms.length) {
      h.push(`<div class="id"><span class="k">成句</span>${data.idioms.map((i) => `<p><span class="gk" lang="grc">${esc(nfc(i.form))}</span>　${esc(i.gloss)}${i.refs && i.refs.length ? ` <span class="refs">（${esc(i.refs.map(refJa).join('、'))}）</span>` : ''}</p>`).join('')}</div>`);
    }
  } else {
    const sx = [...e.strongsX].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    omitted.noNgsd.push(`${sx.join('+')} ${e.lemma}`);
    const n = sx.reduce((acc, s) => acc + (ntCount.get(s + '\u0000' + loose(e.lemma)) || 0), 0);
    h.push(`<div class="hw"><span class="gk lemma" lang="grc">${esc(e.lemma)}</span> <span class="tr">${esc(tr)}</span> <span class="meta">${esc(sx.join('・'))}　${esc(pos)}　新約 ${num(n)}回</span></div>`);
    h.push(identHtml(e));
    h.push(`<ul class="here">${e.toks.map((x) => `<li><span class="ref">${esc(`${CH}:${x.t.verse}`)}</span> <span class="gk" lang="grc">${kwic(x.t)}</span></li>`).join('')}</ul>`);
  }
  // 活用形：この範囲に出た形のみ
  const forms = new Map();
  for (const x of e.toks) { const k = nfc(x.t.text) + '\u0000' + morphLabel(x.t); forms.set(k, (forms.get(k) || 0) + 1); }
  const fl = [...forms.entries()].map(([k, n]) => { const [f, l] = k.split('\u0000'); return { f, l, n }; })
    .sort((a, b) => b.n - a.n || (a.f < b.f ? -1 : a.f > b.f ? 1 : a.l < b.l ? -1 : 1));
  h.push(`<p class="fm"><span class="k">この箇所の形</span>${fl.map((x) => `<span class="o"><span class="gk" lang="grc">${esc(x.f)}</span>${x.l ? ` ${esc(x.l)}` : ''}${x.n > 1 ? ` <span class="cnt">×${x.n}</span>` : ''}</span>`).join('')}</p>`);
  if (e.ngsd) h.push(`<p class="url">全語義・用例：${esc(ORIGIN)}/ja/word/${esc(e.strong)}/</p>`);
  return `<article class="en">${h.join('\n')}</article>`;
}

const ngsdN = list.filter((e) => e.ngsd).length;
const body = list.map(entryHtml).join('\n');

const CREDITS = [
  '語義：NGSD（本プロジェクト作成。編者 南田浩喜）。語義の確定は Abbott-Smith と用例分析を基礎とし、判断の分かれる箇所では BDAG を参照して照合した。語義ラベルと定義はすべて本プロジェクトの独自記述で、BDAG の本文は含まない。',
  'ギリシャ語本文・形態：SBLGNT（© SBL / Faithlife、CC BY 4.0）／MACULA Greek（© Biblica, Inc.、CC BY 4.0）に基づく派生データ',
  '書体：Noto Serif CJK JP・Noto Serif（SIL Open Font License 1.1）',
];

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>NGSD 辞書 — ${esc(rangeJa)}</title>
<style>
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
/* ギリシャ文字は和文の中でも Noto Serif で組む（和文書体の単調ギリシャ字形に落ちないように） */
@font-face { font-family: "GkSerif"; src: local("Noto Serif"), local("NotoSerif-Regular"); unicode-range: U+0300-036F, U+0370-03FF, U+1F00-1FFF; font-weight: 400; }
@font-face { font-family: "GkSerif"; src: local("Noto Serif Bold"), local("NotoSerif-Bold"); unicode-range: U+0300-036F, U+0370-03FF, U+1F00-1FFF; font-weight: 700; }
:root { --ink: #1a1a1a; --sub: #555; --rule: #bbb; --accent: #2f5d3a; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); background: #fff; font-family: "GkSerif", "Noto Serif CJK JP", "Noto Serif", serif; font-size: 8.6pt; line-height: 1.55; }
.gk { font-family: "Noto Serif", "Noto Serif CJK JP", serif; }
b { font-weight: 700; }
header.cv { border-bottom: 0.6pt solid var(--ink); padding-bottom: 3mm; margin-bottom: 4mm; }
header.cv .series { font-size: 8pt; letter-spacing: 0.2em; color: var(--accent); margin: 0; }
header.cv h1 { font-size: 20pt; font-weight: 700; margin: 1mm 0 2mm; letter-spacing: 0.04em; }
header.cv dl { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 0.5mm 4mm; margin: 0; font-size: 8.2pt; }
header.cv dt { color: var(--sub); }
header.cv dd { margin: 0; }
h2 { font-size: 9pt; font-weight: 700; color: var(--accent); margin: 0 0 1.5mm; letter-spacing: 0.1em; }
.howto { font-size: 7.4pt; color: var(--sub); border: 0.4pt solid var(--rule); padding: 1.5mm 2.5mm; margin-bottom: 4mm; }
.howto p { margin: 0; }
main { column-count: 2; column-gap: 7mm; column-rule: 0.3pt solid var(--rule); }
.en { break-inside: avoid-column; margin: 0 0 3.2mm; padding-bottom: 2.4mm; border-bottom: 0.3pt solid #ddd; }
.en p { margin: 0; }
.hw { line-height: 1.35; margin-bottom: 0.6mm; }
.hw .lemma { font-size: 12.5pt; font-weight: 700; }
.hw .tr { font-style: italic; color: var(--sub); font-size: 8.4pt; font-family: "Noto Serif", serif; }
.hw .meta { font-size: 7.6pt; color: var(--sub); white-space: nowrap; }
.cs { margin: 1mm 0 1.2mm; }
.cl .sn { display: inline-block; min-width: 3.6mm; height: 3.6mm; line-height: 3.6mm; text-align: center; font-size: 6.8pt; color: #fff; background: var(--accent); border-radius: 0.8mm; margin-right: 1.2mm; vertical-align: 0.3mm; padding: 0 0.6mm; }
.cl .lb { font-weight: 700; font-size: 9.4pt; }
.cnt { font-size: 7pt; color: var(--sub); }
.df { margin-top: 0.4mm !important; text-align: justify; }
.rl { font-size: 7.8pt; margin-top: 0.6mm !important; }
.rl .refs { color: var(--sub); font-size: 7pt; }
ul.here { list-style: none; margin: 0.6mm 0 0; padding: 0; }
ul.here li { font-size: 8.6pt; line-height: 1.45; padding-left: 7mm; text-indent: -7mm; }
ul.here .ref { display: inline-block; width: 7mm; text-indent: 0; font-size: 7pt; color: var(--accent); font-family: "Noto Serif CJK JP", serif; }
.k { display: inline-block; font-size: 6.8pt; color: var(--sub); border: 0.3pt solid var(--rule); border-radius: 0.8mm; padding: 0 1mm; margin-right: 1.4mm; line-height: 1.5; }
.ot, .fm { font-size: 7.8pt; margin-top: 0.8mm !important; }
.ot .o, .fm .o { margin-right: 2.4mm; }
.ot .o::after, .fm .o::after { content: ""; }
.sn2 { font-size: 6.8pt; color: var(--accent); margin-right: 0.6mm; }
.id { font-size: 7.8pt; margin-top: 0.8mm; }
.id p { padding-left: 2mm; }
.id .refs { color: var(--sub); font-size: 7pt; }
.url { font-size: 6.6pt; color: var(--sub); margin-top: 0.8mm !important; font-family: "Noto Serif", serif; word-break: break-all; }
footer.cr { margin-top: 5mm; border-top: 0.6pt solid var(--ink); padding-top: 2mm; font-size: 7pt; color: #333; break-inside: avoid; }
footer.cr h2 { font-size: 7.6pt; }
footer.cr ul { margin: 0; padding-left: 4mm; }
</style>
</head>
<body>
<header class="cv">
<p class="series">NGSD 辞書　箇所中心形</p>
<h1>${esc(rangeJa)}</h1>
<dl>
<dt>範囲</dt><dd>${esc(rangeJa)}（${num(rangeTokens.length)}語）</dd>
<dt>収録語数</dt><dd>${num(list.length)}レンマ（うち NGSD 収録 ${num(ngsdN)}）</dd>
<dt>生成日</dt><dd>${esc(DATE)}</dd>
<dt>語義</dt><dd>NGSD　編者 南田浩喜</dd>
</dl>
</header>
<div class="howto">
<p>収録順は範囲内での初出順。各項目は見出し（原形・Strong 番号・品詞・新約での総出現数）、この箇所で使われた語義（番号・ラベル・新約での件数・定義・この箇所の用例）、他の語義の一覧（ラベル・件数）、成句、この箇所に出た形の順に載せています。固有名詞は語義の代わりに、同定データがあるものは同定（その名前が誰・何を指すか。役割・表記を含む）を載せ、データのないものは見出しと用例のみです。他の語義の定義と用例、語義ごとの裏づけは語ページにあります。</p>
<p>収録した NGSD の見出し語はすべて、新約の全用例に語義を割り当て済みです（状態は確定〈final〉）。語義の根拠は二通りです。<b>拡張照合</b>：${esc(PROV.extended.replace(/^拡張照合 — /, ''))}。<b>拡張照合（新約のみ）</b>：${esc(PROV.extendedNtOnly.replace(/^拡張照合（新約のみ） — /, ''))}。</p>
</div>
<main>
${body}
</main>
<footer class="cr">
<h2>出典</h2>
<ul>
${CREDITS.map((c) => `<li>${esc(c)}</li>`).join('\n')}
</ul>
</footer>
</body>
</html>
`;

fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true });
const htmlPath = path.resolve(ROOT, OUT + '.html');
fs.writeFileSync(htmlPath, html);
const tHtml = Date.now() - t0;
console.log(`HTML: ${path.relative(ROOT, htmlPath)}  tokens=${rangeTokens.length} lemmas=${list.length} ngsd=${ngsdN} (${tHtml} ms)`);
if (omitted.noNgsd.length) console.log(`NGSD 未収録 ${omitted.noNgsd.length}: ${omitted.noNgsd.join(', ')}`);
for (const w of warnings) console.log('WARN ' + w);
if (omitted.noDef.length) console.log(`定義文なし ${omitted.noDef.length}: ${omitted.noDef.join(', ')}`);

if (!NO_PDF) {
  (async () => {
    const t1 = Date.now();
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('file://' + htmlPath, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdfPath = path.resolve(ROOT, OUT + '.pdf');
    await page.pdf({
      path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:7pt;color:#666;font-family:'Noto Serif CJK JP',serif;padding:0 14mm;display:flex;justify-content:space-between"><span>NGSD 辞書　${esc(rangeJa)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    await browser.close();
    const buf = fs.readFileSync(pdfPath);
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`PDF: ${path.relative(ROOT, pdfPath)}  pages=${pages}  size=${(buf.length / 1024).toFixed(0)} KB  (print ${Date.now() - t1} ms, total ${Date.now() - t0} ms)`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
