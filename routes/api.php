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
Route::get('/ping', fn () => response()->json(['data' => ['ok' => true]]));
