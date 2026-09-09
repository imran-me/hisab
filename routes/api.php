<?php

/*
|------------------------------------------------------------------------------
| API routes
|------------------------------------------------------------------------------
|
| This file stays a table of contents, never a route list. Every module owns its
| own routes in modules/<feature>/backend/routes.php and loads them from its own
| service provider, because CONVENTIONS.md requires that deleting a module
| folder removes the feature and breaks nothing else - and a route registered
| here would be a third reference to the module from outside its folder, on top
| of the two that are allowed (composer.json and bootstrap/providers.php).
|
| Everything here is prefixed /api by bootstrap/app.php.
|
*/

use Illuminate\Support\Facades\Route;

// Liveness only. Deliberately answers before authentication, and deliberately
// says nothing about the database, the session or the build: a health endpoint
// that leaks version numbers is a reconnaissance endpoint.
//
// THE NAME IS PART OF THE CONTRACT. shared/js/core/http.js probes exactly
// `health` to decide whether a backend exists at all, and every module's api.js
// asks that before choosing between the server and its local fixture. Renaming
// this route does not break a test - it makes the whole frontend quietly decide
// there is no server and keep answering from browser storage.
Route::get('/health', fn () => response()->json(['data' => ['ok' => true]]));
