/*
 * Cloudflare Pages の _worker.js（advanced mode）。
 * このファイルがあると functions/ ディレクトリは無視されるので、Worker の処理はすべてここに置く。
 *
 * 1. 語ページの中継：/{ja,en,es}/word/* は第2の Pages プロジェクト（公開ルートはリポジトリの words/）から返す。
 *    URL は変えない。env.WORDS_ORIGIN で中継先を差し替えられる。
 * 2. 言語別 OGP の書き換え（/en, /es, /sv）。
 * 3. それ以外は静的アセットをそのまま返す。
 *
 * 呼び出されるパスは public/_routes.json の include に限る。
 */
const WORDS_ORIGIN = 'https://moreskosh-words.pages.dev';
const WORD_PATH = /^\/(ja|en|es)\/word\//;
/* 中継先へ渡すのは内容の選択と再検証に要るヘッダーだけ（Cookie などは渡さない） */
const PASS_HEADERS = ['accept', 'accept-language', 'if-none-match', 'if-modified-since'];

async function relayWord(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const origin = env.WORDS_ORIGIN || WORDS_ORIGIN;
    const headers = new Headers();
    for (const h of PASS_HEADERS) { const v = request.headers.get(h); if (v) headers.set(h, v); }
    try {
        const res = await fetch(origin + url.pathname + url.search, { method: request.method, headers, redirect: 'manual' });
        const out = new Response(res.body, res);
        /* 末尾スラッシュ補完などの転送先が中継先の絶対 URL なら、本体の URL に直す */
        const loc = out.headers.get('Location');
        if (loc && loc.startsWith(origin + '/')) out.headers.set('Location', loc.slice(origin.length));
        return out;
    } catch (_) {
        return new Response('Bad Gateway', { status: 502 });
    }
}

/*
 * 言語別 OGP（共有カード）の書き換え（旧 functions/_middleware.js）。
 *
 * 共有 URL は /en/... ・/es/... ・/sv/... のように言語プレフィックスを含む（アプリ側 i18n.js が
 * プレフィックスから UI 言語を決め、履歴からは取り除く）。LINE・SNS のクローラーは
 * JavaScript を実行せず静的 HTML のメタだけを読むため、そのままでは EN/ES の共有でも
 * 日本語のカードが出る。ここで index.html を取得し、その言語のメタ
 * （title / description / og:* / twitter:*）へ書き換えて返す。
 *
 * - 文言は assets/i18n/<lang>.json の meta.title / meta.description を正本とする
 *   （実行時に applyMeta が使う文字列と同一。新しいコピーはここに持たない）。
 * - 辞書が取れない・必要キーが無い場合は 本来の静的応答へ落とし、従来の静的 HTML（日本語）を返す（静寂）。
 * - /en/search・/es/search（正規）、/en|es|sv/search/<クエリ>（検索結果。OGP は検索画面共通でクエリ別には作らない。#74）と /en|es|sv/search-tool（.html 付き可・従来）は検索画面（/search-tool）を取得し、
 *   search.meta.title / search.meta.description で書き換える（EN は #30、ES は #58）。他の /en/*・/es/*・/sv/* は変更なし。
 * - 日本語の画面・通常アセットは書き換えない。
 */
const LANGS = {
    en: { locale: 'en_US', image: '/assets/ogp-en.png' },
    es: { locale: 'es_ES', image: '/assets/ogp-es.png' },
    sv: { locale: 'sv_SE', image: '/assets/ogp-sv.png' },
};

async function ogp(request, env) {
    const next = () => env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();

    const url = new URL(request.url);
    const m = url.pathname.match(/^\/(en|es|sv)(?=\/|$)/);
    if (!m) return next();
    // 生成済みの静的ページ（語ページ・章ページ。#214）は実ファイルをそのまま返す（SPA の index に差し替えない）。
    if (/^\/(en|es|sv)\/(word|book)\//.test(url.pathname)) return next();
    const lang = m[1];
    const cfg = LANGS[lang];
    // /{en,es,sv}/search と /{en,es,sv}/search/<クエリ>（正規）と /{en,es,sv}/search-tool(.html)（従来）のみ検索画面。他は従来どおり本体 index。
    const isSearch = /^\/(en|es|sv)\/(search-tool(\.html)?|search(\/.*)?)$/.test(url.pathname);
    const pagePath = isSearch ? '/search-tool' : '/';
    const titleKey = isSearch ? 'search.meta.title' : 'meta.title';
    const descKey = isSearch ? 'search.meta.description' : 'meta.description';

    try {
        const [pageRes, dictRes] = await Promise.all([
            env.ASSETS.fetch(new URL(pagePath, url)),
            env.ASSETS.fetch(new URL(`/assets/i18n/${lang}.json`, url)),
        ]);
        if (!pageRes.ok || !dictRes.ok) return next();
        const dict = await dictRes.json();
        const title = dict[titleKey];
        const desc = dict[descKey];
        if (typeof title !== 'string' || typeof desc !== 'string') return next();

        const image = url.origin + cfg.image;
        const pageUrl = url.origin + url.pathname;
        const setContent = (value) => ({ element(el) { el.setAttribute('content', value); } });

        const rewritten = new HTMLRewriter()
            .on('html', { element(el) { el.setAttribute('lang', lang); } })
            .on('title', { element(el) { el.setInnerContent(title); } })
            .on('meta[name="description"]', setContent(desc))
            .on('meta[property="og:title"]', setContent(title))
            .on('meta[property="og:description"]', setContent(desc))
            .on('meta[property="og:image"]', setContent(image))
            .on('meta[property="og:locale"]', setContent(cfg.locale))
            .on('meta[property="og:url"]', setContent(pageUrl))
            .on('meta[name="twitter:title"]', setContent(title))
            .on('meta[name="twitter:description"]', setContent(desc))
            .on('meta[name="twitter:image"]', setContent(image))
            .transform(pageRes);

        const headers = new Headers(rewritten.headers);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        return new Response(rewritten.body, { status: 200, headers });
    } catch (_) {
        return next();
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (WORD_PATH.test(url.pathname)) return relayWord(request, env, url);
        return ogp(request, env);
    },
};
