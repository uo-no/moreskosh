#!/usr/bin/env node
/**
 * check-ngsd-pdf-sample.cjs — NGSD 辞書 PDF サンプル（build-ngsd-pdf-sample.cjs の出力 HTML）の突き合わせ（キュー #415）
 *
 * 生成スクリプトとは独立に、lemmas/*.json の senses[].layers から期待タグを求め、HTML の語義タグと全件を突き合わせる。
 *   (1) 項目ごとに、表示されている語義（中心語義・他の語義）の数とタグの数・文字列が期待どおり
 *   (2) collation が extended でない語（本体）の項目にタグが1つも付いていない
 *   (3) 語ページへのリンクが短い URL を併記している（<a href="https://moreskosh.com/ja/word/G…/">moreskosh.com/ja/word/G…</a>）
 *   (4) 仕様の照合例：μήποτε G3379 の語義3＝新約・使徒教父、語義4＝新約・LXX（データ側）
 * 実行: node scripts/check-ngsd-pdf-sample.cjs docs/samples/ngsd-pdf/rom-1.html [...]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LEMMAS = path.join(ROOT, 'public/assets/data/igsd/lemmas');

const lemma = (strong) => JSON.parse(fs.readFileSync(path.join(LEMMAS, strong + '.json'), 'utf8'));
const expected = (s) => {
  const l = s.layers;
  if (l.lxx === 'attested' && l.fathers === 'attested') return '新約・LXX・使徒教父';
  if (l.lxx === 'attested') return '新約・LXX';
  if (l.fathers === 'attested') return '新約・使徒教父';
  return '新約のみ';
};

let fail = 0;
const ng = (m) => { fail++; console.log('NG ' + m); };

/* (4) 仕様の照合例 */
{
  const d = lemma('G3379');
  const e3 = expected(d.senses.find((x) => x.id === '3')), e4 = expected(d.senses.find((x) => x.id === '4'));
  if (e3 !== '新約・使徒教父' || e4 !== '新約・LXX') ng(`G3379 の期待タグ 語義3=${e3} 語義4=${e4}`);
  else console.log('OK  G3379 語義3＝新約・使徒教父、語義4＝新約・LXX（データ側）');
}

for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(file, 'utf8');
  const arts = html.match(/<article class="en">[\s\S]*?<\/article>/g) || [];
  let tagged = 0, untagged = 0, tagN = 0, senseN = 0, links = 0, linkNG = 0;
  const kinds = {};
  for (const a of arts) {
    const link = /<a href="https:\/\/moreskosh\.com\/ja\/word\/([^"\/]+)\/">moreskosh\.com\/ja\/word\/([^<]+)<\/a>/.exec(a);
    const tags = [...a.matchAll(/<span class="tg" data-sense="([^":]+):([^"]+)">([^<]+)<\/span>/g)].map((m) => ({ strong: m[1], id: m[2], text: m[3] }));
    const shown = [...a.matchAll(/<span class="sn2?">([^<]+)<\/span>/g)].map((m) => m[1]); // 表示されている語義の番号
    const head = /<span class="meta">(G[^（　<]+)/.exec(a);
    const strong = link ? link[1] : null;
    if (link) {
      links++;
      if (link[1] !== link[2]) { linkNG++; ng(`${file}: リンクの表示文字とURLが違う ${link[1]} / ${link[2]}`); }
      if (head && head[1] !== strong) ng(`${file}: 見出しの Strong ${head[1]} とリンク ${strong} が違う`);
    }
    if (!strong) { // NGSD 未収録・同定のみの項目：タグもリンクも無いこと
      if (tags.length) ng(`${file}: 語義のない項目にタグ ${JSON.stringify(tags)}`);
      continue;
    }
    const d = lemma(strong);
    senseN += shown.length;
    if (d.collation !== 'extended') { // (2) 本体
      untagged++;
      if (tags.length) ng(`${file}: 本体の語 ${strong} にタグ ${tags.length} 件`);
      continue;
    }
    tagged++;
    if (tags.length !== shown.length) ng(`${file}: ${strong} 表示語義 ${shown.length} に対しタグ ${tags.length}`);
    for (const t of tags) {
      const s = d.senses.find((x) => String(x.id) === t.id);
      if (!s) { ng(`${file}: ${strong} に語義 ${t.id} が無い`); continue; }
      tagN++;
      kinds[t.text] = (kinds[t.text] || 0) + 1;
      if (t.strong !== strong) ng(`${file}: タグの Strong ${t.strong} が項目 ${strong} と違う`);
      if (t.text !== expected(s)) ng(`${file}: ${strong}:${t.id} タグ「${t.text}」≠ 期待「${expected(s)}」`);
    }
    for (const id of shown) if (!tags.some((t) => t.id === id)) ng(`${file}: ${strong} 語義 ${id} にタグが無い`);
  }
  console.log(`${fail ? 'NG' : 'OK'}  ${path.basename(file)}: 項目 ${arts.length}（NGSD 語 ${tagged + untagged}：拡張照合 ${tagged}／本体 ${untagged}）、語義タグ ${tagN} 件を layers と突き合わせ、本体のタグ 0 件、リンク ${links} 件（表示文字とURL一致）`);
  console.log('    タグ内訳 ' + JSON.stringify(kinds));
}
console.log(fail ? `CHECK: ${fail} 件 NG` : 'CHECK: PASS');
process.exit(fail ? 1 : 0);
