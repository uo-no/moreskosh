#!/usr/bin/env python3
"""NGSD 低頻度帯 公開データ変換（collation/publish/SPEC.md）。
usage: convert_lowband.py <collation_root> <repo_root> [YYYY-MM-DD]
 collation_root: collation/ ディレクトリ（final-i18n 入力）
 repo_root:      main 由来の作業ツリー（public/bible_data 入力、public/assets/data/igsd 出力）
"""
import json, glob, os, re, sys, collections

COL, REPO = sys.argv[1], sys.argv[2]
DATE = sys.argv[3] if len(sys.argv) > 3 else '2026-11-27'
OUT = os.path.join(REPO, 'public/assets/data/igsd')
RENAME = {'G127a': 'G127', 'G5331a': 'G5331', 'G5512a': 'G5512'}
SKIP = {'G4610', 'G5024'}

def gname(s):
    return s if s.startswith('G') else 'G' + s

_ch = {}
def chapter(book, ch):
    k = (book, ch)
    if k not in _ch:
        p = os.path.join(REPO, 'public/bible_data/nt', book, ch + '.json')
        _ch[k] = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None
    return _ch[k]

def resolve(ref, match):
    """ref 'MAT 5:32' / 'ROM 5:19#2' -> (verseId or None, reason)"""
    m = re.match(r'^([A-Z0-9]{3}) (\d+):(\d+)(?:#(\d+))?$', ref)
    if not m: return None, 'bad-ref'
    b, c, v, n = m.groups(); d = chapter(b, c)
    if d is None: return None, 'no-chapter'
    toks = [t for t in d if t['verse'] == v and t['strong'] in match]
    if not toks: return None, 'no-token'
    if n is None:
        if len(toks) > 1: return None, f'ambiguous({len(toks)})'
        return toks[0]['verseId'], None
    n = int(n)
    if n > len(toks): return None, f'index-out({len(toks)})'
    return toks[n-1]['verseId'], None

files = sorted(glob.glob(os.path.join(COL, '*', 'final-i18n', '*.json')))
all_strongs = {os.path.basename(f)[:-5] for f in files}
new_entries, unresolved_report, skipped, collide = [], [], [], []
have0 = {e['strong'] for e in json.load(open(os.path.join(OUT, 'index.json'), encoding='utf-8'))}
total_assign = 0
for f in files:
    src = json.load(open(f, encoding='utf-8'))
    orig = src['strong']
    if not src['senses']:
        skipped.append(orig); continue
    strong = RENAME.get(orig, orig)
    if strong != orig and strong in all_strongs:  # 改名先が別語の入力と衝突
        collide.append((gname(strong), src['lemma'], f.split(os.sep)[-3] + ' (rename ' + orig + ' conflicts with input ' + strong + ')')); continue
    fname = gname(strong)
    if fname in have0:
        collide.append((fname, src['lemma'], f.split(os.sep)[-3])); continue
    strongs = [gname(x) for x in strong.split('+')]
    match = {orig, gname(orig), strong, gname(strong)}
    senses = []
    for s in src['senses']:
        o = collections.OrderedDict()
        o['id'] = str(s['n']); o['label'] = s['label_ja']
        o['label_en'] = s['label_en']; o['label_es'] = s['label_es']; o['label_sv'] = s['label_sv']
        o['def'] = s['def_ja']; o['def_en'] = s['def_en']; o['def_es'] = s['def_es']; o['def_sv'] = s['def_sv']
        if 'layers' in s: o['layers'] = s['layers']
        o['note'] = s.get('note', '')
        senses.append(o)
    assign = {}
    for ref, sid in src['assignments'].items():
        vid, why = resolve(ref, match)
        if vid is None:
            unresolved_report.append((fname, ref, why)); continue
        if vid in assign:
            unresolved_report.append((fname, ref, 'duplicate-token')); continue
        assign[vid] = str(sid)
    unres = []
    for u in src.get('unresolved', []):
        if isinstance(u, dict) and 'ref' in u:
            vid, why = resolve(u['ref'], match)
            u = dict(u); u['ref'] = vid if vid else u['ref']
            if not vid: unresolved_report.append((fname, 'unresolved:' + u['ref'], why))
        unres.append(u)
    assign = dict(sorted(assign.items()))
    total_assign += len(assign)
    out = collections.OrderedDict()
    out['lemma'] = src['lemma']; out['lemmaId'] = 'grc:' + fname; out['strong'] = fname
    out['status'] = 'final'; out['collation'] = 'extended'; out['updated'] = DATE
    out['senses'] = senses; out['idioms'] = []; out['assignments'] = assign; out['unresolved'] = unres
    for k in ('layer_notes', 'excluded', 'note'):
        if k in src: out[k] = src[k]
    if len(strongs) > 1: out['strongs'] = strongs
    with open(os.path.join(OUT, 'lemmas', fname + '.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(out, indent=1, ensure_ascii=False))
    cnt = collections.Counter(assign.values())
    ent = collections.OrderedDict()
    ent['strong'] = fname; ent['strongs'] = strongs; ent['lemma'] = src['lemma']
    ent['status'] = 'final'; ent['collation'] = 'extended'
    ent['senses'] = [collections.OrderedDict([('id', s['id']), ('label', s['label']), ('label_en', s['label_en']),
        ('label_es', s['label_es']), ('label_sv', s['label_sv']), ('count', cnt.get(s['id'], 0))]) for s in senses]
    new_entries.append(ent)

ip = os.path.join(OUT, 'index.json')
idx = json.load(open(ip, encoding='utf-8'))
have = {e['strong'] for e in idx}
dup = [e['strong'] for e in new_entries if e['strong'] in have]
assert not dup, dup  # collide は事前に除外済み
new_entries.sort(key=lambda e: e['strong'])
idx = idx + new_entries
open(ip, 'w', encoding='utf-8').write(json.dumps(idx, indent=2, ensure_ascii=False) + '\n')
print('new lemma files', len(new_entries), 'index total', len(idx), 'skipped(empty senses)', skipped)
print('assignments resolved', total_assign, 'unresolved', len(unresolved_report))
print('collisions with published (skipped)', len(collide), collide)
json.dump({'unresolved': unresolved_report, 'collisions_skipped': collide}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'unresolved-report.json'), 'w'), ensure_ascii=False, indent=1)
for r in unresolved_report[:30]: print(r)
