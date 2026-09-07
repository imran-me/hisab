<?php

/*
|------------------------------------------------------------------------------
| Hisab · front controller
|------------------------------------------------------------------------------
|
| Laravel's stock front controller hardcodes __DIR__.'/../' as the application
| root, because it assumes public/ sits directly inside it. That assumption does
| not survive this deployment.
|
| Hostinger fixes the document root at public_html/<subdomain>, and the whole
| framework has to live ABOVE it - otherwise .env, vendor/ and every controller
| are one missing .htaccess away from being readable. So the deployed layout is:
|
|   domains/gulfrabit.com/
|   |-- public_html/hisab/api/index.php   <- this file, inside the web root
|   `-- hisab-app/                        <- the application, above the web root
|
| while locally, and under `php artisan serve`, this same file is public/index.php
| with the application one level up. One file, two shapes, so there is no second
| copy to keep in step - a divergence between two front controllers is the kind
| of bug that only appears in production.
|
| The root is therefore RESOLVED rather than assumed, and resolved by looking for
| vendor/autoload.php: it is the one file guaranteed to be at the application
| root and nowhere else.
|
*/

define('LARAVEL_START', microtime(true));

$root = (static function (): string {
    // An explicit override wins, for a layout neither candidate below matches.
    // Set in the web server config, never in this file - a path edited into a
    // deployed file is a path that gets overwritten by the next deploy.
    $env = getenv('HISAB_APP_ROOT');
    if (is_string($env) && $env !== '' && is_file($env.'/vendor/autoload.php')) {
        return rtrim($env, '/\\');
    }

    $candidates = [
        // public/index.php - local, and `php artisan serve`
        __DIR__.'/..',
        // public_html/hisab/api/index.php - Hostinger, app above the web root
        __DIR__.'/../../../hisab-app',
    ];

    foreach ($candidates as $candidate) {
        if (is_file($candidate.'/vendor/autoload.php')) {
            return $candidate;
        }
    }

    // Fail loudly and say nothing useful to a stranger. A stack trace here would
    // print absolute filesystem paths before the framework is even loaded.
    http_response_code(500);
    header('Content-Type: application/json');
    error_log('Hisab: could not locate the application root from '.__DIR__);
    exit(json_encode(['message' => 'Server misconfigured.']));
})();

// Maintenance mode, if the framework left the flag behind.
if (file_exists($maintenance = $root.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $root.'/vendor/autoload.php';

/** @var Illuminate\Foundation\Application $app */
$app = require_once $root.'/bootstrap/app.php';

$app->handleRequest(Illuminate\Http\Request::capture());
