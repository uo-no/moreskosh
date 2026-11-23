/**
 * build-gloss-sv-senses.cjs — スウェーデン語UIの語義行（最大3件）用データ生成
 *
 * 源: public/assets/data/igsd/lemmas/*.json の senses[].label_sv（IGSD、#135）。
 * 形式は gloss-es-senses.json と同一：
 *   { "26": ["kärlek"], ... }  ← キーは Strong 数字（"G" を除く）、値は label_sv の配列（senses の順、最大3件）
 * label_sv が空の語義は含めない。語義が0件の lemma はキーを作らない。
 * 再生成: node scripts/build-gloss-sv-senses.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'assets', 'data', 'igsd', 'lemmas');
const OUT = path.join(ROOT, 'public', 'assets', 'data', 'lexicon', 'gloss-sv-senses.json');
const MAX = 3;

const out = {};
let lemmas = 0, srcSenses = 0, kept = 0, dropped = 0;
for (const f of fs.readdirSync(SRC_DIR).filter(n => n.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
    lemmas++;
    const m = /^G(\d+)$/.exec(j.strong || '');
    if (!m) throw new Error('unexpected strong: ' + f + ' ' + j.strong);
    const labels = [];
    for (const s of j.senses || []) {
        srcSenses++;
        const l = typeof s.label_sv === 'string' ? s.label_sv.trim() : '';
        if (l) labels.push(l);
    }
    const take = labels.slice(0, MAX);
    dropped += labels.length - take.length;
    if (take.length) { out[String(Number(m[1]))] = take; kept += take.length; }
}
const keys = Object.keys(out).sort((a, b) => Number(a) - Number(b));
const sorted = {};
for (const k of keys) sorted[k] = out[k];
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1));
console.log(JSON.stringify({ lemmasRead: lemmas, lemmasWithKey: keys.length, sourceSenses: srcSenses, sensesWritten: kept, sensesDroppedByMax3: dropped }));
