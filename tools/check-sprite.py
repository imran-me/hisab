#!/usr/bin/env python3
"""
Hisab - icon sprite validator

    python tools/check-sprite.py

Written after losing a while to a sprite that fetched with a 200, contained
every id in its source, and rendered nothing at all. Three separate traps, each
of which fails silently:

1. AN .svg IS PARSED AS XML. A doubled hyphen inside an XML comment is a fatal
   parse error, so writing a CSS custom property name in prose in the header
   comment kills the whole document. Nothing in the network tab looks wrong.

2. display:none ON THE ROOT hides every symbol when the file is referenced
   externally by <use>. It is the correct idiom for a sprite pasted inline, and
   the exact opposite of correct here.

3. A TYPO IN AN ICON NAME renders nothing, with no console error. icon('trash')
   and icon('trashcan') look equally fine in a code review.

So this checks the file parses, that the root is not hidden, that every symbol
is well formed, and - the part that catches the most - that every icon name
referenced anywhere in the codebase actually exists in the sprite.

Exit code 1 on any failure, so it can gate a commit.
"""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPRITE = ROOT / "shared" / "icons" / "sprite.svg"
SVG_NS = "{http://www.w3.org/2000/svg}"

problems: list[str] = []
notes: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


def main() -> int:
    if not SPRITE.exists():
        fail(f"sprite not found at {SPRITE.relative_to(ROOT)}")
        return report()

    raw = SPRITE.read_text(encoding="utf-8")

    # --- 1. the doubled hyphen, checked before parsing so the message is useful
    for match in re.finditer(r"<!--(.*?)-->", raw, re.S):
        body = match.group(1)
        hit = body.find("--")
        if hit != -1:
            line = raw[: match.start(1) + hit].count("\n") + 1
            fail(
                f"line {line}: a doubled hyphen inside an XML comment. "
                f"This is a fatal parse error and the whole sprite stops rendering."
            )

    # --- 2. does it parse
    try:
        tree = ET.parse(SPRITE)
    except ET.ParseError as err:
        fail(f"the sprite is not well-formed XML: {err}")
        return report()

    root = tree.getroot()

    # --- 3. a hidden root hides every symbol under an external <use>
    style = (root.get("style") or "").replace(" ", "")
    if "display:none" in style:
        fail(
            'the root element has display:none. That hides every symbol when the '
            'file is referenced externally by <use>. Use width="0" height="0".'
        )

    # --- 4. the symbols themselves
    symbols = root.findall(f"{SVG_NS}symbol")
    if not symbols:
        fail("no <symbol> elements found")
        return report()

    ids: set[str] = set()
    for symbol in symbols:
        sid = symbol.get("id")
        if not sid:
            fail("a <symbol> has no id")
            continue
        if sid in ids:
            fail(f"duplicate symbol id: {sid}")
        ids.add(sid)

        if not sid.startswith("i-"):
            fail(f"{sid}: every symbol id is prefixed 'i-'")

        if not symbol.get("viewBox"):
            fail(f"{sid}: no viewBox, so it will not scale to its <use> box")

        # The set is stroke-only by design: that is what lets a single icon
        # inherit any text colour through currentColor with no per-colour
        # variant. A stray fill= is a glyph that stays the wrong colour in one
        # theme and nobody notices until day mode.
        for node in symbol.iter():
            fill = node.get("fill")
            if fill and fill not in ("none",):
                fail(f"{sid}: <{node.tag.replace(SVG_NS, '')}> has fill=\"{fill}\"; the set is stroke-only")
            if node.get("stroke") and node.get("stroke") != "currentColor":
                fail(f"{sid}: hardcoded stroke=\"{node.get('stroke')}\"; colour comes from .icon")

    notes.append(f"{len(ids)} symbols, {SPRITE.stat().st_size / 1024:.1f} KB")

    # --- 5. every name the codebase asks for must exist
    #
    # Two spellings are in use and both are checked:
    #   icon('name')                     from shared/js/core/dom.js
    #   <use href="....svg#i-name"/>     written directly in HTML
    #   icon: 'name'                     a name carried in a data structure
    #
    # The third pattern is not optional. Most icons in this product are not
    # named at their call site at all - the call is icon(type.icon), and the
    # literal lives in a TYPES array three files away. Without this pattern the
    # scanner reported fifty of fifty-seven symbols as unused, which is the kind
    # of wrong that gets a tool ignored.
    used: dict[str, set[str]] = {}

    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".js", ".html"}:
            continue
        if any(part in {".git", "node_modules", "vendor"} for part in path.parts):
            continue
        if path.name == "sprite.svg":
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        rel = str(path.relative_to(ROOT)).replace("\\", "/")

        for match in re.finditer(r"""\bicon\(\s*['"]([a-z0-9-]+)['"]""", text):
            used.setdefault(f"i-{match.group(1)}", set()).add(rel)
        for match in re.finditer(r"""sprite\.svg#(i-[a-z0-9-]+)""", text):
            used.setdefault(match.group(1), set()).add(rel)
        for match in re.finditer(r"""icon:\s*['"]([a-z0-9-]+)['"]""", text):
            used.setdefault(f"i-{match.group(1)}", set()).add(rel)

    for name in sorted(used):
        if name not in ids:
            where = ", ".join(sorted(used[name])[:3])
            fail(f"{name} is referenced but not in the sprite ({where})")

    unused = sorted(ids - set(used))
    if unused:
        # Not a failure. An icon drawn ahead of the screen that will use it is
        # fine; an icon nobody ever uses is 200 bytes.
        notes.append(f"{len(unused)} unused: {', '.join(n[2:] for n in unused)}")

    notes.append(f"{len(used)} distinct icons referenced across the codebase")
    return report()


def report() -> int:
    for note in notes:
        print(f"  {note}")
    if problems:
        print(f"\n  {len(problems)} PROBLEM{'S' if len(problems) > 1 else ''}\n")
        for problem in problems:
            print(f"  x {problem}")
        return 1
    print("\n  sprite ok\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
