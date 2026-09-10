<?php

/*
|------------------------------------------------------------------------------
| Accounts routes
|------------------------------------------------------------------------------
|
| Loaded by AccountsServiceProvider. Already prefixed /api.
|
| Every one of these is the owner's own money, so unlike currencies and the
| necessity bands there is nothing here readable without a session.
|
*/

use Hisab\Accounts\Controllers\AccountController;
use Hisab\Accounts\Controllers\FinanceController;
use Illuminate\Support\Facades\Route;

/* The Accounts screen: one month, and the settings behind it. Separate from
   the /accounts resource below, which is the account list rather than the
   month cockpit that renders on top of it. */
Route::prefix('finance')->middleware('auth')->group(function (): void {
    Route::get('/months', [FinanceController::class, 'months']);
    Route::get('/settings', [FinanceController::class, 'settings']);
    Route::patch('/settings', [FinanceController::class, 'updateSettings']);
    Route::get('/closes', [FinanceController::class, 'closes']);

    // After the fixed segments, so 'months' and 'settings' are not read as a
    // month key.
    Route::get('/{month}', [FinanceController::class, 'month']);
    Route::post('/{month}/close', [FinanceController::class, 'close']);
    Route::delete('/{month}/close', [FinanceController::class, 'reopen']);
});

Route::prefix('accounts')->middleware('auth')->group(function (): void {
    Route::get('/', [AccountController::class, 'index']);
    Route::post('/', [AccountController::class, 'store']);
    // Before /{id}, or 'reorder' is matched as an account id and every reorder
    // becomes a 404 for a route that exists.
    Route::patch('/reorder', [AccountController::class, 'reorder']);

    Route::get('/{id}', [AccountController::class, 'show']);
    Route::patch('/{id}', [AccountController::class, 'update']);
    Route::delete('/{id}', [AccountController::class, 'destroy']);
});
