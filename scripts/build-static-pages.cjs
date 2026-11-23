#!/usr/bin/env node
/**
 * build-static-pages.cjs — #214 静的ページ生成 Phase 1
 *
 * 語ページ（385語 × JA/EN/ES）と章ページ（260章 × JA/EN/ES）を、JS なしで読める静的 HTML として
 * public/{lang}/word/{Strong}/index.html ・ public/{lang}/book/{BOOK}/{chapter}/index.html に書き出す。
 * あわせて public/sitemap-pages.xml を生成する（sitemap.xml は index 形式。sitemap-core.xml は既存 URL 群）。
 *
 * 方針（L-0）:
 *  - 入力は既存データの読み取りのみ。訳文・定義文を創作しない。データに無い項目はブロックごと省略する。
 *  - 決定的：同じ入力からは同じ出力（時刻・乱数を使わない）。再実行で差分が出ないこと。
 *  - 依存なし Node。実行: node scripts/build-static-pages.cjs [--check]（--check は書き込まず差分があれば exit 1）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const ORIGIN = 'https://moreskosh.pages.dev';
const LANGS = ['ja', 'en', 'es'];
const CHECK = process.argv.includes('--check');

require(path.join(PUB, 'assets/js/translit.js'));
const translit = globalThis.Translit.of;

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(PUB, p), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nfc = (s) => String(s).normalize('NFC');

/* ───────── 追加 111 語（キュー #214 の指示どおり） ───────── */
const EXTRA = ('G38, G139, G342, G386, G458, G499, G500, G541, G602, G603, G629, G646, G720, G725, G728, G733, G766, G908, G1162, G1167, G1174, G1242, G1247, G1248, G1249, G1347, G1381, G1466, G1495, G1504, G1589, G1753, G1967, G1985, G2054, G2099, G2127, G2169, G2207, G2356, G2372, G2378, G2428, G2434, G2435, G2643, G2665, G2671, G2758, G2783, G2817, G2818, G2821, G2999, G3009, G3050, G3115, G3120, G3316, G3339, G3439, G3444, G3466, G3516, G3563, G3623, G3709, G3727, G3824, G3857, G3862, G3875, G3952, G3957, G3986, G4005, G4088, G4106, G4124, G4166, G4268, G4309, G4335, G4416, G4625, G4634, G4647, G4747, G4893, G4964, G4973, G4976, G4978, G4991, G4997, G5046, G5055, G5059, G5179, G5206, G5241, G5281, G5287, G5331, G5355, G5368, G5481, G5486, G5498, G5547, G5578').split(/,\s*/);

/* ───────── 入力 ───────── */
const books = readJson('books.json').NT; // [{key,name,chapters}]
const i18n = { en: readJson('assets/i18n/en.json'), es: readJson('assets/i18n/es.json') };
const bookName = (lang, b) => (lang === 'ja' ? b.name : i18n[lang]['book.' + b.key] || b.key);
const igsdIndex = readJson('assets/data/igsd/index.json');
const igsdByStrong = new Map(igsdIndex.map((e) => [e.strong, e]));
const igsdFiles = fs.readdirSync(path.join(PUB, 'assets/data/igsd/lemmas')).filter((f) => f.endsWith('.json')).sort();
const igsdCoreStrongs = igsdFiles.map((f) => readJson('assets/data/igsd/lemmas/' + f).strong);
const lemmaDict = readJson('bible_data/lemma_dict.json');
const glossEn = readJson('assets/data/lexicon/gloss-en-senses.json');
const glossEs = readJson('assets/data/lexicon/gloss-es-senses.json');
const TRANS = { ja: 'JA1955', en: 'WEB', es: 'RVR1909' };
const trans = { ja: {}, en: {}, es: {} };
for (const lang of LANGS) {
  for (const b of books) {
    for (let c = 1; c <= b.chapters; c++) {
      trans[lang][b.key + ' ' + c] = readJson(`translations/${TRANS[lang]}/${b.key}/${c}.json`).verses;
    }
  }
}

/* Abbott-Smith（CRLF の TSV。strong 列は数値文字列。重複番号あり） */
const asRows = fs.readFileSync(path.join(PUB, 'assets/data/abbott-smith.tsv'), 'utf8').split('\r\n').slice(1).filter(Boolean).map((l) => l.split('\t'));
const asByStrong = new Map();
for (const r of asRows) {
  if (!asByStrong.has(r[0])) asByStrong.set(r[0], []);
  asByStrong.get(r[0]).push({ lemma: r[1], en: r[2], es: r[5] || '' });
}

/* ───────── 語の集合 ───────── */
const wordSet = [...new Set([...igsdCoreStrongs, ...EXTRA])];
const overlap = igsdCoreStrongs.length + EXTRA.length - wordSet.length;
if (igsdCoreStrongs.length !== 274 || EXTRA.length !== 111 || wordSet.length !== 385) {
  console.error(`STOP: 語の集合が 385 にならない（IGSD=${igsdCoreStrongs.length}, 追加=${EXTRA.length}, 重複=${overlap}, 合計=${wordSet.length}）`);
  process.exit(2);
}
wordSet.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const entryStrongs = new Map(); // 代表 Strong → 集計対象 Strong 集合
for (const s of wordSet) entryStrongs.set(s, new Set((igsdByStrong.get(s) && igsdByStrong.get(s).strongs) || [s]));

/* ───────── NT 本文の集計 ───────── */
const chapters = []; // {book, ch, verses:[{v, greek}], strongCount:Map}
const occ = new Map(); // 代表 Strong → {count, forms:Map, verses:[{book,ch,v}], lemmas:Map}
const strongToRep = new Map();
/* 集計対象：各ページ自身の Strong を最優先で割り当て、IGSD が同一語としてまとめた他の Strong は、
   他ページの自身の Strong と衝突しないものだけを加える（例：G1519 と G1722 は互いの strongs に含まれるため）。 */
for (const rep of wordSet) strongToRep.set(rep, rep);
for (const [rep, set] of entryStrongs) for (const s of [...set].sort()) if (!strongToRep.has(s)) strongToRep.set(s, rep);
for (const s of wordSet) occ.set(s, { count: 0, forms: new Map(), verses: [], vseen: new Set(), lemmas: new Map() });

for (const b of books) {
  for (let c = 1; c <= b.chapters; c++) {
    const toks = readJson(`bible_data/nt/${b.key}/${c}.json`);
    const byVerse = new Map();
    const chCount = new Map();
    for (const t of toks) {
      const v = Number(t.verse);
      if (!byVerse.has(v)) byVerse.set(v, []);
      byVerse.get(v).push(t);
      const rep = strongToRep.get(t.strong);
      if (rep) {
        chCount.set(rep, (chCount.get(rep) || 0) + 1);
        const o = occ.get(rep);
        o.count++;
        const fk = nfc(t.text) + '|' + ['person', 'number', 'gender', 'case', 'tense', 'voice', 'mood', 'degree', 'class'].map((k) => t[k] || '').join(',');
        o.forms.set(fk, (o.forms.get(fk) || 0) + 1);
        o.lemmas.set(t.lemma, (o.lemmas.get(t.lemma) || 0) + 1);
        const vk = b.key + ' ' + c + ':' + v;
        if (!o.vseen.has(vk)) { o.vseen.add(vk); o.verses.push({ book: b.key, ch: c, v }); }
      }
    }
    const verses = [...byVerse.keys()].sort((x, y) => x - y).map((v) => ({
      v,
      greek: byVerse.get(v).map((t) => nfc(t.text) + (t.after || '')).join(' ').replace(/\s+([,.·;])/g, '$1'),
    }));
    chapters.push({ book: b, ch: c, verses, chCount });
  }
}
const greekOf = new Map();
for (const c of chapters) for (const v of c.verses) greekOf.set(c.book.key + ' ' + c.ch + ':' + v.v, v.greek);

/* ───────── ラベル表 ───────── */
const MORPH = {
  ja: {
    person: { 1: '1人称', 2: '2人称', 3: '3人称' }, number: { singular: '単数', plural: '複数' },
    gender: { masculine: '男性', feminine: '女性', neuter: '中性' },
    case: { nominative: '主格', genitive: '属格', dative: '与格', accusative: '対格', vocative: '呼格' },
    tense: { present: '現在', imperfect: '未完了過去', future: '未来', aorist: 'アオリスト', perfect: '完了', pluperfect: '過去完了' },
    voice: { active: '能動', middle: '中動', passive: '受動' },
    mood: { indicative: '直説法', subjunctive: '接続法', optative: '希求法', imperative: '命令法', infinitive: '不定詞', participle: '分詞' },
    degree: { comparative: '比較級', superlative: '最上級' },
  },
  en: {
    person: { 1: '1st person', 2: '2nd person', 3: '3rd person' }, number: { singular: 'singular', plural: 'plural' },
    gender: { masculine: 'masculine', feminine: 'feminine', neuter: 'neuter' },
    case: { nominative: 'nominative', genitive: 'genitive', dative: 'dative', accusative: 'accusative', vocative: 'vocative' },
    tense: { present: 'present', imperfect: 'imperfect', future: 'future', aorist: 'aorist', perfect: 'perfect', pluperfect: 'pluperfect' },
    voice: { active: 'active', middle: 'middle', passive: 'passive' },
    mood: { indicative: 'indicative', subjunctive: 'subjunctive', optative: 'optative', imperative: 'imperative', infinitive: 'infinitive', participle: 'participle' },
    degree: { comparative: 'comparative', superlative: 'superlative' },
  },
  es: {
    person: { 1: '1.ª persona', 2: '2.ª persona', 3: '3.ª persona' }, number: { singular: 'singular', plural: 'plural' },
    gender: { masculine: 'masculino', feminine: 'femenino', neuter: 'neutro' },
    case: { nominative: 'nominativo', genitive: 'genitivo', dative: 'dativo', accusative: 'acusativo', vocative: 'vocativo' },
    tense: { present: 'presente', imperfect: 'imperfecto', future: 'futuro', aorist: 'aoristo', perfect: 'perfecto', pluperfect: 'pluscuamperfecto' },
    voice: { active: 'activa', middle: 'media', passive: 'pasiva' },
    mood: { indicative: 'indicativo', subjunctive: 'subjuntivo', optative: 'optativo', imperative: 'imperativo', infinitive: 'infinitivo', participle: 'participio' },
    degree: { comparative: 'comparativo', superlative: 'superlativo' },
  },
};
const MORPH_ORDER = ['mood', 'tense', 'voice', 'person', 'case', 'gender', 'number', 'degree'];
const SEP = { ja: '・', en: ' · ', es: ' · ' };
function morphLabel(lang, key) {
  const f = key.split('|')[1].split(',');
  const names = ['person', 'number', 'gender', 'case', 'tense', 'voice', 'mood', 'degree', 'class'];
  const o = {}; names.forEach((n, i) => { o[n] = f[i]; });
  const parts = MORPH_ORDER.map((k) => (o[k] && MORPH[lang][k][o[k]]) || '').filter(Boolean);
  return parts.join(SEP[lang]);
}

const T = {
  ja: {
    siteName: 'Bible Green', htmlLang: 'ja',
    wordTitle: (lemma, g, tr) => `${lemma}（${g}）ギリシャ語新約の語｜Bible Green`.replace('（）', ''),
    glossH: 'グロス（語の訳語）', freq: '新約での出現', freqUnit: '回', senses: '語義（IGSD）', dict: 'Abbott-Smith 辞書本文',
    dictNote: '原典の英語のまま掲載しています。', forms: '出現形', formsMore: (n) => `ほか ${n} 形`, examples: '用例（節）',
    readVerse: (bk, c, v) => `${bk} ${c}:${v} をアプリで読む`, allUses: 'この語の用例をすべて見る（Greekn）',
    readChapter: 'この章をアプリで読む', prev: '前の章', next: '次の章', chapterWords: 'この章の頻出語',
    chapterHead: (bk, c) => `${bk} ${c}章`, verseLabel: (v) => `${v}節`, greekLabel: 'ギリシャ語', tr: { JA1955: '口語訳' },
    credits: '出典', home: 'Bible Green', transLabel: '口語訳（1955）', chapterTitle: (bk, c) => `${bk} ${c}章｜ギリシャ語本文と口語訳｜Bible Green`,
    wordDesc: (lemma, g, tr, n, gloss) => `${lemma}（${tr}、${g}）。新約聖書に${n}回。${gloss ? 'グロス：' + gloss + '。' : ''}語義・用例・出現形をギリシャ語から読む。`,
    chapterDesc: (bk, c, n) => `${bk} ${c}章（全${n}節）のギリシャ語本文と口語訳（1955）。頻出語の語ページへ進めます。`,
    ptype: '語', in: 'ギリシャ語新約聖書',
    dictLang: 'en',
  },
  en: {
    siteName: 'Bible Green', htmlLang: 'en',
    glossH: 'Gloss', freq: 'Occurrences in the New Testament', freqUnit: '', senses: 'Senses (IGSD)', dict: 'Abbott-Smith dictionary entry',
    dictNote: '', forms: 'Forms in the text', formsMore: (n) => `and ${n} more forms`, examples: 'Examples (verses)',
    readVerse: (bk, c, v) => `Read ${bk} ${c}:${v} in the app`, allUses: 'See every use of this word (Greekn)',
    readChapter: 'Read this chapter in the app', prev: 'Previous chapter', next: 'Next chapter', chapterWords: 'Frequent words in this chapter',
    chapterHead: (bk, c) => `${bk} ${c}`, verseLabel: (v) => String(v), greekLabel: 'Greek', credits: 'Sources', home: 'Bible Green',
    transLabel: 'World English Bible', chapterTitle: (bk, c) => `${bk} ${c} — Greek text with English | Bible Green`,
    wordTitle: (lemma, g) => `${lemma} (${g}) — Greek New Testament word | Bible Green`,
    wordDesc: (lemma, g, tr, n, gloss) => `${lemma} (${tr}, ${g}): ${n} occurrences in the New Testament.${gloss ? ' Gloss: ' + gloss + '.' : ''} Senses, examples and forms, read from the Greek.`,
    chapterDesc: (bk, c, n) => `${bk} ${c} (${n} verses): the Greek text with the World English Bible, and links to the words that recur in it.`,
    dictLang: 'en',
  },
  es: {
    siteName: 'Bible Green', htmlLang: 'es',
    glossH: 'Glosa', freq: 'Apariciones en el Nuevo Testamento', freqUnit: '', senses: 'Acepciones (IGSD)', dict: 'Artículo del diccionario Abbott-Smith',
    dictNote: '', forms: 'Formas en el texto', formsMore: (n) => `y ${n} formas más`, examples: 'Ejemplos (versículos)',
    readVerse: (bk, c, v) => `Leer ${bk} ${c}:${v} en la aplicación`, allUses: 'Ver todos los usos de esta palabra (Greekn)',
    readChapter: 'Leer este capítulo en la aplicación', prev: 'Capítulo anterior', next: 'Capítulo siguiente', chapterWords: 'Palabras frecuentes en este capítulo',
    chapterHead: (bk, c) => `${bk} ${c}`, verseLabel: (v) => String(v), greekLabel: 'Griego', credits: 'Fuentes', home: 'Bible Green',
    transLabel: 'Reina-Valera 1909', chapterTitle: (bk, c) => `${bk} ${c} — texto griego con Reina-Valera 1909 | Bible Green`,
    wordTitle: (lemma, g) => `${lemma} (${g}) — palabra del Nuevo Testamento griego | Bible Green`,
    wordDesc: (lemma, g, tr, n, gloss) => `${lemma} (${tr}, ${g}): ${n} apariciones en el Nuevo Testamento.${gloss ? ' Glosa: ' + gloss + '.' : ''} Acepciones, ejemplos y formas, leídos desde el griego.`,
    chapterDesc: (bk, c, n) => `${bk} ${c} (${n} versículos): el texto griego con la Reina-Valera 1909 y enlaces a las palabras que se repiten.`,
    dictLang: 'es',
  },
};
const CREDITS = {
  ja: ['ギリシャ語本文・形態：SBLGNT（© SBL / Faithlife、CC BY 4.0）／MACULA Greek（© Biblica, Inc.、CC BY 4.0）に基づく派生データ',
    '英語グロス：Cherith Glosses（Andi Wu、© 2023 Cherith Analytics、CC BY 4.0。MACULA Greek 経由）',
    '辞書：Abbott-Smith, A Manual Greek Lexicon of the New Testament を基にした構造化データ',
    '語義：IGSD（本プロジェクト作成）', '訳文：聖書 口語訳（日本聖書協会、1955年）'],
  en: ['Greek text and morphology: derived from SBLGNT (© SBL / Faithlife, CC BY 4.0) and MACULA Greek (© Biblica, Inc., CC BY 4.0)',
    'English glosses: Cherith Glosses (Andi Wu, © 2023 Cherith Analytics, CC BY 4.0; via MACULA Greek)',
    'Dictionary: structured data based on Abbott-Smith, A Manual Greek Lexicon of the New Testament',
    'Senses: IGSD (created by this project)', 'Translation: World English Bible (public domain)'],
  es: ['Texto griego y morfología: datos derivados de SBLGNT (© SBL / Faithlife, CC BY 4.0) y MACULA Greek (© Biblica, Inc., CC BY 4.0)',
    'Glosas en inglés: Cherith Glosses (Andi Wu, © 2023 Cherith Analytics, CC BY 4.0; vía MACULA Greek)',
    'Diccionario: datos estructurados basados en Abbott-Smith, A Manual Greek Lexicon of the New Testament',
    'Acepciones: IGSD (creado por este proyecto)', 'Traducción: Reina-Valera 1909 (dominio público, eBible.org)'],
};

/* ───────── 語データの組み立て ───────── */
const omitted = { gloss: { ja: [], en: [], es: [] }, abbott: { ja: [], en: [], es: [] }, igsd: { ja: [], en: [], es: [] }, examples: [], igsdFallback: [] };
function lemmaOf(rep) {
  const e = igsdByStrong.get(rep);
  if (e) return nfc(e.lemma);
  const o = occ.get(rep);
  return nfc([...o.lemmas.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]);
}
function glossOf(lang, rep, lemma) {
  const n = rep.slice(1);
  if (lang === 'ja') { const d = lemmaDict[lemma] || lemmaDict[lemma.normalize('NFD')]; return d && d.japanese ? d.japanese : ''; }
  if (lang === 'en') { const g = glossEn[n]; if (g && g.length) return g.join('; '); const d = lemmaDict[lemma]; return d && d.english ? d.english : ''; }
  const g = glossEs[n]; return g && g.length ? g.join('; ') : '';
}
function pickExamples(rep) {
  const o = occ.get(rep);
  const all = o.verses;
  const short = all.filter((x) => (greekOf.get(`${x.book} ${x.ch}:${x.v}`) || '').length <= 200);
  const pool = short.length >= 5 ? short : all;
  const k = Math.min(8, pool.length);
  const out = [];
  for (let i = 0; i < k; i++) out.push(pool[Math.floor((i * pool.length) / k)]);
  return out;
}
const bookByKey = new Map(books.map((b) => [b.key, b]));
const refUrl = (lang, x) => `/${lang}/${x.book}/${x.ch}/${x.v}`;

function wordUrl(lang, rep) { return `/${lang}/word/${rep}/`; }
function chapterUrl(lang, key, ch) { return `/${lang}/book/${key}/${ch}/`; }
function altLinks(urlFn) {
  return LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${urlFn(l)}">`).join('\n') +
    `\n<link rel="alternate" hreflang="x-default" href="${ORIGIN}${urlFn('ja')}">`;
}
function shell(lang, { title, desc, canon, alts, jsonld, body }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${canon}">
${alts}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}${canon}">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/static-pages.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body>
<header class="sp-top"><a href="/${lang}">${T[lang].home}</a></header>
<main class="sp-main">
${body}
</main>
<footer class="sp-foot">
<h2>${T[lang].credits}</h2>
<ul>
${CREDITS[lang].map((c) => `<li>${esc(c)}</li>`).join('\n')}
</ul>
</footer>
</body>
</html>
`;
}

const files = new Map(); // 相対パス → 内容
const stats = { wordFiles: 0, chapterFiles: 0, perLang: { ja: 0, en: 0, es: 0 } };

function buildWord(lang, rep) {
  const t = T[lang];
  const lemma = lemmaOf(rep);
  const tr = translit(lemma);
  const o = occ.get(rep);
  const gloss = glossOf(lang, rep, lemma);
  if (!gloss) omitted.gloss[lang].push(rep);
  const parts = [];
  parts.push(`<h1><span class="sp-greek" lang="grc">${esc(lemma)}</span> <span class="sp-tr">${esc(tr)}</span> <span class="sp-id">${rep}</span></h1>`);
  if (gloss) parts.push(`<section><h2>${t.glossH}</h2><p>${esc(gloss)}</p></section>`);
  parts.push(`<section><h2>${t.freq}</h2><p class="sp-num">${o.count.toLocaleString('en-US')}${t.freqUnit}</p></section>`);

  // IGSD 語義
  const ig = fs.existsSync(path.join(PUB, `assets/data/igsd/lemmas/${rep}.json`)) ? readJson(`assets/data/igsd/lemmas/${rep}.json`) : null;
  const ie = igsdByStrong.get(rep);
  if (ig && ig.senses && ig.senses.length) {
    const lk = lang === 'ja' ? '' : '_' + lang;
    const items = ig.senses.map((s) => {
      let label = s['label' + lk], def = s['def' + lk];
      if (lang !== 'ja' && (!label || !def)) {
        // Greekn の既存順序：言語別が無ければ日本語の項目へ落ちる（label/def の項目単位）
        if (!label && s.label) omitted.igsdFallback.push(`${lang}:${rep}:${s.id}:label`);
        if (!def && s.def) omitted.igsdFallback.push(`${lang}:${rep}:${s.id}:def`);
        label = label || s.label; def = def || s.def;
      }
      const cnt = ie && ie.senses ? (ie.senses.find((x) => x.id === s.id) || {}).count : null;
      return `<li><strong>${esc(label || '')}</strong>${cnt != null ? ` <span class="sp-cnt">(${Number(cnt).toLocaleString('en-US')})</span>` : ''}${def ? `<br>${esc(def)}` : ''}</li>`;
    });
    parts.push(`<section><h2>${t.senses}</h2><ol>${items.join('')}</ol></section>`);
  } else omitted.igsd[lang].push(rep);

  // Abbott-Smith
  const nstr = rep.slice(1);
  const rowsAll = asByStrong.get(nstr) || [];
  const rowsLem = rowsAll.filter((r) => nfc(r.lemma) === lemma);
  const rows = rowsLem.length ? rowsLem : rowsAll;
  const texts = rows.map((r) => (lang === 'es' ? r.es : r.en)).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (texts.length) {
    parts.push(`<section><h2>${t.dict}</h2>${t.dictNote ? `<p class="sp-note">${esc(t.dictNote)}</p>` : ''}${texts.map((x) => `<p class="sp-dict" lang="${lang === 'es' ? 'es' : 'en'}">${esc(x)}</p>`).join('')}</section>`);
  } else omitted.abbott[lang].push(rep);

  // 出現形
  const agg = new Map();
  for (const [k, n] of o.forms) { const form = k.split('|')[0]; const lab = morphLabel(lang, k); const kk = form + '\u0000' + lab; agg.set(kk, (agg.get(kk) || 0) + n); }
  const formRows = [...agg.entries()].map(([k, n]) => { const [form, lab] = k.split('\u0000'); return { form, lab, n }; })
    .sort((a, b) => b.n - a.n || (a.form < b.form ? -1 : a.form > b.form ? 1 : a.lab < b.lab ? -1 : 1));
  const shown = formRows.slice(0, 40);
  parts.push(`<section><h2>${t.forms}</h2><ul class="sp-forms">${shown.map((f) => `<li><span class="sp-greek" lang="grc">${esc(f.form)}</span>${f.lab ? ` — ${esc(f.lab)}` : ''} <span class="sp-cnt">${f.n.toLocaleString('en-US')}</span></li>`).join('')}</ul>${formRows.length > shown.length ? `<p class="sp-note">${esc(t.formsMore(formRows.length - shown.length))}</p>` : ''}</section>`);

  // 用例
  const ex = pickExamples(rep);
  const exItems = [];
  for (const x of ex) {
    const key = `${x.book} ${x.ch}:${x.v}`;
    const vt = (trans[lang][x.book + ' ' + x.ch] || {})[String(x.v)];
    const gk = greekOf.get(key);
    const bn = bookName(lang, bookByKey.get(x.book));
    exItems.push(`<li><p class="sp-ref">${esc(bn)} ${x.ch}:${x.v}</p><p class="sp-greek" lang="grc">${esc(gk)}</p>${vt ? `<p class="sp-trans">${esc(vt)}</p>` : ''}<p><a href="${refUrl(lang, x)}">${esc(t.readVerse(bn, x.ch, x.v))}</a></p></li>`);
  }
  if (exItems.length) parts.push(`<section><h2>${t.examples}</h2><ul class="sp-ex">${exItems.join('')}</ul></section>`);
  else omitted.examples.push(rep);

  parts.push(`<p class="sp-bridge"><a href="/${lang}/search/${encodeURIComponent(lemma)}">${esc(t.allUses)}</a></p>`);

  const canon = wordUrl(lang, rep);
  const title = t.wordTitle(lemma, rep, tr);
  const desc = t.wordDesc(lemma, rep, tr, o.count.toLocaleString('en-US'), gloss);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'DefinedTerm', name: lemma, termCode: rep, alternateName: tr,
    inLanguage: 'grc', url: ORIGIN + canon,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: lang === 'ja' ? 'ギリシャ語新約聖書の語（Bible Green）' : 'Greek New Testament words (Bible Green)' },
  };
  if (gloss) jsonld.description = gloss;
  return shell(lang, { title, desc, canon, alts: altLinks((l) => wordUrl(l, rep)), jsonld, body: parts.join('\n') });
}

const wordGlossShort = (lang, rep) => glossOf(lang, rep, lemmaOf(rep));
function buildChapter(lang, idx) {
  const t = T[lang];
  const { book, ch, verses, chCount } = chapters[idx];
  const bn = bookName(lang, book);
  const tv = trans[lang][book.key + ' ' + ch] || {};
  const parts = [];
  parts.push(`<h1>${esc(t.chapterHead(bn, ch))}</h1>`);
  parts.push(`<p class="sp-bridge"><a href="/${lang}/${book.key}/${ch}">${esc(t.readChapter)}</a></p>`);
  const vs = verses.map((v) => `<li id="v${v.v}"><span class="sp-vn">${esc(t.verseLabel(v.v))}</span><p class="sp-greek" lang="grc">${esc(v.greek)}</p>${tv[String(v.v)] ? `<p class="sp-trans">${esc(tv[String(v.v)])}</p>` : ''}</li>`);
  parts.push(`<section><h2>${t.greekLabel} / ${esc(t.transLabel)}</h2><ol class="sp-verses">${vs.join('')}</ol></section>`);
  const top = [...chCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || Number(a[0].slice(1)) - Number(b[0].slice(1))).slice(0, 8);
  if (top.length) {
    parts.push(`<section><h2>${t.chapterWords}</h2><ul class="sp-words">${top.map(([rep, n]) => { const g = wordGlossShort(lang, rep); return `<li><a href="${wordUrl(lang, rep)}"><span class="sp-greek" lang="grc">${esc(lemmaOf(rep))}</span></a>${g ? ` — ${esc(g)}` : ''} <span class="sp-cnt">${n}</span></li>`; }).join('')}</ul></section>`);
  }
  const prev = chapters[idx - 1], next = chapters[idx + 1];
  const nav = [];
  if (prev) nav.push(`<a href="${chapterUrl(lang, prev.book.key, prev.ch)}" rel="prev">← ${esc(t.prev)}（${esc(t.chapterHead(bookName(lang, prev.book), prev.ch))}）</a>`);
  if (next) nav.push(`<a href="${chapterUrl(lang, next.book.key, next.ch)}" rel="next">${esc(t.next)}（${esc(t.chapterHead(bookName(lang, next.book), next.ch))}） →</a>`);
  parts.push(`<nav class="sp-nav">${nav.join(' ')}</nav>`);
  const canon = chapterUrl(lang, book.key, ch);
  return shell(lang, {
    title: t.chapterTitle(bn, ch), desc: t.chapterDesc(bn, ch, verses.length), canon,
    alts: altLinks((l) => chapterUrl(l, book.key, ch)), jsonld: null, body: parts.join('\n'),
  });
}

/* ───────── 生成 ───────── */
const t0 = Date.now();
const urls = [];
for (const lang of LANGS) {
  for (const rep of wordSet) {
    files.set(`${lang}/word/${rep}/index.html`, buildWord(lang, rep));
    urls.push({ rep, kind: 'word', path: wordUrl(lang, rep), key: rep, lang });
    stats.wordFiles++; stats.perLang[lang]++;
  }
  chapters.forEach((c, i) => {
    files.set(`${lang}/book/${c.book.key}/${c.ch}/index.html`, buildChapter(lang, i));
    stats.chapterFiles++; stats.perLang[lang]++;
  });
}

/* sitemap-pages.xml（各 URL に hreflang の相互参照） */
const sm = [];
sm.push('<?xml version="1.0" encoding="UTF-8"?>');
sm.push('<!-- 生成物（scripts/build-static-pages.cjs）。直接編集しない。 -->');
sm.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
const addUrl = (urlFn) => {
  for (const l of LANGS) {
    sm.push('  <url>');
    sm.push(`    <loc>${ORIGIN}${urlFn(l)}</loc>`);
    for (const a of LANGS) sm.push(`    <xhtml:link rel="alternate" hreflang="${a}" href="${ORIGIN}${urlFn(a)}"/>`);
    sm.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${urlFn('ja')}"/>`);
    sm.push('  </url>');
  }
};
for (const rep of wordSet) addUrl((l) => wordUrl(l, rep));
for (const c of chapters) addUrl((l) => chapterUrl(l, c.book.key, c.ch));
sm.push('</urlset>');
files.set('../sitemap-pages.xml', sm.join('\n') + '\n');

/* ───────── 書き出し ───────── */
let changed = 0;
for (const [rel, content] of files) {
  const abs = rel.startsWith('../') ? path.join(PUB, rel.slice(3)) : path.join(PUB, rel);
  const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (cur !== content) {
    changed++;
    if (!CHECK) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); }
  }
}
const ms = Date.now() - t0;
const total = stats.wordFiles + stats.chapterFiles;
console.log(JSON.stringify({
  words: wordSet.length, igsdCore: igsdCoreStrongs.length, extra: EXTRA.length, overlap,
  wordFiles: stats.wordFiles, chapterFiles: stats.chapterFiles, totalHtml: total, perLang: stats.perLang,
  sitemapUrls: total, changedFiles: changed, check: CHECK, ms,
  omitted: {
    glossMissing: Object.fromEntries(LANGS.map((l) => [l, omitted.gloss[l].length])),
    abbottMissing: Object.fromEntries(LANGS.map((l) => [l, omitted.abbott[l].length])),
    igsdMissing: Object.fromEntries(LANGS.map((l) => [l, omitted.igsd[l].length])),
    examplesMissing: omitted.examples.length, igsdFallbackToJa: omitted.igsdFallback.length,
  },
}, null, 1));
if (CHECK && changed) process.exit(1);
