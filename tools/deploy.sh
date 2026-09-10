#!/usr/bin/env bash
# =============================================================================
# Hisab · self-contained deploy, driven by cron
#
#   bash deploy.sh            deploy if GitHub has moved
#   bash deploy.sh --force    deploy even if it has not
#   bash deploy.sh --status   print what is deployed, change nothing
#
# Hostinger's hPanel has a Git integration and a webhook. This exists instead
# because a cron job is the one mechanism available on every plan: it needs no
# deploy key, no webhook reachable from GitHub, and no button pressed by a
# human. It pulls rather than waiting to be pushed to.
#
# THE SOURCE TREE IS NEVER THE DOCUMENT ROOT.
#
# Cloning straight into public_html/hisab is the obvious arrangement and the
# wrong one: it puts .git inside the web root, where a single missing .htaccess
# exposes the whole history, and it publishes tools/ and docs/, which are not
# for the web. So the checkout lives one level ABOVE the web root and only the
# files the app actually owns are copied down - the same shape Phase 2 uses for
# the Laravel layer.
#
#   domains/gulfrabit.com/
#   |-- hisab-deploy/           <- here. Not reachable over HTTP.
#   |   |-- deploy.sh           this file
#   |   |-- src/                the checkout
#   |   |-- state               the deployed commit
#   |   `-- deploy.log
#   `-- public_html/hisab/      <- the document root. Only OWNED is written.
#
# Anything in the document root that is not in OWNED is left alone, which is
# deliberate: Phase 2's api/ directory, .well-known/, and anything Hostinger
# puts there must survive a deploy.
# =============================================================================
set -uo pipefail

REPO_URL="https://github.com/imran-me/hisab.git"
REPO_SLUG="imran-me/hisab"
BRANCH="main"

# Everything resolves from this file's own location, so moving the whole
# hisab-deploy directory does not mean editing a path.
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/src"
STATE="$HERE/state"
LOG="$HERE/deploy.log"
LOCK="$HERE/.lock"

# The document root. Overridable so this can be pointed at a staging copy.
DOCROOT="${HISAB_DOCROOT:-$(cd -- "$HERE/.." && pwd)/public_html/hisab}"

# What this app owns in the document root. A deploy replaces exactly these and
# touches nothing else. Adding a top-level file to the repo means adding it
# here, and that is on purpose: publishing into a live web root should be an
# explicit list rather than whatever happens to be lying in the tree.
OWNED_FILES=(index.html 404.html .htaccess site.webmanifest)
OWNED_DIRS=(assets shared modules)

LOCKED=""

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG" 2>/dev/null; }
say() { printf '%s\n' "$*"; log "$*"; }
release() { [ -n "$LOCKED" ] && rmdir "$LOCK" 2>/dev/null; return 0; }
die() { printf 'ERROR: %s\n' "$*" >&2; log "ERROR: $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- one run at a time -------------------------------------------------------
# mkdir is atomic on every filesystem that matters; a lock FILE tested with -f
# races. A five-minute cron and a deploy that takes longer than five minutes
# would otherwise run over itself and leave a half-copied web root.
if mkdir "$LOCK" 2>/dev/null; then
  LOCKED=1
  trap release EXIT INT TERM
else
  # A crashed run leaves the lock behind. Anything older than an hour is not a
  # deploy still in progress.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null
    if mkdir "$LOCK" 2>/dev/null; then
      LOCKED=1
      trap release EXIT INT TERM
    fi
  fi
  if [ -z "$LOCKED" ]; then
    echo "another deploy is running"
    exit 0
  fi
fi

MODE="${1:-}"

deployed_sha() {
  if [ -f "$STATE" ]; then cat "$STATE"; else echo ""; fi
}

# git ls-remote is one round trip, needs no checkout and is not rate limited.
# The API is the fallback for a host with no git client; unauthenticated it
# allows 60 requests an hour per IP, which a five-minute cron fits inside.
remote_sha() {
  if have git; then
    git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}' | head -1
  elif have curl; then
    curl -fsSL -H 'Accept: application/vnd.github.sha' \
      "https://api.github.com/repos/$REPO_SLUG/commits/$BRANCH" 2>/dev/null
  else
    echo ""
  fi
}

fetch_source() {
  if have git; then
    if [ -d "$SRC/.git" ]; then
      git -C "$SRC" fetch --quiet origin "$BRANCH" || return 1
      git -C "$SRC" reset --hard --quiet "origin/$BRANCH" || return 1
      # A file deleted from the repo must disappear from the checkout too, or
      # it lives on in the web root forever.
      git -C "$SRC" clean -qfd || return 1
    else
      rm -rf "$SRC"
      git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$SRC" || return 1
    fi
    return 0
  fi

  # No git: the codeload tarball. Extracted into a fresh directory and swapped
  # in, so a failed download never leaves a half-written source tree.
  if ! have curl && ! have wget; then return 1; fi
  local tmp="$HERE/.fetch.$$"
  rm -rf "$tmp"
  mkdir -p "$tmp" || return 1
  local url="https://codeload.github.com/$REPO_SLUG/tar.gz/refs/heads/$BRANCH"
  if have curl; then
    curl -fsSL "$url" -o "$tmp/s.tgz" || { rm -rf "$tmp"; return 1; }
  else
    wget -qO "$tmp/s.tgz" "$url" || { rm -rf "$tmp"; return 1; }
  fi
  tar -xzf "$tmp/s.tgz" -C "$tmp" --strip-components=1 || { rm -rf "$tmp"; return 1; }
  rm -f "$tmp/s.tgz"
  rm -rf "$SRC"
  mv "$tmp" "$SRC" || { rm -rf "$tmp"; return 1; }
  return 0
}

# Directories go through rsync --delete where it exists, because it removes a
# deleted file without ever emptying the directory first. The fallback does have
# a window where a directory is briefly gone, which is exactly why .htaccess is
# never in it: files are overwritten in place with cp, so the protection rules
# are never absent from the web root, not even for an instant.
publish() {
  mkdir -p "$DOCROOT" || die "cannot create $DOCROOT"

  local f d stale
  for f in "${OWNED_FILES[@]}"; do
    if [ ! -f "$SRC/$f" ]; then log "missing from source, skipped: $f"; continue; fi
    cp -f "$SRC/$f" "$DOCROOT/$f" || die "failed to copy $f"
  done

  for d in "${OWNED_DIRS[@]}"; do
    if [ ! -d "$SRC/$d" ]; then log "missing from source, skipped: $d/"; continue; fi
    if have rsync; then
      rsync -a --delete "$SRC/$d/" "$DOCROOT/$d/" || die "rsync failed on $d/"
    else
      # Build beside the live directory, then swap with two renames.
      #
      # The obvious `rm -rf` then `cp -a` is what this replaces, and it is worse
      # than it looks: copying shared/ takes seconds, and for every one of them
      # the directory DOES NOT EXIST. A page loaded in that window gets a 404
      # for main.js, so the shell never mounts - no navigation, no header, and
      # skeleton rows that never resolve. It looks like a broken app rather than
      # a deploy in progress, and it is gone by the time anyone investigates.
      #
      # Two renames are not atomic together, but each is atomic and the gap
      # between them is microseconds rather than seconds. That is the best
      # available without symlinking the document root, which Hostinger's
      # document root cannot be.
      local new="${DOCROOT:?}/.$d.new" old="${DOCROOT:?}/.$d.old"
      rm -rf "$new" "$old"
      cp -a "$SRC/$d" "$new" || die "failed to stage $d/"
      if [ -d "$DOCROOT/$d" ]; then
        mv "$DOCROOT/$d" "$old" || die "failed to retire the old $d/"
      fi
      mv "$new" "$DOCROOT/$d" || die "failed to swap in $d/"
      rm -rf "$old"
    fi
  done

  # The API front controller, and ONLY when the backend is actually installed.
  #
  # vendor/ is not in the repository - it is 83 MB, and `composer install` is
  # run on the server once. Until that has happened there is no application to
  # route to, and publishing api/index.php anyway would turn every /api request
  # into a 500 instead of the 404 that honestly says "no backend here".
  #
  # .htaccess only rewrites /api/* when this file exists, so the two agree:
  # both halves of the switch are the presence of one file.
  if [ -f "$SRC/vendor/autoload.php" ] && [ -f "$SRC/public/index.php" ]; then
    mkdir -p "$DOCROOT/api"
    cp -f "$SRC/public/index.php" "$DOCROOT/api/index.php" || die "failed to publish the API front controller"
  else
    # Removed rather than left behind, so uninstalling the backend - or a
    # deploy that runs before composer install - cannot leave a controller
    # pointing at an application that is not there.
    rm -f "$DOCROOT/api/index.php"
  fi

  # Hostinger drops a placeholder into a new subdomain's root. It is not ours so
  # it is not in OWNED, and it would otherwise sit there forever - but index.php
  # comes before index.html in LiteSpeed's DirectoryIndex order, so leaving it
  # means the placeholder keeps answering / after a perfectly good deploy.
  for stale in default.php index.php default.html; do
    if [ -f "$DOCROOT/$stale" ] && [ ! -f "$SRC/$stale" ]; then
      rm -f "$DOCROOT/$stale" && say "removed placeholder: $stale"
    fi
  done
}

NOW="$(remote_sha)"
WAS="$(deployed_sha)"

if [ "$MODE" = "--status" ]; then
  echo "docroot : $DOCROOT"
  echo "source  : $SRC"
  echo "branch  : $BRANCH"
  echo "deployed: ${WAS:-<nothing>}"
  echo "remote  : ${NOW:-<unreachable>}"
  if [ -n "$NOW" ] && [ "$NOW" = "$WAS" ]; then
    echo "status  : up to date"
  else
    echo "status  : behind, or GitHub unreachable"
  fi
  exit 0
fi

[ -n "$NOW" ] || die "cannot reach GitHub (no git, curl or wget, or the network is down)"

# Has the DOCUMENT ROOT drifted from what this commit should have published?
#
# Comparing commits alone is not enough, and the gap is not hypothetical: the
# API front controller is only published once vendor/ exists, and vendor/ is
# created by `composer install` run BY HAND, long after the commit that made it
# possible. Cron sees a matching commit, exits early, and the API never appears
# - so the one thing the person is waiting for is the one thing a five-minute
# cron will never do for them, and the only way out is SSH.
#
# So the state of the web root is checked too, and a mismatch republishes even
# when GitHub has not moved.
needs_publish() {
  # The backend became installable, or was removed, since the last publish.
  if [ -f "$SRC/vendor/autoload.php" ] && [ ! -f "$DOCROOT/api/index.php" ]; then return 0; fi
  if [ ! -f "$SRC/vendor/autoload.php" ] && [ -f "$DOCROOT/api/index.php" ]; then return 0; fi

  # An owned file has gone missing from the web root - a half-finished upload,
  # a stray delete in File Manager, an interrupted deploy.
  local f
  for f in "${OWNED_FILES[@]}"; do
    if [ -f "$SRC/$f" ] && [ ! -f "$DOCROOT/$f" ]; then return 0; fi
  done

  return 1
}

if [ "$NOW" = "$WAS" ] && [ "$MODE" != "--force" ]; then
  if needs_publish; then
    say "same commit, but the web root is out of step - republishing"
    publish
    say "republished ${NOW:0:8} to $DOCROOT"
    exit 0
  fi

  # Quiet on purpose. This is the common case, twelve times an hour, and a log
  # line for it would bury the deploys that actually happened.
  exit 0
fi

say "deploying ${NOW:0:8} (was ${WAS:0:8})"
fetch_source || die "could not fetch $BRANCH from $REPO_URL"
publish
printf '%s' "$NOW" > "$STATE"
# --- bring the database with the code -----------------------------------------
# Code and schema deploy together or they do not deploy at all. A migration that
# waits for someone to SSH in means the window between the two is a live site
# querying columns that are not there yet - and the person who pushed has no
# reason to suspect it, because the deploy said it succeeded.
#
# Only when the backend is actually installed. `migrate --force` skips what has
# already run, so this is a no-op on the usual deploy that changes no schema.
#
# NOT db:seed. Seeders are idempotent here, but running them unattended on every
# deploy is a much larger promise than running migrations, and reference data
# changes far more rarely than code.
migrate_if_installed() {
  [ -f "$SRC/vendor/autoload.php" ] || return 0
  [ -f "$SRC/.env" ] || return 0
  [ -f "$SRC/artisan" ] || return 0

  local php
  php="$(command -v php 2>/dev/null)" || return 0
  [ -n "$php" ] || return 0

  local output
  # 2>&1 kept: a migration that fails is the one thing here worth waking up for,
  # and the log is the only place anyone will look for it afterwards.
  output="$("$php" "$SRC/artisan" migrate --force --no-interaction 2>&1)" || {
    say "MIGRATION FAILED - the site may be serving against an old schema"
    log "$output"
    return 1
  }

  # Laravel says "Nothing to migrate" when there is nothing to do, which is most
  # deploys. Only mention it when something actually ran.
  case "$output" in
    *"Nothing to migrate"*) : ;;
    *) say "ran database migrations"; log "$output" ;;
  esac
}

migrate_if_installed

# --- keep this script current -------------------------------------------------
# The checkout contains tools/deploy.sh - the newer version of this very file.
# Copying it over ourselves means the cron entry can be a plain path with no
# variables in it, which is what Hostinger's cron actually tolerates: a `D=...;`
# assignment in the crontab does not survive, $D expands to nothing, and the job
# fails with "bash: /deploy.sh: No such file or directory".
#
# mv rather than cp, because this script is running. mv is an atomic rename
# within one filesystem, and bash keeps reading through its open descriptor to
# the OLD inode - so the running run finishes against the code it started with
# and the next run picks up the new file. A cp would rewrite the file underneath
# the interpreter, which reads scripts incrementally, and bash would resume at a
# byte offset that now lands mid-line in different code.
self_update() {
  local incoming="$SRC/tools/deploy.sh"

  [ -f "$incoming" ] || return 0
  cmp -s "$incoming" "$0" && return 0

  # Never install a script that would not parse. A truncated or half-written
  # file here disables every future deploy, and fixing it needs SSH.
  bash -n "$incoming" 2>/dev/null || { log "new deploy.sh failed its syntax check, keeping the current one"; return 0; }

  cp -f "$incoming" "$HERE/.deploy.next" || return 0
  mv -f "$HERE/.deploy.next" "$0" && say "deploy.sh updated itself"
}

self_update

say "deployed ${NOW:0:8} to $DOCROOT"
exit 0
