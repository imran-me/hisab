<?php

/*
|------------------------------------------------------------------------------
| Ledger routes
|------------------------------------------------------------------------------
|
| Loaded by LedgerServiceProvider. Already prefixed /api.
|
*/

use Hisab\Ledger\Controllers\LedgerController;
use Illuminate\Support\Facades\Route;

Route::prefix('ledger')->middleware('auth')->group(function (): void {

    // Before the /{id} routes: otherwise 'balances' is matched as an id and
    // returns 404 for a route that exists.
    Route::get('/balances', [LedgerController::class, 'balances']);
    Route::get('/summary', [LedgerController::class, 'summary']);

    Route::get('/', [LedgerController::class, 'index']);
    Route::post('/', [LedgerController::class, 'store']);
    Route::patch('/{id}', [LedgerController::class, 'update']);
    Route::delete('/{id}', [LedgerController::class, 'destroy']);
});
