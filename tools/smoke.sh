#!/usr/bin/env bash
# =============================================================================
# Hisab · smoke test against a DEPLOYED site
#
#   tools/smoke.sh                          # the live site
#   tools/smoke.sh http://127.0.0.1:8000    # anywhere else
#
# WHY THIS EXISTS.
#
# The PHP suite and the browser harnesses both pass, and both are blind to the
# same thing: they run HERE. Every failure this project has actually shipped was
# a difference between this machine and the server, not a mistake in the logic —
#
#   the front controller sits in api/ on the server and public/ locally, so
#   Laravel stripped /api from every path and 404'd every route
#   cron does not keep a shell variable, so the deploy ran as /deploy.sh
#   bash -n parses without running, so a function used above its definition
#   passed the check and failed the job
#   the tests send JSON headers, so a guest 401 that is a 500 in a browser
#   looked fine
#   nothing caches locally, so an hour-old script against fresh markup only
#   happens to the person using the app
#
# None of those are findable by testing the code. They are findable by asking
# the running site a question and reading the answer, which is all this does.
#
# Exit code 1 on any failure, so cron can shout.
# =============================================================================
set -uo pipefail

BASE="${1:-https://hisab.gulfrabit.com}"
BASE="${BASE%/}"
FAILED=0
CHECKED=0

pass() { CHECKED=$((CHECKED + 1)); printf '  ok    %s\n' "$1"; }
fail() { CHECKED=$((CHECKED + 1)); FAILED=1; printf '  FAIL  %s\n' "$1"; }

# One request. Reports the status, and nothing else - a body is only fetched
# where a check actually needs it.
status() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || echo "000"
}

expect() {
  local label="$1" want="$2" got="$3"
  if [ "$got" = "$want" ]; then pass "$label"; else fail "$label (got $got, wanted $want)"; fi
}

echo "Smoke test: $BASE"
echo

# --- the app is there ---------------------------------------------------------
expect "the app loads" 200 "$(status "$BASE/")"

title="$(curl -sS --max-time 20 "$BASE/" 2>/dev/null | grep -oiE '<title>[^<]*</title>' | head -1)"
case "$title" in
  *Hisab*) pass "it is Hisab, not a host placeholder" ;;
  *)       fail "it is Hisab, not a host placeholder (title: ${title:-none})" ;;
esac

# --- the files that must never be served --------------------------------------
# 403 or 404 both acceptable: the cron deploy never copies these to the server,
# so there is nothing to forbid. What matters is not seeing the contents.
for path in context.md CONVENTIONS.md docs/STATUS.md tools/deploy.sh .env; do
  code="$(status "$BASE/$path")"
  case "$code" in
    403|404) pass "not served: $path" ;;
    *)       fail "not served: $path (got $code)" ;;
  esac
done

# Module PHP sits IN the web root and is blocked by rule, not by absence.
expect "module PHP is blocked" 403 "$(status "$BASE/modules/ledger/backend/Controllers/LedgerController.php")"

# --- MIME types, which decide whether things render at all --------------------
mime() { curl -sSI --max-time 20 "$1" 2>/dev/null | grep -i '^content-type' | tr -d '\r' | sed 's/.*: //'; }

case "$(mime "$BASE/shared/icons/sprite.svg")" in
  image/svg+xml*) pass "the sprite is image/svg+xml" ;;
  *)              fail "the sprite is image/svg+xml (icons render blank otherwise)" ;;
esac
case "$(mime "$BASE/site.webmanifest")" in
  application/manifest+json*) pass "the manifest is application/manifest+json" ;;
  *)                          fail "the manifest is application/manifest+json (home-screen install fails otherwise)" ;;
esac
case "$(mime "$BASE/assets/fonts/ibm-plex-sans-var.woff2")" in
  font/woff2*) pass "fonts are font/woff2" ;;
  *)           fail "fonts are font/woff2" ;;
esac

# --- caching, which is what hid a whole feature -------------------------------
# A script cached without revalidation means new markup runs against old code,
# and a section that ships hidden simply never appears.
cache="$(curl -sSI --max-time 20 "$BASE/shared/js/main.js" 2>/dev/null | grep -i '^cache-control' | tr -d '\r')"
case "$cache" in
  *no-cache*) pass "scripts revalidate before use" ;;
  *)          fail "scripts revalidate before use (got: ${cache:-none})" ;;
esac

# --- the API ------------------------------------------------------------------
api_health="$(status "$BASE/api/health")"

if [ "$api_health" = "404" ]; then
  echo
  echo "  note  no backend deployed here — API checks skipped"
else
  expect "/api/health answers" 200 "$api_health"

  body="$(curl -sS --max-time 20 "$BASE/api/health" 2>/dev/null)"
  case "$body" in
    *'"ok":true'*) pass "…in the documented envelope" ;;
    *)             fail "…in the documented envelope (got: $body)" ;;
  esac

  # The one that catches /api being stripped: a route that exists must not 404.
  expect "/api/auth/session answers" 200 "$(status "$BASE/api/auth/session")"

  # A PLAIN request, deliberately. With JSON headers this returns 401 whether or
  # not the guest redirect is broken, which is exactly how a 500 survived.
  expect "a guest gets 401, not a redirect or a 500" 401 "$(status "$BASE/api/ledger")"

  # Same URL with the headers the app actually sends.
  expect "…and 401 as the app asks for it" 401 \
    "$(status -H 'Accept: application/json' -H 'X-Requested-With: XMLHttpRequest' "$BASE/api/ledger")"
fi

# --- routing ------------------------------------------------------------------
expect "an unknown URL is 404, not 500" 404 "$(status "$BASE/no-such-page")"

nf="$(curl -sS --max-time 20 "$BASE/no-such-page" 2>/dev/null | grep -oiE '<title>[^<]*</title>' | head -1)"
case "$nf" in
  *Hisab*) pass "…and shows the styled 404" ;;
  *)       fail "…and shows the styled 404 (title: ${nf:-none})" ;;
esac

echo
if [ "$FAILED" -eq 0 ]; then
  echo "$CHECKED checks passed."
else
  echo "SOME CHECKS FAILED — the deployed site is not behaving as built."
fi

exit "$FAILED"
