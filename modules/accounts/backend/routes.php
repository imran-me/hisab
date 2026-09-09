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
use Illuminate\Support\Facades\Route;

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
