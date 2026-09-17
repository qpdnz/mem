# -*- coding: utf-8 -*-
"""地図の表示名を、その repository が実際に使っている語かどうかで点検する。

  python check_words.py <map.json> --src .            点検して表示
  python check_words.py <map.json> --src . --quiet    問題のある語だけ

見る物は3つ。

1. **この repository に出てこない語** — 表示名で使っているのに、code にも文書にも
   1件も出てこない語。作った本人以外は誰も知らない語なので、読む側は対応表を持たされる。
2. **表記ゆれ** — 同じ物を2つの名前で呼んでいる。`meta.words.same` で組を宣言する。
3. **使わないと決めた語** — `meta.words.avoid` に理由付きで書く。
4. **説明の無い表示名** — `terms` (用語集) を持つ地図で、図に出ているのに用語集に無い語。

根拠: 実測 2026-09-18。auto_work の地図の実体名24件のうち12件 (仕事の札・気質・流れの設定 等) は
repository のどこにも無い造語だった。同じ日、「担当」は persona・persona の組・runner の3つを
指していた。`.rule/vocabulary.md` は「同じ物を2つの名前で呼ばない。1つの名前で2つの物を指さない」
を正本として持っており、地図だけがそれを外れていた。
"""
import argparse
import json
import re
import sys
from pathlib import Path

SKIP_DIRS = {'.git', '.claude', 'node_modules', 'bin', 'obj', '.tmp', '.doc', 'target', 'packages'}
SUFFIXES = {'.md', '.cs', '.json', '.ps1', '.py', '.txt'}
# 表示名として読まれる場所。ここに出る語だけを点検する (説明文は自由に書いてよい)。
# 名詞 (層・実体・項目) と 句 (関連・流れ・画面) は分ける。句は repository に丸ごと在るはずが無い
def display_names(map_data, with_fields):
    nouns, phrases = [], []
    for layer in map_data.get('layers', []):
        nouns.append(('層', layer.get('id', ''), layer.get('short', '')))
    for entity in map_data.get('entities', []):
        nouns.append(('実体', entity.get('id', ''), entity.get('name', '')))
        for field in entity.get('fields', []) if with_fields else []:
            if not field.get('auto'):
                nouns.append(('項目', f"{entity.get('id')}.{field.get('physical', '')}", field.get('name', '')))
    for relation in map_data.get('relations', []):
        phrases.append(('関連', f"{relation.get('from')}→{relation.get('to')}", relation.get('label', '')))
    for step in map_data.get('flow', {}).get('steps', []):
        phrases.append(('流れ', step.get('id', ''), step.get('title', '')))
    for screen in map_data.get('screens', []):
        phrases.append(('画面', screen.get('id', ''), screen.get('title', '')))
    keep = lambda rows: [(k, w, t) for k, w, t in rows if t]
    return keep(nouns), keep(phrases)


def load_corpus(root):
    texts = []
    for path in root.rglob('*'):
        if path.suffix.lower() not in SUFFIXES or not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        try:
            texts.append(path.read_text(encoding='utf-8', errors='ignore'))
        except OSError:
            continue
    return texts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('map')
    parser.add_argument('--src', default='.')
    parser.add_argument('--fields', action='store_true', help='項目名も点検する (既定は層と実体だけ)')
    args = parser.parse_args()

    map_data = json.loads(Path(args.map).read_text(encoding='utf-8'))
    words = map_data.get('meta', {}).get('words', {})
    corpus = load_corpus(Path(args.src))
    print(f'読んだ file: {len(corpus)}')

    def file_hits(word):
        return sum(1 for text in corpus if word in text)

    nouns, phrases = display_names(map_data, args.fields)
    unknown, coined = [], []
    for kind, where, text in nouns:
        if file_hits(text):
            continue
        parts = [p for p in text.split('の') if len(p) >= 2]
        if len(parts) > 1 and all(file_hits(p) for p in parts):
            coined.append((kind, where, text))
        else:
            unknown.append((kind, where, text))
    print(f'名詞の表示名: {len(nouns)} / この repository に無い語: {len(unknown)} / 既出の語を繋いだ造語: {len(coined)}')
    for kind, where, text in unknown:
        print(f'  無 {kind} {where}: {text}')
    for kind, where, text in coined:
        print(f'  造 {kind} {where}: {text}')

    # 用語集がある地図なら、図の大きな字で出る語に説明が付いているかを見る
    terms = map_data.get('terms', [])
    if terms:
        explained = {t.get('word') for t in terms}
        missing = [(k, w, t) for k, w, t in nouns if t not in explained]
        print(f'用語集: {len(terms)} 語 / 説明の無い表示名: {len(missing)}')
        for kind, where, text in missing:
            print(f'  説明無 {kind} {where}: {text}')
    else:
        missing = []

    same = words.get('same', [])
    mixed = 0
    joined = '\n'.join(text for _, _, text in nouns + phrases)
    for group in same:
        found = [(w, len(re.findall(re.escape(w), joined))) for w in group]
        found = [(w, n) for w, n in found if n]
        if len(found) > 1:
            mixed += 1
            print('  ゆれ ' + ' / '.join(f'{w}×{n}' for w, n in found))
    if same:
        print(f'同じ物の組: {len(same)} / 2つ以上の呼び方が出ている組: {mixed}')

    avoid = words.get('avoid', {})
    hit_avoid = [(w, why) for w, why in avoid.items() if re.search(re.escape(w), joined)]
    for word, why in hit_avoid:
        print(f'  禁 {word}: {why}')
    if avoid:
        print(f'使わないと決めた語: {len(avoid)} / 出ている: {len(hit_avoid)}')

    problems = len(unknown) + len(coined) + len(missing) + mixed + len(hit_avoid)
    print(f'問題: {problems}')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
