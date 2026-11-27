#!/usr/bin/env python3
"""検証: verify_lowband.py <collation_root> <repo_root>"""
import json,glob,os,sys,subprocess
COL,REPO=sys.argv[1:3]
OUT=os.path.join(REPO,'public/assets/data/igsd')
rep=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'unresolved-report.json')))
RN={'G127a':'G127','G5331a':'G5331','G5512a':'G5512'}
idx=json.load(open(OUT+'/index.json'))
base=json.loads(subprocess.check_output(['git','-C',REPO,'show','origin/main:public/assets/data/igsd/index.json']))
pub={e['strong'] for e in base}
names={os.path.basename(f)[:-5] for f in glob.glob(COL+'/*/final-i18n/*.json')}
bystr={e['strong']:e for e in idx}
bad=0;n=0;asg=0;cnt=0;mism=[]
for f in sorted(glob.glob(COL+'/*/final-i18n/*.json')):
    s=json.load(open(f));o=s['strong']
    if not s['senses']: continue
    st=RN.get(o,o);fn=st if st.startswith('G') else 'G'+st
    if fn in pub or (o in RN and RN[o] in names): continue
    j=json.load(open(f'{OUT}/lemmas/{fn}.json'));n+=1
    for a,b in zip(s['senses'],j['senses']):
        for k in ('label_en','label_es','label_sv','def_en','def_es','def_sv','note','layers'):
            if a.get(k)!=b.get(k) and not(k=='layers' and k not in a): mism.append((fn,k))
        if a['label_ja']!=b['label'] or a['def_ja']!=b['def'] or str(a['n'])!=b['id']: mism.append((fn,'ja'))
    if len(s['senses'])!=len(j['senses']): mism.append((fn,'nsenses'))
    if s.get('layer_notes')!=j.get('layer_notes'): mism.append((fn,'layer_notes'))
    asg+=len(j['assignments']);e=bystr[fn]
    c=sum(x['count'] for x in e['senses']);cnt+=c
    if c!=len(j['assignments']): mism.append((fn,'count'))
print('lemma files verified',n,'mismatches',len(mism),mism[:10])
print('assignments total',asg,'index count total (new)',cnt)
print('index total',len(idx))
print('existing 482 entries unchanged:',idx[:len(base)]==base)
