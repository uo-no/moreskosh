#!/usr/bin/env node
/**
 * build-static-pages.cjs — #214 静的ページ生成 Phase 1
 *
 * 語ページ（NGSD の全見出し語 × JA/EN/ES）と章ページ（260章 × JA/EN/ES）を、JS なしで読める静的 HTML として
 * public/{lang}/word/{Strong}/index.html ・ public/{lang}/book/{BOOK}/{chapter}/index.html に書き出す。
 * あわせて public/sitemap-pages.xml を生成する（sitemap.xml は index 形式。sitemap-core.xml は既存 URL 群）。
 *
 * 語ページの出どころは NGSD データ（assets/data/igsd/index.json・lemmas/*.json・sense-map-gi.json）。キュー #408。
 * 章ページの「頻出語」は #214 の 385 語のまま（CHAPTER_WORDS）。語ページの無い語はリンクにしない。
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

/* ───────── 章ページの「頻出語」に使う 385 語（#214 の集合を固定。章ページの内容を変えないため） ───────── */
const CHAPTER_WORDS = ('G18, G25, G26, G27, G32, G38, G40, G71, G80, G129, G139, G142, G154, G165, G166, G190, G191, G225, G235, G243, G266, G281, G302, G305, G342, G386, G435, G444, G450, G455, G458, G499, G500, G541, G565, G575, G599, G602, G603, G611, G615, G622, G629, G630, G646, G649, G652, G720, G725, G728, G733, G740, G746, G749, G756, G766, G782, G863, G906, G907, G908, G932, G935, G991, G1063, G1080, G1093, G1096, G1097, G1122, G1125, G1135, G1140, G1161, G1162, G1163, G1167, G1174, G1188, G1209, G1223, G1242, G1247, G1248, G1249, G1320, G1321, G1325, G1342, G1343, G1347, G1352, G1380, G1381, G1391, G1392, G1401, G1410, G1411, G1417, G1427, G1437, G1453, G1466, G1484, G1487, G1492, G1495, G1504, G1515, G1519, G1520, G1525, G1535, G1537, G1538, G1544, G1563, G1577, G1589, G1680, G1699, G1722, G1753, G1785, G1799, G1831, G1849, G1854, G1860, G1905, G1909, G1967, G1985, G2033, G2041, G2054, G2064, G2065, G2078, G2087, G2089, G2097, G2098, G2099, G2117, G2127, G2147, G2169, G2192, G2193, G2198, G2207, G2212, G2222, G2228, G2235, G2250, G2258, G2281, G2288, G2307, G2309, G2316, G2334, G2356, G2362, G2372, G2378, G2398, G2400, G2428, G2434, G2435, G2440, G2443, G2453, G2476, G2521, G2531, G2532, G2540, G2564, G2570, G2588, G2590, G2596, G2597, G2643, G2665, G2671, G2758, G2776, G2783, G2784, G2817, G2818, G2821, G2889, G2896, G2919, G2962, G2980, G2983, G2992, G2999, G3004, G3009, G3037, G3050, G3056, G3062, G3101, G3115, G3120, G3123, G3140, G3173, G3195, G3303, G3306, G3316, G3319, G3326, G3339, G3361, G3366, G3367, G3384, G3439, G3441, G3444, G3466, G3498, G3516, G3551, G3563, G3568, G3571, G3598, G3614, G3623, G3624, G3650, G3686, G3699, G3704, G3708, G3709, G3727, G3735, G3752, G3753, G3754, G3756, G3761, G3762, G3767, G3772, G3777, G3779, G3780, G3788, G3793, G3813, G3824, G3825, G3844, G3857, G3860, G3862, G3870, G3875, G3952, G3956, G3957, G3962, G3982, G3986, G3992, G4005, G4012, G4043, G4088, G4095, G4098, G4100, G4102, G4103, G4106, G4124, G4137, G4143, G4151, G4160, G4166, G4172, G4183, G4190, G4198, G4226, G4228, G4245, G4268, G4309, G4314, G4334, G4335, G4336, G4352, G4383, G4396, G4413, G4416, G4442, G4459, G4487, G4521, G4561, G4592, G4625, G4634, G4647, G4678, G4687, G4747, G4750, G4862, G4863, G4864, G4893, G4964, G4973, G4976, G4978, G4982, G4983, G4991, G4997, G5037, G5043, G5046, G5055, G5059, G5083, G5087, G5117, G5119, G5140, G5154, G5179, G5204, G5206, G5207, G5217, G5225, G5228, G5241, G5259, G5281, G5287, G5315, G5331, G5342, G5346, G5355, G5368, G5399, G5456, G5457, G5463, G5479, G5481, G5485, G5486, G5495, G5498, G5547, G5550, G5578, G5590, G5602, G5610, G5613, G5620').split(/,\s*/);

/* ───────── 入力 ───────── */
const books = readJson('books.json').NT; // [{key,name,chapters}]
const i18n = { en: readJson('assets/i18n/en.json'), es: readJson('assets/i18n/es.json') };
const bookName = (lang, b) => (lang === 'ja' ? b.name : i18n[lang]['book.' + b.key] || b.key);
const igsdIndex = readJson('assets/data/igsd/index.json');
const igsdByStrong = new Map(igsdIndex.map((e) => [e.strong, e]));
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
/* 語ページ：NGSD の index の全見出し語。章ページの頻出語：CHAPTER_WORDS。 */
const strongKey = (s) => { const m = /^G(\d+)(.*)$/.exec(s); return [Number(m[1]), m[2]]; };
const byStrong = (a, b) => { const x = strongKey(a), y = strongKey(b); return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0); };
const pageSet = igsdIndex.map((e) => e.strong).sort(byStrong);
const pageHas = new Set(pageSet);
if (pageHas.size !== igsdIndex.length || pageSet.some((s) => !/^G\d+[a-z]?(\+\d+[a-z]?)*$/.test(s))) {
  console.error('STOP: NGSD の index の strong に重複か想定外の形がある');
  process.exit(2);
}
const wordSet = CHAPTER_WORDS;
const entryStrongs = new Map(); // 代表 Strong → 集計対象 Strong 集合
for (const s of wordSet) entryStrongs.set(s, new Set((igsdByStrong.get(s) && igsdByStrong.get(s).strongs) || [s]));

/* ───────── NT 本文の集計 ───────── */
const chapters = []; // {book, ch, verses:[{v, greek}], strongCount:Map}
const occ = new Map(); // 章の頻出語の代表 Strong → {lemmas:Map}
const tokenByGi = new Map(); // globalIdx → {book,ch,v,form}
const strongToRep = new Map();
/* 集計対象：各ページ自身の Strong を最優先で割り当て、IGSD が同一語としてまとめた他の Strong は、
   他ページの自身の Strong と衝突しないものだけを加える（例：G1519 と G1722 は互いの strongs に含まれるため）。 */
for (const rep of wordSet) strongToRep.set(rep, rep);
for (const [rep, set] of entryStrongs) for (const s of [...set].sort()) if (!strongToRep.has(s)) strongToRep.set(s, rep);
for (const s of wordSet) occ.set(s, { lemmas: new Map() });

for (const b of books) {
  for (let c = 1; c <= b.chapters; c++) {
    const toks = readJson(`bible_data/nt/${b.key}/${c}.json`);
    const byVerse = new Map();
    const chCount = new Map();
    for (const t of toks) {
      const v = Number(t.verse);
      if (!byVerse.has(v)) byVerse.set(v, []);
      byVerse.get(v).push(t);
      tokenByGi.set(String(t.globalIdx), {
        book: b.key, ch: c, v,
        form: nfc(t.text) + '|' + ['person', 'number', 'gender', 'case', 'tense', 'voice', 'mood', 'degree', 'class'].map((k) => t[k] || '').join(','),
      });
      const rep = strongToRep.get(t.strong);
      if (rep) {
        chCount.set(rep, (chCount.get(rep) || 0) + 1);
        const o = occ.get(rep);
        o.lemmas.set(t.lemma, (o.lemmas.get(t.lemma) || 0) + 1);
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

/* 対応表（sense-map-gi：globalIdx → "Strong:senseId"）を見出し語ごと・語義ごとにまとめる（本文順） */
const senseMap = readJson('assets/data/igsd/sense-map-gi.json');
const assigned = new Map(); // Strong → {forms:Map, senses:Map(senseId → {verses, seen})}
for (const gi of Object.keys(senseMap).sort((a, b) => Number(a) - Number(b))) {
  const [strong, sid] = senseMap[gi].split(':');
  const tk = tokenByGi.get(gi);
  if (!tk || !pageHas.has(strong)) { console.error(`STOP: sense-map-gi ${gi} → ${senseMap[gi]} が本文か index に無い`); process.exit(2); }
  if (!assigned.has(strong)) assigned.set(strong, { count: 0, forms: new Map(), senses: new Map() });
  const a = assigned.get(strong);
  a.count++;
  a.forms.set(tk.form, (a.forms.get(tk.form) || 0) + 1);
  if (!a.senses.has(sid)) a.senses.set(sid, { count: 0, verses: [], seen: new Set() });
  const sv = a.senses.get(sid);
  sv.count++;
  const vk = `${tk.book} ${tk.ch}:${tk.v}`;
  if (!sv.seen.has(vk)) { sv.seen.add(vk); sv.verses.push({ book: tk.book, ch: tk.ch, v: tk.v }); }
}

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
    freq: '新約での出現', freqUnit: '回', senses: '語義（NGSD）', dict: 'Abbott-Smith 辞書本文（引用）',
    dictNote: '原典の英語のまま掲載しています。', forms: '出現形', formsMore: (n) => `ほか ${n} 形`,
    readVerse: (bk, c, v) => `${bk} ${c}:${v} をアプリで読む`, allUses: 'この語の用例をすべて見る（Greekn）',
    readChapter: 'この章をアプリで読む', prev: '前の章', next: '次の章', chapterWords: 'この章の頻出語',
    chapterHead: (bk, c) => `${bk} ${c}章`, verseLabel: (v) => `${v}節`, greekLabel: 'ギリシャ語', tr: { JA1955: '口語訳' },
    credits: '出典', home: 'Bible Green', transLabel: '口語訳（1955）', chapterTitle: (bk, c) => `${bk} ${c}章｜ギリシャ語本文と口語訳｜Bible Green`,
    wordDesc: (lemma, g, tr, n, senses) => `${lemma}（${tr}、${g}）。新約聖書に${n}回。語義：${senses}。語義・用例・出現形をギリシャ語から読む。`,
    chapterDesc: (bk, c, n) => `${bk} ${c}章（全${n}節）のギリシャ語本文と口語訳（1955）。頻出語の語ページへ進めます。`,
    ptype: '語', in: 'ギリシャ語新約聖書',
    dictLang: 'en',
  },
  en: {
    siteName: 'Bible Green', htmlLang: 'en',
    freq: 'Occurrences in the New Testament', freqUnit: '', senses: 'Senses (NGSD)', dict: 'Abbott-Smith dictionary entry (quoted)',
    dictNote: '', forms: 'Forms in the text', formsMore: (n) => `and ${n} more forms`,
    readVerse: (bk, c, v) => `Read ${bk} ${c}:${v} in the app`, allUses: 'See every use of this word (Greekn)',
    readChapter: 'Read this chapter in the app', prev: 'Previous chapter', next: 'Next chapter', chapterWords: 'Frequent words in this chapter',
    chapterHead: (bk, c) => `${bk} ${c}`, verseLabel: (v) => String(v), greekLabel: 'Greek', credits: 'Sources', home: 'Bible Green',
    transLabel: 'World English Bible', chapterTitle: (bk, c) => `${bk} ${c} — Greek text with English | Bible Green`,
    wordTitle: (lemma, g) => `${lemma} (${g}) — Greek New Testament word | Bible Green`,
    wordDesc: (lemma, g, tr, n, senses) => `${lemma} (${tr}, ${g}): ${n} ${n === '1' ? 'occurrence' : 'occurrences'} in the New Testament. Senses: ${senses}. Examples and forms, read from the Greek.`,
    chapterDesc: (bk, c, n) => `${bk} ${c} (${n} verses): the Greek text with the World English Bible, and links to the words that recur in it.`,
    dictLang: 'en',
  },
  es: {
    siteName: 'Bible Green', htmlLang: 'es',
    freq: 'Apariciones en el Nuevo Testamento', freqUnit: '', senses: 'Acepciones (NGSD)', dict: 'Artículo del diccionario Abbott-Smith (cita)',
    dictNote: '', forms: 'Formas en el texto', formsMore: (n) => `y ${n} formas más`,
    readVerse: (bk, c, v) => `Leer ${bk} ${c}:${v} en la aplicación`, allUses: 'Ver todos los usos de esta palabra (Greekn)',
    readChapter: 'Leer este capítulo en la aplicación', prev: 'Capítulo anterior', next: 'Capítulo siguiente', chapterWords: 'Palabras frecuentes en este capítulo',
    chapterHead: (bk, c) => `${bk} ${c}`, verseLabel: (v) => String(v), greekLabel: 'Griego', credits: 'Fuentes', home: 'Bible Green',
    transLabel: 'Reina-Valera 1909', chapterTitle: (bk, c) => `${bk} ${c} — texto griego con Reina-Valera 1909 | Bible Green`,
    wordTitle: (lemma, g) => `${lemma} (${g}) — palabra del Nuevo Testamento griego | Bible Green`,
    wordDesc: (lemma, g, tr, n, senses) => `${lemma} (${tr}, ${g}): ${n} ${n === '1' ? 'aparición' : 'apariciones'} en el Nuevo Testamento. Acepciones: ${senses}. Ejemplos y formas, leídos desde el griego.`,
    chapterDesc: (bk, c, n) => `${bk} ${c} (${n} versículos): el texto griego con la Reina-Valera 1909 y enlaces a las palabras que se repiten.`,
    dictLang: 'es',
  },
};
const CREDITS = {
  ja: ['ギリシャ語本文・形態：SBLGNT（© SBL / Faithlife、CC BY 4.0）／MACULA Greek（© Biblica, Inc.、CC BY 4.0）に基づく派生データ',
    '英語グロス：Cherith Glosses（Andi Wu、© 2023 Cherith Analytics、CC BY 4.0。MACULA Greek 経由）',
    '辞書：Abbott-Smith, A Manual Greek Lexicon of the New Testament を基にした構造化データ',
    '語義：NGSD（本プロジェクト作成）', '訳文：聖書 口語訳（日本聖書協会、1955年）'],
  en: ['Greek text and morphology: derived from SBLGNT (© SBL / Faithlife, CC BY 4.0) and MACULA Greek (© Biblica, Inc., CC BY 4.0)',
    'English glosses: Cherith Glosses (Andi Wu, © 2023 Cherith Analytics, CC BY 4.0; via MACULA Greek)',
    'Dictionary: structured data based on Abbott-Smith, A Manual Greek Lexicon of the New Testament',
    'Senses: NGSD (created by this project)', 'Translation: World English Bible (public domain)'],
  es: ['Texto griego y morfología: datos derivados de SBLGNT (© SBL / Faithlife, CC BY 4.0) y MACULA Greek (© Biblica, Inc., CC BY 4.0)',
    'Glosas en inglés: Cherith Glosses (Andi Wu, © 2023 Cherith Analytics, CC BY 4.0; vía MACULA Greek)',
    'Diccionario: datos estructurados basados en Abbott-Smith, A Manual Greek Lexicon of the New Testament',
    'Acepciones: NGSD (creado por este proyecto)', 'Traducción: Reina-Valera 1909 (dominio público, eBible.org)'],
};

/* 拡張照合の出どころ（文言はキュー #406 の指定どおり） */
const PROV = {
  ja: {
    extended: '拡張照合 — 語義は新約の全用例から立て、LXX・教父の用例で裏づけを確認した',
    extendedNtOnly: '拡張照合（新約のみ） — LXX・教父に用例がないため、語義は新約の用例のみに基づく',
    attested: '裏づけ：{list}', attestedNtOnly: '裏づけ：新約のみ', layerNt: '新約', layerLxx: 'LXX', layerFathers: '教父',
  },
  en: {
    extended: 'Extended collation — senses established from all NT occurrences, checked against LXX and Fathers usage',
    extendedNtOnly: 'Extended collation (NT only) — no LXX or Fathers occurrences; senses rest on NT usage alone',
    attested: 'Attested: {list}', attestedNtOnly: 'Attested: NT only', layerNt: 'NT', layerLxx: 'LXX', layerFathers: 'Fathers',
  },
  es: {
    extended: 'Colación ampliada — sentidos establecidos desde todas las apariciones en el NT, verificados con el uso de la LXX y los Padres',
    extendedNtOnly: 'Colación ampliada (solo NT) — sin apariciones en la LXX ni en los Padres; los sentidos se basan solo en el uso del NT',
    attested: 'Atestiguado: {list}', attestedNtOnly: 'Atestiguado: solo NT', layerNt: 'NT', layerLxx: 'LXX', layerFathers: 'Padres',
  },
};
const prov = (lang, k) => PROV[lang][k];
function sourceText(lang, data) {
  if (data.collation !== 'extended') return '';
  const ntOnly = data.senses.length > 0 && data.senses.every((x) => x.layers && x.layers.lxx === 'none' && x.layers.fathers === 'none');
  return prov(lang, ntOnly ? 'extendedNtOnly' : 'extended');
}
function attestText(lang, layers) {
  const names = [prov(lang, 'layerNt')];
  if (layers.lxx === 'attested') names.push(prov(lang, 'layerLxx'));
  if (layers.fathers === 'attested') names.push(prov(lang, 'layerFathers'));
  return names.length === 1 ? prov(lang, 'attestedNtOnly') : prov(lang, 'attested').replace('{list}', names.join(SEP[lang]));
}

/* ───────── 語データの組み立て ───────── */
const omitted = { abbott: { ja: [], en: [], es: [] }, senseExamples: [], langFallback: [] };
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
const EXAMPLES_PER_SENSE = 3;
function pickExamples(all) {
  const short = all.filter((x) => (greekOf.get(`${x.book} ${x.ch}:${x.v}`) || '').length <= 200);
  const pool = short.length >= EXAMPLES_PER_SENSE ? short : all;
  const k = Math.min(EXAMPLES_PER_SENSE, pool.length);
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

const readLemma = (s) => readJson('assets/data/igsd/lemmas/' + s + '.json');
const files = new Map(); // 相対パス → 内容
const stats = { wordFiles: 0, chapterFiles: 0, perLang: { ja: 0, en: 0, es: 0 } };

const loose = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function abbottTexts(lang, strong, lemma) {
  const m = /^G(\d+)(.*)$/.exec(strong);
  const rowsAll = asByStrong.get(m[1]) || [];
  const exact = rowsAll.filter((r) => nfc(r.lemma) === lemma);
  const near = exact.length ? exact : rowsAll.filter((r) => loose(r.lemma) === loose(lemma));
  /* 素の番号は現行どおり番号の項目を引用する。a 番号・複合番号は番号部分が別の語のことがあるので、見出し語が一致する項目だけ。 */
  const rows = near.length ? near : (m[2] ? [] : rowsAll);
  return rows.map((r) => (lang === 'es' ? r.es : r.en)).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function exampleItem(lang, x) {
  const t = T[lang];
  const vt = (trans[lang][x.book + ' ' + x.ch] || {})[String(x.v)];
  const gk = greekOf.get(`${x.book} ${x.ch}:${x.v}`);
  const bn = bookName(lang, bookByKey.get(x.book));
  return `<li><p class="sp-ref">${esc(bn)} ${x.ch}:${x.v}</p><p class="sp-greek" lang="grc">${esc(gk)}</p>${vt ? `<p class="sp-trans">${esc(vt)}</p>` : ''}<p><a href="${refUrl(lang, x)}">${esc(t.readVerse(bn, x.ch, x.v))}</a></p></li>`;
}

function buildWord(lang, rep) {
  const t = T[lang];
  const entry = igsdByStrong.get(rep);
  const data = readLemma(rep);
  const lemma = nfc(entry.lemma);
  const tr = translit(lemma);
  const a = assigned.get(rep) || { count: 0, forms: new Map(), senses: new Map() };
  if (a.count !== entry.total) { console.error(`STOP: ${rep} の index total(${entry.total}) と対応表(${a.count})が一致しない`); process.exit(2); }
  const count = a.count.toLocaleString('en-US');
  const lk = lang === 'ja' ? '' : '_' + lang;
  const pick = (s, field) => {
    if (!s[field + lk] && s[field]) omitted.langFallback.push(`${lang}:${rep}:${s.id}:${field}`);
    return s[field + lk] || s[field] || '';
  };
  const parts = [];
  parts.push(`<h1><span class="sp-greek" lang="grc">${esc(lemma)}</span> <span class="sp-tr">${esc(tr)}</span> <span class="sp-id">${esc(rep)}</span></h1>`);
  const src = sourceText(lang, data);
  if (src) parts.push(`<p class="sp-note">${esc(src)}</p>`);
  parts.push(`<section><h2>${t.freq}</h2><p class="sp-num">${count}${t.freqUnit}</p></section>`);

  // NGSD の語義（用例は対応表で語義ごとに）
  const labels = [];
  const items = data.senses.map((s) => {
    const label = pick(s, 'label'), def = pick(s, 'def');
    labels.push(label);
    const sv = a.senses.get(String(s.id));
    const cnt = (entry.senses.find((x) => String(x.id) === String(s.id)) || {}).count;
    if ((sv ? sv.count : 0) !== cnt) { console.error(`STOP: ${rep} 語義 ${s.id} の件数が index と対応表で一致しない`); process.exit(2); }
    const ex = sv ? pickExamples(sv.verses) : [];
    if (!ex.length) omitted.senseExamples.push(`${lang}:${rep}:${s.id}`);
    return `<li><strong>${esc(label)}</strong> <span class="sp-cnt">(${Number(cnt).toLocaleString('en-US')})</span>${def ? `<br>${esc(def)}` : ''}${s.layers ? `<br><span class="sp-note">${esc(attestText(lang, s.layers))}</span>` : ''}${ex.length ? `<ul class="sp-ex">${ex.map((x) => exampleItem(lang, x)).join('')}</ul>` : ''}</li>`;
  });
  parts.push(`<section><h2>${t.senses}</h2><ol>${items.join('')}</ol></section>`);

  // 出現形（対応表で割り当てられたトークン）
  const agg = new Map();
  for (const [k, n] of a.forms) { const form = k.split('|')[0]; const lab = morphLabel(lang, k); const kk = form + '\u0000' + lab; agg.set(kk, (agg.get(kk) || 0) + n); }
  const formRows = [...agg.entries()].map(([k, n]) => { const [form, lab] = k.split('\u0000'); return { form, lab, n }; })
    .sort((x, y) => y.n - x.n || (x.form < y.form ? -1 : x.form > y.form ? 1 : x.lab < y.lab ? -1 : 1));
  const shown = formRows.slice(0, 40);
  parts.push(`<section><h2>${t.forms}</h2><ul class="sp-forms">${shown.map((f) => `<li><span class="sp-greek" lang="grc">${esc(f.form)}</span>${f.lab ? ` — ${esc(f.lab)}` : ''} <span class="sp-cnt">${f.n.toLocaleString('en-US')}</span></li>`).join('')}</ul>${formRows.length > shown.length ? `<p class="sp-note">${esc(t.formsMore(formRows.length - shown.length))}</p>` : ''}</section>`);

  // Abbott-Smith（引用。語義の根拠には使わない）
  const texts = abbottTexts(lang, rep, lemma);
  if (texts.length) {
    parts.push(`<section><h2>${t.dict}</h2>${t.dictNote ? `<p class="sp-note">${esc(t.dictNote)}</p>` : ''}${texts.map((x) => `<p class="sp-dict" lang="${lang === 'es' ? 'es' : 'en'}">${esc(x)}</p>`).join('')}</section>`);
  } else omitted.abbott[lang].push(rep);

  parts.push(`<p class="sp-bridge"><a href="/${lang}/search/${encodeURIComponent(lemma)}">${esc(t.allUses)}</a></p>`);

  const canon = wordUrl(lang, rep);
  const title = t.wordTitle(lemma, rep, tr);
  const senseList = labels.slice(0, 5).join(lang === 'ja' ? '、' : '; ');
  const desc = t.wordDesc(lemma, rep, tr, count, senseList);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'DefinedTerm', name: lemma, termCode: rep, alternateName: tr,
    inLanguage: 'grc', url: ORIGIN + canon,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: lang === 'ja' ? 'ギリシャ語新約聖書の語（Bible Green）' : 'Greek New Testament words (Bible Green)' },
    description: labels.join(lang === 'ja' ? '、' : '; '),
  };
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
    parts.push(`<section><h2>${t.chapterWords}</h2><ul class="sp-words">${top.map(([rep, n]) => { const g = wordGlossShort(lang, rep); const w = `<span class="sp-greek" lang="grc">${esc(lemmaOf(rep))}</span>`; return `<li>${pageHas.has(rep) ? `<a href="${wordUrl(lang, rep)}">${w}</a>` : w}${g ? ` — ${esc(g)}` : ''} <span class="sp-cnt">${n}</span></li>`; }).join('')}</ul></section>`);
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
for (const lang of LANGS) {
  for (const rep of pageSet) {
    files.set(`${lang}/word/${rep}/index.html`, buildWord(lang, rep));
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
for (const rep of pageSet) addUrl((l) => wordUrl(l, rep));
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
const removed = [];
for (const lang of LANGS) {
  const dir = path.join(PUB, lang, 'word');
  for (const name of (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [])) {
    if (pageHas.has(name)) continue;
    removed.push(`${lang}/word/${name}`);
    changed++;
    if (!CHECK) fs.rmSync(path.join(dir, name), { recursive: true });
  }
}
const ms = Date.now() - t0;
const total = stats.wordFiles + stats.chapterFiles;
console.log(JSON.stringify({
  words: pageSet.length, assignments: Object.keys(senseMap).length,
  wordFiles: stats.wordFiles, chapterFiles: stats.chapterFiles, totalHtml: total, perLang: stats.perLang,
  sitemapUrls: total, changedFiles: changed, removed, check: CHECK, ms,
  omitted: {
    abbottMissing: Object.fromEntries(LANGS.map((l) => [l, omitted.abbott[l].length])),
    abbottMissingList: omitted.abbott.ja,
    senseWithoutExamples: omitted.senseExamples.length, langFallbackToJa: omitted.langFallback.length,
  },
}, null, 1));
if (CHECK && changed) process.exit(1);
