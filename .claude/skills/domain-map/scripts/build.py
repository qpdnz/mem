"""domain-map: 地図の定義 (JSON) を検査し、4つの図を持つ1枚の HTML へ組み立てる。

使い方:
    python build.py <map.json>              # 同じ folder の index.html を書く
    python build.py <map.json> -o out.html  # 出力先を指定
    python build.py <map.json> --check      # 検査だけ

外部 package は使わない。検査で誤りが1件でもあれば HTML を書かずに exit 1。
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from collections import Counter
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
KEYS = {"PK", "FK", "UQ"}
CARDS = {"1:1", "1:N", "N:1", "N:N", "0..1:N", "1:0..1"}


def split_keys(value) -> list[str]:
    if value is None:
        return []
    raw = value if isinstance(value, list) else str(value).replace("+", ",").replace("/", ",").split(",")
    return [str(k).strip().upper() for k in raw if str(k).strip()]


def is_cell(value) -> bool:
    return isinstance(value, list) and len(value) == 2 and all(isinstance(v, int) and v >= 0 for v in value)


def validate(m: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    def unique(items: list[dict], where: str) -> dict[str, dict]:
        seen: dict[str, dict] = {}
        for i, item in enumerate(items):
            item_id = item.get("id")
            if not isinstance(item_id, str) or not item_id:
                errors.append(f"{where}[{i}]: id がありません")
                continue
            if ":" in item_id:
                errors.append(f"{where}[{i}] {item_id}: id に ':' は使えません")
            if item_id in seen:
                errors.append(f"{where}: id '{item_id}' が重複しています")
            seen[item_id] = item
        return seen

    meta = m.get("meta")
    if not isinstance(meta, dict) or not meta.get("title"):
        errors.append("meta.title がありません")

    layers = unique(m.get("layers", []), "layers")
    entities = unique(m.get("entities", []), "entities")
    flow = m.get("flow") or {}
    actors = unique(flow.get("actors", []), "flow.actors")
    steps = unique(flow.get("steps", []), "flow.steps")
    screens = unique(m.get("screens", []), "screens")

    overlap =(set(entities) & set(steps)) | (set(entities) & set(screens)) | (set(steps) & set(screens))
    for item_id in sorted(overlap):
        warnings.append(f"id '{item_id}' が実体・業務・画面の間で重複しています (URLの#で区別はできます)")

    for entity_id, entity in entities.items():
        where = f"entities.{entity_id}"
        if not entity.get("name"):
            errors.append(f"{where}: name がありません")
        if entity.get("layer") and entity["layer"] not in layers:
            errors.append(f"{where}: layer '{entity['layer']}' が layers にありません")
        for key in ("at", "erAt"):
            if key in entity and not is_cell(entity[key]):
                errors.append(f"{where}.{key}: [列, 行] の0以上の整数2つで書いてください")
        fields = entity.get("fields", [])
        if not fields:
            warnings.append(f"{where}: 項目 (fields) が0件です")
        physical = Counter(f.get("physical") for f in fields if f.get("physical"))
        for dup, count in physical.items():
            if count > 1:
                errors.append(f"{where}: 項目の physical '{dup}' が{count}回あります")
        for i, field in enumerate(fields):
            fwhere = f"{where}.fields[{i}]"
            if not field.get("name"):
                errors.append(f"{fwhere}: name がありません")
            bad = [k for k in split_keys(field.get("key")) if k not in KEYS]
            if bad:
                errors.append(f"{fwhere}: key {bad} は PK / FK / UQ のどれかにしてください")
            ref = field.get("ref")
            if ref:
                target_id, _, target_field = str(ref).partition(".")
                target = entities.get(target_id)
                if not target:
                    errors.append(f"{fwhere}: ref '{ref}' の実体がありません")
                elif target_field and target_field not in {f.get("physical") or f.get("name") for f in target.get("fields", [])}:
                    errors.append(f"{fwhere}: ref '{ref}' の項目がありません")
            if "values" in field and not (isinstance(field["values"], list) and all(isinstance(v, str) for v in field["values"])):
                errors.append(f"{fwhere}: values は文字列の配列にしてください")

    related = set()
    for i, relation in enumerate(m.get("relations", [])):
        where = f"relations[{i}]"
        for end in ("from", "to"):
            if relation.get(end) not in entities:
                errors.append(f"{where}: {end} '{relation.get(end)}' の実体がありません")
        related.update((relation.get("from"), relation.get("to")))
        if relation.get("card") and relation["card"] not in CARDS:
            warnings.append(f"{where}: card '{relation['card']}' は想定外の書き方です")
        via = relation.get("via")
        child = entities.get(relation.get("to"))
        if via and child and via not in {f.get("physical") or f.get("name") for f in child.get("fields", [])}:
            errors.append(f"{where}: via '{via}' が子 '{relation.get('to')}' の項目にありません")
    for entity_id in entities:
        if entity_id not in related:
            warnings.append(f"entities.{entity_id}: どの関連にも出てきません (図で孤立します)")

    for step_id, step in steps.items():
        where = f"flow.steps.{step_id}"
        if not step.get("title"):
            errors.append(f"{where}: title がありません")
        if step.get("actor") and step["actor"] not in actors:
            errors.append(f"{where}: actor '{step['actor']}' が flow.actors にありません")
        for used in step.get("uses", []):
            if used not in entities:
                errors.append(f"{where}.uses: 実体 '{used}' がありません")
        if step.get("screen") and step["screen"] not in screens:
            errors.append(f"{where}.screen: 画面 '{step['screen']}' がありません")
        if "at" in step and not is_cell(step["at"]):
            errors.append(f"{where}.at: [列, 行] の0以上の整数2つで書いてください")
    for i, link in enumerate(flow.get("links", [])):
        for end in ("from", "to"):
            if link.get(end) not in steps:
                errors.append(f"flow.links[{i}]: {end} '{link.get(end)}' の業務がありません")

    for screen_id, screen in screens.items():
        where = f"screens.{screen_id}"
        if not screen.get("title"):
            errors.append(f"{where}: title がありません")
        if screen.get("layer") and screen["layer"] not in layers:
            errors.append(f"{where}: layer '{screen['layer']}' が layers にありません")
        for used in screen.get("uses", []):
            if used not in entities:
                errors.append(f"{where}.uses: 実体 '{used}' がありません")
        if "mock" in screen and not isinstance(screen["mock"], list):
            errors.append(f"{where}.mock: 配列にしてください")
        if "at" in screen and not is_cell(screen["at"]):
            errors.append(f"{where}.at: [列, 行] の0以上の整数2つで書いてください")
    for i, link in enumerate(m.get("screenLinks", [])):
        for end in ("from", "to"):
            if link.get(end) not in screens:
                errors.append(f"screenLinks[{i}]: {end} '{link.get(end)}' の画面がありません")

    terms = unique(m.get("terms", []), "terms")
    words: dict[str, str] = {}
    for term_id, term in terms.items():
        where = f"terms.{term_id}"
        word = term.get("word")
        if not word:
            errors.append(f"{where}: word がありません")
        if word in words:
            errors.append(f"{where}: 語 '{word}' は '{words[word]}' と重複しています (1語1項目)")
        words[word] = term_id
        if not term.get("short"):
            errors.append(f"{where}: short (1行の意味) がありません")
        for seen in term.get("see", []):
            if seen not in entities and seen not in steps and seen not in screens:
                errors.append(f"{where}.see: '{seen}' が実体・業務・画面のどれにもありません")

    targets = {"entity": entities, "step": steps, "screen": screens, "term": terms}
    for i, step in enumerate((m.get("demo") or {}).get("steps", [])):
        target = step.get("target") or next((f"{k}:{step[k]}" for k in ("screen", "step", "entity") if step.get(k)), "")
        kind, _, target_id = target.partition(":")
        if kind not in targets or target_id not in targets[kind]:
            errors.append(f"demo.steps[{i}]: 対象 '{target}' がありません")

    def cell_clash(where: str, items: dict[str, dict], key: str, fallback: str | None = None) -> None:
        cells: dict[tuple[int, int], str] = {}
        for item_id, item in items.items():
            at = item.get(key) or (item.get(fallback) if fallback else None)
            if not is_cell(at):
                continue
            cell = (at[0], at[1])
            if cell in cells:
                errors.append(f"{where}: '{cells[cell]}' と '{item_id}' が同じ位置 {list(cell)} にあります")
            cells[cell] = item_id

    cell_clash("概念図", entities, "at")
    cell_clash("ER図", entities, "erAt", "at")
    cell_clash("業務フロー", steps, "at")
    cell_clash("画面UI", screens, "at")
    return errors, warnings


def render(m: dict) -> str:
    shell = (ASSETS / "shell.html").read_text(encoding="utf-8")
    css = (ASSETS / "map.css").read_text(encoding="utf-8")
    scripts = "\n".join(p.read_text(encoding="utf-8") for p in sorted((ASSETS / "js").glob("*.js")))
    data = json.dumps(m, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    title = html.escape(str((m.get("meta") or {}).get("title") or "domain map"))
    return (shell
            .replace("__TITLE__", title)
            .replace("<!--__CSS__-->", "<style>\n" + css + "</style>")
            .replace("__MAP_JSON__", data)
            .replace("<!--__JS__-->", "<script>\n(() => {\n'use strict';\n" + scripts + "\n})();\n</script>"))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="地図の定義を検査して HTML を組み立てる")
    parser.add_argument("definition", type=Path)
    parser.add_argument("-o", "--out", type=Path)
    parser.add_argument("--check", action="store_true", help="検査だけして書かない")
    args = parser.parse_args()

    try:
        m = json.loads(args.definition.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"定義を読めません: {error}")
        return 1

    errors, warnings = validate(m)
    for warning in warnings:
        print(f"warn  {warning}")
    for error in errors:
        print(f"error {error}")
    entities = m.get("entities", [])
    flow = m.get("flow") or {}
    summary = (f"{len(entities)} 実体 / {len(m.get('relations', []))} 関連 / "
               f"{sum(len(e.get('fields', [])) for e in entities)} 項目 / "
               f"業務 {len(flow.get('steps', []))} / 画面 {len(m.get('screens', []))}"
               + (f" / 用語 {len(m['terms'])}" if m.get("terms") else ""))
    if errors:
        print(f"NG: 誤り {len(errors)} 件 ({summary})")
        return 1
    if args.check:
        print(f"ok: {summary}")
        return 0

    out = args.out or args.definition.with_name("index.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(m), encoding="utf-8", newline="\n")
    print(f"ok: {summary} → {out} ({out.stat().st_size // 1024} KB, 警告 {len(warnings)} 件)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
