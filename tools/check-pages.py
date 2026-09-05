#!/usr/bin/env python3
"""
Hisab - page consistency check

    python tools/check-pages.py

Every page carries an identical inline <script> in its <head> that applies the
theme before the first paint. It has to be inline and it has to be duplicated,
because an imported module cannot run before paint and one white frame on every
navigation is exactly what it exists to prevent.

Duplicated code drifts. This asserts it has not:

1. Every page's pre-paint block is byte-for-byte identical to the others.
2. Every page has the required head furniture - charset, viewport, title,
   theme-color, the stylesheet, the manifest, and noindex (a private ledger has
   no business in a search index).
3. Every page's asset paths resolve to a real file from that page's own depth.
   A page two directories down needs ../../shared/... and a copy-pasted
   shared/... is a 404 that only appears on that one page.

It also prints the CSP hash for the pre-paint block. A Content-Security-Policy
that allows inline script by hash is the difference between a real policy and a
decorative one, and the hash changes whenever the block does - so it is emitted
here rather than being written by hand into .htaccess and quietly going stale.

Exit code 1 on any failure.
"""

from __future__ import annotations

import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# tools/ is developer scaffolding and is not deployed, so it is not held to the
# page contract.
SKIP_DIRS = {".git", "node_modules", "vendor", "tools"}

REQUIRED = [
    (r'<meta charset="UTF-8">', "a charset declaration, first in the head"),
    (r'name="viewport"[^>]*width=device-width', "a viewport meta"),
    (r"<title>[^<]+</title>", "a title"),
    (r'name="theme-color"', "a theme-color (the browser chrome is white without it)"),
    (r'name="robots"[^>]*noindex', "noindex - this is a private ledger"),
    (r'rel="stylesheet"[^>]*hisab\.css', "the shared stylesheet"),
    (r'rel="manifest"', "the web manifest"),
    (r'rel="icon"', "a favicon"),
    (r'class="skip-link"', "a skip link as the first focusable element"),
    (r'<script type="module"[^>]*shared/js/main\.js', "the shared boot script"),
]

problems: list[str] = []
notes: list[str] = []


def main() -> int:
    pages = [
        p for p in sorted(ROOT.rglob("*.html"))
        if not any(part in SKIP_DIRS for part in p.parts)
    ]

    if not pages:
        problems.append("no pages found")
        return report()

    blocks: dict[str, list[str]] = {}

    for page in pages:
        rel = str(page.relative_to(ROOT)).replace("\\", "/")
        text = page.read_text(encoding="utf-8")

        # --- 1. the pre-paint block
        match = re.search(r"<script>\s*(/\*.*?)</script>", text, re.S)
        if not match:
            problems.append(f"{rel}: no inline pre-paint script in the head")
        else:
            body = match.group(1).strip()
            blocks.setdefault(body, []).append(rel)

        # --- 2. the required head furniture
        for pattern, description in REQUIRED:
            if not re.search(pattern, text):
                problems.append(f"{rel}: missing {description}")

        # --- 3. asset paths resolve from THIS page's depth
        for attr in re.findall(r'(?:href|src)="([^"#:]+)"', text):
            if attr.startswith(("http", "//", "data:", "mailto:", "tel:", "?")):
                continue

            if attr.startswith("/"):
                # Root-absolute. 404.html is the one page that needs these: the
                # server returns it for a missing URL at ANY depth, so relative
                # paths would resolve against a location that does not exist and
                # the error page would arrive with no stylesheet. It does mean
                # the app must be deployed at a domain or subdomain root rather
                # than in a subfolder - see docs/DEPLOY-HOSTINGER.md.
                target = (ROOT / attr.lstrip("/")).resolve()
            else:
                target = (page.parent / attr).resolve()
            # A .html link to a page not built yet is a planned route, not a
            # broken asset - those are reported separately and do not fail.
            if not target.exists():
                if attr.endswith(".html"):
                    notes.append(f"{rel}: links to {attr}, which is not built yet")
                else:
                    problems.append(f"{rel}: {attr} does not resolve (looked for {target})")

    # --- the blocks must all be the same one
    if len(blocks) > 1:
        problems.append(
            f"the pre-paint block has drifted into {len(blocks)} different versions:"
        )
        for i, (_, files) in enumerate(sorted(blocks.items(), key=lambda kv: -len(kv[1])), 1):
            problems.append(f"    version {i}: {', '.join(files)}")

    if len(blocks) == 1:
        body = next(iter(blocks))
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        notes.append(f"{len(pages)} pages, pre-paint block identical in all of them")
        notes.append("")
        notes.append("Content-Security-Policy hash for the inline block:")
        notes.append(f"    'sha256-{digest}'")
        notes.append("")
        notes.append("If .htaccess does not contain that exact string, the theme")
        notes.append("block is being blocked and every page paints one white frame.")

        htaccess = ROOT / ".htaccess"
        if htaccess.exists():
            if f"sha256-{digest}" not in htaccess.read_text(encoding="utf-8"):
                problems.append(
                    "the CSP hash in .htaccess does not match the current pre-paint "
                    f"block. Replace it with 'sha256-{digest}'"
                )
            else:
                notes.append("  .htaccess carries the matching hash")

    return report()


def report() -> int:
    for note in notes:
        print(f"  {note}" if note else "")
    if problems:
        print(f"\n  {len(problems)} PROBLEM{'S' if len(problems) > 1 else ''}\n")
        for problem in problems:
            print(f"  x {problem}")
        return 1
    print("\n  pages ok\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
