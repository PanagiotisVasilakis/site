from pathlib import Path
import re
import json

p = Path('src/i18n/dictionaries.ts')
s = p.read_text(encoding='utf-8')

# Find en and el blocks by locating 'en: {' and 'el: {' and extracting balanced braces
def extract_block(text, key):
    m = re.search(rf"\b{key}\s*:\s*\{{", text)
    if not m:
        return None
    i = m.end() - 1
    depth = 0
    start = i
    for j in range(i, len(text)):
        ch = text[j]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text[start+1:j]
    return None

en_block = extract_block(s, 'en')
el_block = extract_block(s, 'el')
if not en_block or not el_block:
    print('Could not find blocks')
    raise SystemExit(1)

# find key: 'value' or key: "value" pairs
pair_re = re.compile(r"([A-Za-z0-9_]+)\s*:\s*(['\"])((?:\\.|(?!\2).)*)\2")

def pairs(block):
    d={}
    for m in pair_re.finditer(block):
        key=m.group(1)
        val=m.group(3)
        if key in d:
            idx=1
            newkey=f"{key}_{idx}"
            while newkey in d:
                idx+=1
                newkey=f"{key}_{idx}"
            key=newkey
        d[key]=val
    return d

en_pairs = pairs(en_block)
el_pairs = pairs(el_block)

candidates=[]
for k, en_v in en_pairs.items():
    el_v = el_pairs.get(k)
    if not el_v:
        continue
    if el_v.strip()==en_v.strip():
        candidates.append({'key':k,'en':en_v,'el':el_v,'reason':'IDENTICAL'})
        continue
    # check ascii heavy
    letters = re.findall(r"[A-Za-zΑ-ω]", el_v)
    if not letters:
        continue
    ascii_letters = sum(1 for ch in letters if 'A'<=ch<='z')
    total_letters = len(letters)
    if total_letters>0 and ascii_letters/total_letters>0.4:
        candidates.append({'key':k,'en':en_v,'el':el_v,'reason':'ASCII_HEAVY'})

# extras: any string literal in el that contains english words
str_re = re.compile(r"(['\"])((?:\\.|(?!\1).)*)\1")
extra=[]
for m in str_re.finditer(el_block):
    txt=m.group(2)
    words=re.findall(r"[A-Za-z]{4,}", txt)
    for w in words:
        extra.append({'text':txt,'word':w})

# dedupe
seen=set()
extra_filtered=[]
for e in extra:
    tup=(e['text'],e['word'])
    if tup in seen: continue
    seen.add(tup)
    extra_filtered.append(e)

out={'candidates':candidates,'extra':extra_filtered}
print(json.dumps(out,ensure_ascii=False,indent=2))
