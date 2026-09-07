<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

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
