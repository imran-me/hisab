<?php

/*
|------------------------------------------------------------------------------
| Auth routes
|------------------------------------------------------------------------------
|
| Loaded by AuthServiceProvider, not by routes/api.php, so that deleting
| modules/auth/ removes these routes with it. See CONVENTIONS.md, the module
| test.
|
| Already prefixed /api by the provider.
|
*/

use Hisab\Auth\Controllers\SessionController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {

    // Deliberately outside the throttle. This is what the app calls on boot to
    // decide which screen to draw, and rate-limiting it would log a person out
    // of their own app for opening it too often.
    Route::get('/session', [SessionController::class, 'show']);

    // Two limiters, not one, and both must pass. See endpoints.md: keyed on the
    // IP alone, a botnet spreads attempts across addresses; keyed on the email
    // alone, anyone can lock the owner out by guessing at it.
    Route::post('/login', [SessionController::class, 'store'])
        ->middleware(['throttle:login-identity', 'throttle:login-ip']);

    Route::post('/logout', [SessionController::class, 'destroy']);
});
