<?php

/*
|------------------------------------------------------------------------------
| FX routes
|------------------------------------------------------------------------------
|
| Loaded by FxServiceProvider so that deleting modules/fx/ takes them with it.
| Already prefixed /api.
|
*/

use Hisab\Fx\Controllers\CurrencyController;
use Hisab\Fx\Controllers\RateController;
use Illuminate\Support\Facades\Route;

Route::prefix('fx')->group(function (): void {

    // Currencies are reference data - facts about the world, not anyone's
    // money - so they are readable without a session. This is what lets the
    // frontend format an amount on the lock screen, before anyone has signed
    // in, without special-casing the one endpoint that would 401.
    Route::get('/currencies', [CurrencyController::class, 'index']);

    // Rates are readable signed-out too, and deliberately: a signed-out read
    // sees only the seeded estimates, because RateBook filters on the user id
    // and there is no user. Nothing of the owner's leaks by allowing it.
    Route::get('/rates', [RateController::class, 'index']);

    // Writing one is the owner's own record of a rate they got, so it needs a
    // session.
    Route::post('/rates', [RateController::class, 'store'])->middleware('auth');
});
