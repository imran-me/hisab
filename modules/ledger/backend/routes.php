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

    // Demo data. Before /{id}, like the others, or 'demo' is read as an entry id.
    Route::get('/demo', [LedgerController::class, 'demoStatus']);
    Route::post('/demo', [LedgerController::class, 'demoStore']);
    Route::delete('/demo', [LedgerController::class, 'demoDestroy']);

    Route::get('/', [LedgerController::class, 'index']);
    Route::post('/', [LedgerController::class, 'store']);
    Route::patch('/{id}', [LedgerController::class, 'update']);
    Route::post('/{id}/reverse', [LedgerController::class, 'reverse']);
    Route::delete('/{id}', [LedgerController::class, 'destroy']);
});
