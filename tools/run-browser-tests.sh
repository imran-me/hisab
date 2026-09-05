#!/usr/bin/env bash
# =============================================================================
# Hisab · browser test runner
#
#   tools/run-browser-tests.sh [port]
#
# Runs the tests that have to happen in a real browser — currently the vault's
# storage and session integration — and reports pass or fail with an exit code.
#
# WHY NOT --virtual-time-budget --dump-dom, which is the obvious way:
#
# That flag fast-forwards the clock whenever the main thread is idle. WebCrypto
# runs off-thread, so every await in a crypto test leaves the renderer idle and
# jumps the clock; worse, a scheduled five-minute idle-lock timer makes it jump
# five virtual minutes at a time. The run then stops at a different assertion
# for every budget value and looks exactly like a hang, with no error and no
# rejection. It is not one.
#
# So: no virtual time. The page sets document.title when it finishes, and this
# polls Chrome's DevTools target list — which is plain HTTP and needs no
# WebSocket client — until the title appears or the timeout expires.
# =============================================================================
set -uo pipefail

PORT="${1:-8777}"
DEBUG_PORT=9315
TIMEOUT=90
PROFILE="${TMPDIR:-/tmp}/hisab-test-profile-$$"

CHROME=""
for candidate in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "$(command -v google-chrome 2>/dev/null)" \
  "$(command -v chromium 2>/dev/null)"; do
  [ -x "$candidate" ] && { CHROME="$candidate"; break; }
done

if [ -z "$CHROME" ]; then
  echo "  Chrome not found. Install it, or run the pages by hand:"
  echo "    http://localhost:$PORT/tools/test-vault-browser.html"
  exit 1
fi

if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  echo "  No server on port $PORT. Start one first:"
  echo "    python -m http.server $PORT"
  exit 1
fi

PAGES=("tools/test-vault-browser.html")
FAILED=0

for page in "${PAGES[@]}"; do
  rm -rf "$PROFILE"
  "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --user-data-dir="$PROFILE" \
    --remote-debugging-port=$DEBUG_PORT \
    --remote-allow-origins="*" \
    "http://127.0.0.1:$PORT/$page" >/dev/null 2>&1 &
  CHROME_PID=$!

  title=""
  for _ in $(seq 1 $((TIMEOUT * 2))); do
    # The DevTools /json endpoint lists every open target with its title. No
    # WebSocket, no protocol client, no dependency.
    title=$(curl -s --max-time 2 "http://127.0.0.1:$DEBUG_PORT/json" 2>/dev/null \
      | tr ',' '\n' | grep '"title"' | sed 's/.*"title": *"//; s/"$//' | grep '^RESULT|' | head -1)
    [ -n "$title" ] && break
    sleep 0.5
  done

  kill $CHROME_PID 2>/dev/null
  wait $CHROME_PID 2>/dev/null
  rm -rf "$PROFILE"

  if [ -z "$title" ]; then
    echo "  x $page — no result after ${TIMEOUT}s"
    FAILED=1
    continue
  fi

  verdict=$(echo "$title" | cut -d'|' -f2)
  passed=$(echo "$title" | cut -d'|' -f3)
  fails=$(echo "$title" | cut -d'|' -f4)
  detail=$(echo "$title" | cut -d'|' -f5-)

  if [ "$verdict" = "PASS" ]; then
    echo "  $page — $passed assertions passed"
  else
    echo "  x $page — $fails FAILED, $passed passed"
    echo "      $detail"
    FAILED=1
  fi
done

exit $FAILED
