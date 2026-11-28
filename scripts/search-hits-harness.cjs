#!/usr/bin/env node
/**
 * search-hits-harness.cjs — 検索画面（public/search-tool.html）を実際に動かして、URL のヒット集合を取り出す（キュー #418）
 *
 * 検索の実装を写し直さず、本番と同じページを Playwright（Chromium）で開き、検索が確定した後の内部状態を読む。
 *   - 通常の検索（形態／関係タブ）：_allMergedResults（globalIdx → {tok, hitTypes}）
 *   - 逆引きタブ：_revCands（[{strong, sense, quals}]）
 *   - 統語の構文タイプ（?syntax_id=）：_synFiltered（現行パネルの既定フィルタ＝確信度 30% 以上・全書物）
 * ヒットは NT と LXX の両方を含むので、corpusId で分けて返す（PDF は新約のみを使う）。
 *
 * ローカルの静的サーバーは本番の _redirects と同じく /search・/ja/search… を search-tool.html に向ける（<base href="/"> 前提）。
 *
 * 実行: node scripts/search-hits-harness.cjs <out.json> <URLパス> [<URLパス> …]
 *   例: node scripts/search-hits-harness.cjs /tmp/h.json "/ja/search/%CE%BB%CF%8C%CE%B3%CE%BF%CF%82"
 * 出力: [{ url, finalUrl, query, kind, mergedSize, nt:[{gi,book,chapter,verse,text,lemma,strong,hitTypes}], lxxCount, rev, syn, msg }]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PUB = path.resolve(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.tsv': 'text/tab-separated-values; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (/^\/(?:ja|en|es|sv)?\/?search(?:\/.*)?$/.test(p) || /^\/(?:ja|en|es|sv)\/search(?:\/.*)?$/.test(p)) p = '/search-tool.html';
    const f = path.join(PUB, p);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function run(page, base, url) {
  const msg = [];
  await page.goto(base + url, { waitUntil: 'load' });
  const isSyn = /[?&]syntax_id=/.test(url);
  // 検索の確定を待つ（ディープリンクは LXX の索引化完了まで待ってから確定する：awaitLxx）
  await page.waitForFunction((syn) => {
    try {
      if (syn) return Array.isArray(_synFiltered) && _synAllHits !== undefined && document.getElementById('syn-label') && !/読み込み中/.test(document.getElementById('syn-label').textContent);
      return !isSearching && typeof _lastQuery === 'string' && _lastQuery.length > 0;
    } catch (_) { return false; }
  }, isSyn, { timeout: 240000, polling: 500 });
  if (!isSyn) await page.waitForTimeout(1500); // 逆引きタブの判定（_revSync は非同期）を待つ
  return page.evaluate(({ syn }) => {
    const out = { finalUrl: location.pathname + location.search, query: typeof _lastQuery === 'string' ? _lastQuery : null };
    if (syn) {
      out.kind = 'syntax';
      out.syn = { all: _synAllHits.length, filtered: _synFiltered.length, confMin: _synConfMin, includeStub: _synIncludeStub, label: (document.getElementById('syn-label') || {}).textContent || '' };
      out.nt = _synFiltered.map((h) => ({ gi: Number(h.globalIdx), book: h.bookKey, chapter: String(h.chapter), verse: String(h.verse), text: h.word, lemma: h.lemma, conf: h.confidence }));
      out.lxxCount = 0;
      out.mergedSize = _synFiltered.length;
      return out;
    }
    out.kind = 'search';
    out.genreTab = _genreTab;
    out.formResolve = _formResolveCur ? { ..._formResolveCur } : null;
    out.formChoices = !!document.getElementById('form-resolve-choices');
    out.rev = _revCands ? _revCands.map((c) => ({ strong: c.strong, sense: String(c.sense), quals: c.quals || [] })) : null;
    out.morphSel = Object.fromEntries(Object.entries(_morphSel).map(([k, v]) => [k, [...v]]));
    out.morphNeg = { ..._morphNeg };
    out.excl = _coocExcl.map((e) => ({ ...e }));
    out.mergedSize = _allMergedResults ? _allMergedResults.size : 0;
    out.nt = []; out.lxxCount = 0;
    for (const [gi, e] of (_allMergedResults || new Map())) {
      const t = e.tok;
      if (!t) continue;
      if (t.corpusId === 'LXX') { out.lxxCount++; continue; }
      out.nt.push({ gi: Number(gi), book: t.book, chapter: String(t.chapter), verse: String(t.verse), text: t.text, lemma: t.lemma, strong: t.strong, corpusId: t.corpusId, hitTypes: [...e.hitTypes] });
    }
    out.nt.sort((a, b) => a.gi - b.gi);
    return out;
  }, { syn: isSyn });
}

(async () => {
  const [outFile, ...urls] = process.argv.slice(2);
  if (!outFile || !urls.length) { console.error('usage: <out.json> <url-path> [...]'); process.exit(2); }
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const results = [];
  for (const url of urls) {
    const page = await browser.newPage();
    const logs = [];
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    const t0 = Date.now();
    try {
      const r = await run(page, base, url);
      r.url = url; r.ms = Date.now() - t0; r.errors = logs.slice(0, 5);
      results.push(r);
      console.log(`${url}\n  → ${r.finalUrl}  kind=${r.kind} merged=${r.mergedSize} NT=${r.nt.length} LXX=${r.lxxCount}${r.rev ? ' rev=' + r.rev.length : ''}${r.formResolve ? ' formResolve=' + JSON.stringify(r.formResolve) : ''}${r.formChoices ? ' (候補選択)' : ''} (${r.ms} ms)`);
    } catch (e) {
      results.push({ url, error: String(e), errors: logs.slice(0, 5) });
      console.log(`${url}\n  → ERROR ${e}`);
    }
    await page.close();
  }
  await browser.close();
  srv.close();
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
})();
