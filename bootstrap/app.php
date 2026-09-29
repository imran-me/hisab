<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

// Module classes by convention: Hisab\Name\... lives in modules/name/backend/...
// The same rule composer.json's PSR-4 map spells out, applied here as well
// because the server's vendor/ is installed by hand and its autoloader only
// knows the modules that existed on that day. Without this a new module is
// "class not found" on the live site until someone runs composer again, and
// its routes 404 while every screen that calls them looks broken.
spl_autoload_register(static function (string $class): void {
    if (! str_starts_with($class, 'Hisab\\')) {
        return;
    }
    $parts = explode('\\', substr($class, 6), 2);
    if (count($parts) !== 2) {
        return;
    }
    $file = dirname(__DIR__).'/modules/'.strtolower($parts[0]).'/backend/'.str_replace('\\', '/', $parts[1]).'.php';
    if (is_file($file)) {
        require $file;
    }
});

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        // Prefixed /api, which is what shared/js/core/paths.js apiBase() builds
        // and what .htaccess rewrites into the front controller. The three have
        // to agree; changing one means changing all three.
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The API is authenticated by a SESSION COOKIE, not a bearer token, so
        // the api group needs the session middleware the web group normally
        // carries. modules/auth/backend/endpoints.md has the reasoning: a token
        // has to live somewhere script can read it, and in a browser that means
        // localStorage - which is where the vault's encrypted blob already is.
        // An HttpOnly cookie is unreadable to script; a token is not.
        //
        // This is what Sanctum's stateful mode does. Written out rather than
        // pulled in because the frontend is same origin, so there is no CORS
        // and no token refresh to manage - the package would be four lines of
        // configuration and a dependency to keep current.
        // An unauthenticated /api request must be a 401, never a redirect.
        //
        // Laravel sends guests to a route named `login`, and this app has no
        // such route - the sign-in screen is a static HTML file, not something
        // the router knows about. So the redirect throws RouteNotFoundException
        // and a clean 401 becomes a 500. It is invisible from the app, because
        // http.js sends X-Requested-With and Laravel answers those with JSON
        // already; it shows up the moment anyone opens an /api URL in a browser
        // tab, and it would have leaked a stack trace if APP_DEBUG were ever on.
        //
        // Returning null means "do not redirect", which lets the exception
        // handler render the 401 it should have been.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');

        $middleware->api(prepend: [
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            // A cookie authenticates every request the browser sends, including
            // ones another site caused it to send. This is what makes a write
            // prove it came from this app. Reads are exempt by definition.
            \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
