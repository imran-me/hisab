<?php

/**
 * Hisab · local dev server
 *
 *   php -S 127.0.0.1:8000 -t . tools/serve.php
 *
 * `php artisan serve` is not enough here. It serves public/, which contains
 * only the front controller — while the frontend is a tree of static files at
 * the repository root. Opening the app through it gives a 404 for every page,
 * and serving the two halves on different ports gives a different ORIGIN, which
 * breaks precisely the things this app depends on: the session cookie is not
 * sent, `localStorage` is a different store, and the vault's blob is invisible.
 *
 * So this reproduces the deployed shape on one origin:
 *
 *   /api/*      ->  Laravel's front controller
 *   everything  ->  the static file, or 404.html
 *
 * which is the same routing .htaccess §8 performs in production. Keep the two
 * in step: a difference between them is a bug that only exists on one of the
 * machines you are testing on.
 */

$root = dirname(__DIR__);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';
$path = rtrim($path, '/') === '' ? '/index.html' : $path;

// --- the API ----------------------------------------------------------------
if (str_starts_with($path, '/api')) {
    // The front controller resolves its own application root, so it works from
    // here exactly as it does in public/ and in public_html/hisab/api/.
    require $root.'/public/index.php';

    return true;
}

// --- what must never be served ----------------------------------------------
// The same list .htaccess §2 blocks. It is repeated rather than imported
// because .htaccess is not readable by PHP - and a dev server that serves the
// documentation and the framework while production forbids them is a dev server
// that hides the mistake it exists to catch.
$blocked = [
    '#^/(app|bootstrap|config|database|storage|vendor|routes|tests|docs)/#',
    '#^/modules/[^/]+/backend/.*\.php$#',
    '#\.(md|markdown|py|mjs|sh|bat|ps1|env.*|log|sql|sqlite|db|bak|hisab-vault)$#i',
    '#(^|/)\.#',   // dotfiles, .git included
];

// tools/ is blocked like the rest UNLESS explicitly opened.
//
// The browser test harnesses live there and need a server that also answers
// /api, which is this one. Opt-in rather than always-on, and off by default, so
// the parity with production that makes this file worth having is not quietly
// traded away for the convenience of one harness:
//
//   HISAB_DEV_TOOLS=1 php -S 127.0.0.1:8000 -t . tools/serve.php
if (getenv('HISAB_DEV_TOOLS') !== '1') {
    $blocked[] = '#^/tools/#';
}

foreach ($blocked as $pattern) {
    if (preg_match($pattern, $path)) {
        http_response_code(403);
        echo 'Forbidden';

        return true;
    }
}

// --- static files -----------------------------------------------------------
$file = realpath($root.urldecode($path));

// realpath() resolves '..', so a request for /../../etc/passwd lands outside
// the root and is caught here rather than served.
if ($file !== false && str_starts_with($file, $root) && is_file($file)) {
    // Let the built-in server handle the file, including its MIME type.
    return false;
}

http_response_code(404);
readfile($root.'/404.html');

return true;
