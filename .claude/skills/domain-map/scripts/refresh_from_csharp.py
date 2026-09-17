"""地図の定義 (map.json) の項目と値を、C# の宣言から更新する。

実体に `code` で型を結びつけておくと、項目の並び・型・enum の値をコードから作り直す。
人が書いた名前・説明・参照 (name / note / key / ref) は物理名で引き当てて残す。
コードに無い項目は消し、コードにだけある項目は「名前未設定」で足して、差分を報告する。

使い方:
    python refresh_from_csharp.py <map.json> --src <src_dir>           # 差分を見るだけ
    python refresh_from_csharp.py <map.json> --src <src_dir> --write   # 書き戻す

結びつけ方 (実体の "code"):
    {"types": ["Vo_WorkSession"]}                       型のプロパティを順に
    {"types": ["Vo_X"], "file": "src/engine/"}          同名の型が複数ある時の置き場の手がかり
    {"types": ["Inf_X"], "expand": ["patterns"]}        一覧の要素型を "patterns[].子" として展開
    {"enum": "EBlaBor__Field", "prefix": "task"}        enum の値を項目にする (DB の列名など)
    {"table": "history"}                                DDL の表の列
項目に "manual": true を付けると、コードと無関係な項目として位置ごと残す。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from csharp_facts import read_facts  # noqa: E402

COLLECTION = re.compile(r"^(?:ImmutableArray|List|IReadOnlyList|IEnumerable|ImmutableList|HashSet)<(?P<inner>.+)>$")
DICTIONARY = re.compile(r"^(?:Dictionary|ImmutableDictionary|IReadOnlyDictionary)<(?P<inner>.+)>$")


def simplify_type(text: str) -> tuple[str, str, bool]:
    """表示用の型名、要素の型名、空を許すか。"""
    nullable = text.endswith("?")
    core = text.rstrip("?")
    match = COLLECTION.match(core)
    if match:
        element = match.group("inner").strip()
        return element + "[]", element.rstrip("?"), nullable
    if core.endswith("[]"):
        element = core[:-2]
        return core, element, nullable
    match = DICTIONARY.match(core)
    if match:
        return "map<" + match.group("inner").replace(" ", "") + ">", "", nullable
    return core, core, nullable


def pick(declarations: list[dict], hint: str | None) -> dict | None:
    if not declarations:
        return None
    if hint:
        matched = [d for d in declarations if hint in d["file"]]
        if matched:
            return matched[0]
    return declarations[0]


def enum_values(facts: dict, name: str) -> list[str] | None:
    decl = pick(facts["enums"].get(name, []), None)
    if not decl:
        return None
    values, ordinal = [], 0
    for member in decl["members"]:
        if member["value"] and re.fullmatch(r"-?\d+", member["value"]):
            ordinal = int(member["value"])
        values.append(f"{member['name']}={ordinal}")
        ordinal += 1
    return values


def usage_count(src: Path, member: str, declaration_file: str) -> int:
    pattern = re.compile(r"\." + re.escape(member) + r"\b")
    count = 0
    for path in src.rglob("*.cs"):
        if {"bin", "obj", "bin_obj"} & set(path.parts):
            continue
        if path.relative_to(src.parent).as_posix() == declaration_file:
            continue
        count += len(pattern.findall(path.read_text(encoding="utf-8-sig", errors="replace")))
    return count


def code_fields(binding: dict, facts: dict, src: Path, problems: list[str]) -> tuple[list[dict], list[str]]:
    fields: list[dict] = []
    sources: list[str] = []
    hint = binding.get("file")
    expand = set(binding.get("expand", []))

    def add_type(type_name: str, prefix: str) -> None:
        decl = pick(facts["types"].get(type_name, []), hint)
        if not decl:
            problems.append(f"型 {type_name} が見つからない")
            return
        if not prefix:
            sources.append(f"{decl['file']}:{decl['line']}")
        for prop in decl["properties"]:
            physical = prefix + (prop["json"] or prop["name"])
            shown, element, nullable = simplify_type(prop["type"])
            field = {"physical": physical, "type": shown, "line": prop["line"], "comment": prop["comment"]}
            if nullable:
                field["nullable"] = True
            values = enum_values(facts, element)
            if values:
                field["values"] = values
            fields.append(field)
            if physical in expand and element in facts["types"]:
                add_type(element, physical + ("[]." if shown.endswith("[]") else "."))

    for type_name in binding.get("types", []):
        add_type(type_name, "")
    if "enum" in binding:
        decl = pick(facts["enums"].get(binding["enum"], []), hint)
        if not decl:
            problems.append(f"enum {binding['enum']} が見つからない")
        else:
            sources.append(f"{decl['file']}:{decl['line']}")
            for member in decl["members"]:
                if member["name"].startswith(binding.get("prefix", "")):
                    field = {"physical": member["name"], "type": None, "line": member["line"], "comment": member["comment"]}
                    if usage_count(src, member["name"], decl["file"]) == 0:
                        field["unused"] = True
                    fields.append(field)
    if "table" in binding:
        table = facts["tables"].get(binding["table"])
        if not table:
            problems.append(f"表 {binding['table']} が見つからない")
        else:
            sources.append(f"{table['file']}:{table['line']}")
            for column in table["columns"]:
                field = {"physical": column["name"], "type": column["type"], "line": None, "comment": ""}
                if "PRIMARY KEY" in column["constraints"].upper():
                    field["key"] = "PK"
                fields.append(field)
    return fields, sources


def refresh_entity(entity: dict, facts: dict, src: Path) -> dict:
    report = {"id": entity["id"], "added": [], "removed": [], "typeChanged": [], "valuesChanged": [], "unused": [], "problems": []}
    fields_now = entity.get("fields", [])
    generated, sources = code_fields(entity["code"], facts, src, report["problems"])
    if report["problems"]:
        return report
    first_bound = next((i for i, f in enumerate(fields_now) if not f.get("manual")), len(fields_now))
    head = [f for f in fields_now[:first_bound] if f.get("manual")]
    tail = [f for f in fields_now[first_bound:] if f.get("manual")]
    known = {f.get("physical"): f for f in fields_now if not f.get("manual")}
    merged = []
    for item in generated:
        old = known.pop(item["physical"], None)
        if old is None:
            field = {"name": item["physical"], "physical": item["physical"], "auto": True,
                     "note": "code から足した項目。名前と意味はまだ書いていない"}
            if item["comment"]:
                field["note"] = item["comment"]
            report["added"].append(item["physical"])
        else:
            field = dict(old)
            if field.get("name") != field.get("physical"):
                field.pop("auto", None)
        if item.get("type") is not None:
            if old is not None and old.get("type") != item["type"]:
                report["typeChanged"].append(f"{item['physical']}: {old.get('type')} → {item['type']}")
            field["type"] = item["type"]
        if item.get("key") and not field.get("key"):
            field["key"] = item["key"]
        if item.get("nullable"):
            field["nullable"] = True
        if "values" in item:
            if old is not None and old.get("values") != item["values"]:
                report["valuesChanged"].append(item["physical"])
            field["values"] = item["values"]
        if item.get("unused"):
            field["unused"] = True
            report["unused"].append(item["physical"])
        else:
            field.pop("unused", None)
        merged.append(field)
    report["removed"] = [physical for physical in known]
    entity["fields"] = head + merged + tail
    existing = entity.get("source", [])
    existing = [existing] if isinstance(existing, str) else existing
    bound_files = {line.split(":")[0] for line in sources}
    entity["source"] = sources + [line for line in existing if line.split(":")[0] not in bound_files]
    return report


def dump(value, indent: int = 0) -> str:
    """読みやすい JSON: 短い物は1行、長い物だけ折り返す。"""
    inline = json.dumps(value, ensure_ascii=False)
    if len(inline) + indent <= 150 or not isinstance(value, (dict, list)) or not value:
        return inline
    pad, inner = " " * indent, " " * (indent + 2)
    if isinstance(value, list):
        return "[\n" + ",\n".join(inner + dump(v, indent + 2) for v in value) + "\n" + pad + "]"
    return "{\n" + ",\n".join(f"{inner}{json.dumps(k, ensure_ascii=False)}: {dump(v, indent + 2)}" for k, v in value.items()) + "\n" + pad + "}"


# 画面の一覧は手で書くと、画面が増えた時に気づけない。code の登録から拾って差分を出す。
# 何の型で登録するかは repository ごとに違うので、探し方は定義の meta.screenSource に書かせる。
#   "screenSource": { "files": "src/**/Boot_Visualizer*.cs", "title": "title = \"(?P<title>[^\"]+)\"" }
# 足すのは title と出典だけ。説明・すること・線画は人が書く物なので作らない。
# 根拠: 実測 2026-09-18。新しい「仕事の地図」画面 (Boot_Visualizer__TaskMap) が
# 09-16 に作った地図の12画面に入っておらず、2日で古くなっていた。
def check_screens(definition: dict, src: Path, write: bool) -> int:
    spec = definition.get("meta", {}).get("screenSource")
    if not spec:
        print("meta.screenSource が無いので画面は見ない")
        return 0
    title_re = re.compile(spec.get("title", r'title\s*=\s*"(?P<title>[^"]+)"'))
    root = src if src.is_dir() else src.parent
    found: dict[str, str] = {}
    for path in sorted(root.glob(spec.get("files", "**/*.cs").replace("src/", "", 1))):
        try:
            text = path.read_text(encoding="utf-8-sig", errors="replace")
        except OSError:
            continue
        for match in title_re.finditer(text):
            title = match.group("title") if "title" in (title_re.groupindex or {}) else match.group(1)
            found.setdefault(title, f"{path.as_posix()}")
    screens = definition.setdefault("screens", [])
    known = {screen.get("title") for screen in screens}
    added = [t for t in found if t not in known]
    missing = [s.get("title") for s in screens if s.get("title") not in found and not s.get("manual")]
    for title in added:
        print(f"  code にあって地図に無い画面: {title} ({found[title]})")
    for title in missing:
        print(f"  地図にあって code に無い画面: {title} (消えたか、名前が変わったか、探し方が合っていない)")
    print(f"画面: code {len(found)} / 地図 {len(screens)} / 足りない {len(added)} / 余っている {len(missing)}")
    if write:
        for title in added:
            screens.append({"id": "sc_auto_" + str(len(screens) + 1), "title": title, "auto": True,
                            "summary": "", "source": found[title]})
        if added:
            print(f"  {len(added)} 画面を足した (説明・すること・線画は人が書く)")
    return len(added) + len(missing)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="地図の項目と値を C# の宣言から更新する")
    parser.add_argument("definition", type=Path)
    parser.add_argument("--src", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--screens", action="store_true", help="画面の一覧も code の登録と突き合わせる")
    args = parser.parse_args()
    src = args.src.resolve()
    definition = json.loads(args.definition.read_text(encoding="utf-8"))
    if args.screens:
        check_screens(definition, src, args.write)
    facts = read_facts(src)
    bound = [e for e in definition.get("entities", []) if e.get("code")]
    reports = [refresh_entity(entity, facts, src) for entity in bound]
    changed = 0
    for report in reports:
        parts = []
        for key, label in (("added", "足した"), ("removed", "消した"), ("typeChanged", "型が変わった"),
                           ("valuesChanged", "値の一覧が変わった"), ("unused", "宣言だけで使われていない"), ("problems", "問題")):
            if report[key]:
                parts.append(f"{label} {len(report[key])}: {', '.join(report[key][:6])}{' …' if len(report[key]) > 6 else ''}")
        if parts:
            changed += 1
            print(f"- {report['id']}\n    " + "\n    ".join(parts))
    manual = [e["id"] for e in definition.get("entities", []) if not e.get("code")]
    print(f"結びつけた実体 {len(bound)} / 差分のあった実体 {changed} / 結びつけていない実体 {len(manual)}: {', '.join(manual)}")
    if any(r["problems"] for r in reports):
        print("NG: 結びつけ先が見つからない実体がある。書き戻さない")
        return 1
    if args.write:
        args.definition.write_text(dump(definition) + "\n", encoding="utf-8", newline="\n")
        print(f"書き戻した: {args.definition}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
