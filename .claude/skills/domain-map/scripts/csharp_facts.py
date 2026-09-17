"""C# の宣言から、地図に要る事実 (型のプロパティ・enum の値・DDL の表) を抜き出す。

prefix が役割を名乗り、宣言の書式が揃っている repository を前提に、構文解析器を使わず
正規表現で読む。Visualizer の Roslyn 解析より粗いが、Visualizer を起動しなくても
いつでも同じ結果を出せる。`public ... { get` を含むのにプロパティとして読めなかった行は
unread に残す (黙って欠けさせない)。
実測 2026-09-18: `Vo_`・`Inf_` の file で「{ get を含む行」を別に数えた 2,324件と一致。
2行に分けた宣言 (型と名前の行 + 次の行の { get; init; }) を最初は取りこぼしていた。

使い方:
    python csharp_facts.py <src_dir> [-o facts.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

TYPE_DECL = re.compile(
    r"^\s*(?:(?:public|internal|private|protected|sealed|static|abstract|partial|readonly|file|ref)\s+)*"
    r"(?P<kind>class|record|struct|enum|interface)\s+(?P<name>[A-Za-z_]\w*)"
)
PROPERTY = re.compile(
    r"^\s*(?P<mods>(?:(?:public|internal|required|virtual|override|new|static|protected)\s+)+)"
    r"(?P<type>[A-Za-z_][\w.]*(?:<[^{};=]*>)?(?:\[\])?\??)\s+(?P<name>[A-Za-z_]\w*)\s*\{\s*(?:get|init|set)"
)
ATTRIBUTE_JSON = re.compile(r'JsonPropertyName\(\s*"(?P<json>[^"]+)"\s*\)')
ENUM_MEMBER = re.compile(r"^\s*(?P<name>[A-Za-z_]\w*)\s*(?:=\s*(?P<value>[^,/]+?))?\s*,?\s*(?://.*)?$")
CREATE_TABLE = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>\w+)\s*\((?P<body>.*?)\)\s*;", re.S | re.I)
SKIP_DIRS = {"bin", "obj", "bin_obj"}


def strip_code(line: str) -> str:
    """文字列と行末 comment を取り除き、波括弧の数え間違いを防ぐ。"""
    out = re.sub(r'@?"(?:[^"\\]|\\.)*"', '""', line)
    out = re.sub(r"'(?:[^'\\]|\\.)'", "''", out)
    return out.split("//", 1)[0]


def read_facts(src: Path) -> dict:
    types: dict[str, list[dict]] = {}
    enums: dict[str, list[dict]] = {}
    tables: dict[str, dict] = {}
    unread: list[str] = []
    files = [p for p in src.rglob("*.cs") if not SKIP_DIRS.intersection(p.parts)]
    for path in sorted(files):
        rel = path.relative_to(src.parent).as_posix()
        # UTF-8 以外で保存された file が混じる repository がある (実測 2026-09-18: fps4 に Shift-JIS)。
        # 読める所だけ読む。落とすと1 file のせいで全体が止まる
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        for match in CREATE_TABLE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            tables[match.group("name")] = {"file": rel, "line": line, "columns": read_columns(match.group("body"))}
        read_types(text.splitlines(), rel, types, enums, unread)
    return {
        "types": types,
        "enums": enums,
        "tables": tables,
        "counts": {
            "files": len(files),
            "types": sum(len(v) for v in types.values()),
            "properties": sum(len(d["properties"]) for v in types.values() for d in v),
            "enums": sum(len(v) for v in enums.values()),
            "tables": len(tables),
            "unreadPropertyLikeLines": len(unread),
        },
        "unread": unread[:50],
    }


def read_columns(body: str) -> list[dict]:
    columns = []
    for raw in re.split(r",\s*\n", body):
        part = " ".join(raw.split())
        if not part or part.upper().startswith(("PRIMARY KEY", "UNIQUE", "FOREIGN KEY", "CHECK", "CONSTRAINT")):
            continue
        name, _, rest = part.partition(" ")
        kind, _, constraints = rest.partition(" ")
        columns.append({"name": name, "type": kind, "constraints": constraints})
    return columns


def read_types(lines: list[str], rel: str, types: dict, enums: dict, unread: list[str]) -> None:
    depth = 0
    stack: list[dict] = []  # 開いている型宣言 (本体の深さ付き)
    pending: dict | None = None
    comments: list[str] = []
    attributes: list[str] = []
    for index, line in enumerate(lines, start=1):
        stripped = line.strip()
        current = stack[-1] if stack else None
        if stripped.startswith("//"):
            comments.append(stripped.lstrip("/").strip())
        elif stripped.startswith("["):
            attributes.append(stripped)
        else:
            decl = TYPE_DECL.match(line)
            if decl:
                pending = {"name": decl.group("name"), "kind": decl.group("kind"), "file": rel, "line": index,
                           "comment": " ".join(comments)}
            elif current and depth == current["depth"]:
                if current["kind"] == "enum":
                    member = ENUM_MEMBER.match(line)
                    if member and stripped not in ("{", "}"):
                        current["decl"]["members"].append({
                            "name": member.group("name"),
                            "value": (member.group("value") or "").strip() or None,
                            "line": index,
                            "comment": " ".join(comments),
                        })
                else:
                    # 「型 名前」の行の次に「{ get; ... }」を置く2行書きも1つの宣言として読む
                    following = lines[index].strip() if index < len(lines) else ""
                    joined = line.rstrip() + " " + following if "{" not in line and re.match(r"^\{\s*(?:get|init|set)", following) else line
                    prop = PROPERTY.match(joined)
                    if prop and "static" not in prop.group("mods").split():
                        json_name = next((m.group("json") for a in attributes for m in [ATTRIBUTE_JSON.search(a)] if m), None)
                        current["decl"]["properties"].append({
                            "name": prop.group("name"),
                            "json": json_name,
                            "type": prop.group("type"),
                            "required": "required" in prop.group("mods").split(),
                            "line": index,
                            "comment": " ".join(comments),
                        })
                    elif re.match(r"^\s*(?:public|internal)\s+(?!static|const|class|record|struct|enum|interface|sealed|abstract|partial)\S.*\{\s*get", line):
                        unread.append(f"{rel}:{index}: {stripped}")
            comments = []
            attributes = []

        code = strip_code(line)
        for char in code:
            if char == "{":
                depth += 1
                if pending:
                    decl = {"kind": pending["kind"], "file": pending["file"], "line": pending["line"], "comment": pending["comment"]}
                    if pending["kind"] == "enum":
                        decl["members"] = []
                        enums.setdefault(pending["name"], []).append(decl)
                    else:
                        decl["properties"] = []
                        types.setdefault(pending["name"], []).append(decl)
                    stack.append({"name": pending["name"], "kind": pending["kind"], "depth": depth, "decl": decl})
                    pending = None
            elif char == "}":
                if stack and stack[-1]["depth"] == depth:
                    stack.pop()
                depth -= 1
        # 1行で閉じる enum (例: enum X { a, b }) の中身
        if pending is None and stack == [] and TYPE_DECL.match(line) and "{" in code and "}" in code:
            decl_match = TYPE_DECL.match(line)
            if decl_match.group("kind") == "enum":
                inner = code[code.index("{") + 1: code.rindex("}")]
                target = enums.get(decl_match.group("name"), [])
                if target:
                    target[-1]["members"] = [{"name": n.split("=")[0].strip(), "value": (n.split("=")[1].strip() if "=" in n else None),
                                              "line": index, "comment": ""} for n in inner.split(",") if n.strip()]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="C# の宣言から地図の事実を抜き出す")
    parser.add_argument("src", type=Path)
    parser.add_argument("-o", "--out", type=Path)
    args = parser.parse_args()
    facts = read_facts(args.src.resolve())
    text = json.dumps(facts, ensure_ascii=False, indent=1)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    print(json.dumps(facts["counts"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
