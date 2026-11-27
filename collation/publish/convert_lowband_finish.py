#!/usr/bin/env python3
"""#405 仕上げ変換。usage: convert_lowband_finish.py <collation_root> <repo_root> [YYYY-MM-DD]
#404 の convert_lowband.py と同じ変換規則。PR #1055 マージ後の bible_data で解決する。"""
import json, glob, os, re, sys, collections
COL, REPO = sys.argv[1], sys.argv[2]
DATE = sys.argv[3] if len(sys.argv) > 3 else '2026-11-27'
OUT = os.path.join(REPO, 'public/assets/data/igsd')
# (入力ファイルの strong, 出力 strong)
ADD = [(s, s + 'a') for s in 'G1831 G2127 G2296 G2730 G3618 G3641 G3962 G4043 G4098 G4183 G450 G4687 G5154 G518 G906 G987'.split()]
SWAP = [('G127a', 'G127'), ('G127', 'G127a'), ('G5331a', 'G5331'), ('G5331', 'G5331a'), ('G5512a', 'G5512'), ('G5512', 'G5512a')]
FILL = [('G1567a', 'G1567a'), ('G4412a', 'G4412a')]
REPLACE = {o for _, o in SWAP if not o.endswith('a')} | {'G1567a', 'G4412a'}   # index 上で入れ替える既存エントリ
_ch = {}
def chapter(b, c):
    if (b, c) not in _ch:
        _ch[(b, c)] = json.load(open(os.path.join(REPO, 'public/bible_data/nt', b, c + '.json'), encoding='utf-8'))
    return _ch[(b, c)]
def resolve(ref, strong):
    b, c, v, n = re.match(r'^([A-Z0-9]{3}) (\d+):(\d+)(?:#(\d+))?$', ref).groups()
    toks = [t for t in chapter(b, c) if t['verse'] == v and t['strong'] == strong]
    if not toks: return None, 'no-token'
    if n is None:
        return (toks[0]['verseId'], None) if len(toks) == 1 else (None, f'ambiguous({len(toks)})')
    return (toks[int(n)-1]['verseId'], None) if int(n) <= len(toks) else (None, 'index-out')
def find(strong):
    fs = glob.glob(os.path.join(COL, '*', 'final-i18n', strong + '.json')); assert len(fs) == 1, strong
    return json.load(open(fs[0], encoding='utf-8'))
ip = os.path.join(OUT, 'index.json'); idx = json.load(open(ip, encoding='utf-8'))
pos = {e['strong']: i for i, e in enumerate(idx)}
unres, new_entries, total, nfiles_new = [], [], 0, 0
for inp, outn in ADD + SWAP + FILL:
    src = find(inp); strong = outn
    senses = []
    for s in src['senses']:
        o = collections.OrderedDict(id=str(s['n']), label=s['label_ja'], label_en=s['label_en'], label_es=s['label_es'], label_sv=s['label_sv'],
            **{'def': s['def_ja']}, def_en=s['def_en'], def_es=s['def_es'], def_sv=s['def_sv'])
        if 'layers' in s: o['layers'] = s['layers']
        o['note'] = s.get('note', ''); senses.append(o)
    assign = {}
    for ref, sid in src['assignments'].items():
        vid, why = resolve(ref, strong)
        if vid is None or vid in assign: unres.append((strong, ref, why or 'dup')); continue
        assign[vid] = str(sid)
    assign = dict(sorted(assign.items())); total += len(assign)
    out = collections.OrderedDict(lemma=src['lemma'], lemmaId='grc:' + strong, strong=strong, status='final', collation='extended', updated=DATE,
        senses=senses, idioms=[], assignments=assign, unresolved=list(src.get('unresolved', [])))
    for k in ('layer_notes', 'excluded', 'note'):
        if k in src: out[k] = src[k]
    path = os.path.join(OUT, 'lemmas', strong + '.json')
    existed = os.path.exists(path)
    open(path, 'w', encoding='utf-8').write(json.dumps(out, indent=1, ensure_ascii=False))
    cnt = collections.Counter(assign.values())
    ent = collections.OrderedDict(strong=strong, strongs=[strong], lemma=src['lemma'], status='final', collation='extended',
        senses=[collections.OrderedDict(id=s['id'], label=s['label'], label_en=s['label_en'], label_es=s['label_es'], label_sv=s['label_sv'], count=cnt.get(s['id'], 0)) for s in senses])
    if strong in pos:
        assert strong in REPLACE, strong; idx[pos[strong]] = ent
    else:
        assert not existed, strong; new_entries.append(ent); nfiles_new += 1
new_entries.sort(key=lambda e: e['strong']); idx += new_entries
open(ip, 'w', encoding='utf-8').write(json.dumps(idx, indent=2, ensure_ascii=False) + '\n')
print('added files', nfiles_new, 'replaced', len(ADD + SWAP + FILL) - nfiles_new, 'index total', len(idx), 'assignments', total, 'unresolved', unres)
