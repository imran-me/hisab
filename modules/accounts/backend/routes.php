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
    Route::get('/{id}', [AccountController::class, 'show']);
    Route::patch('/{id}', [AccountController::class, 'update']);
    Route::delete('/{id}', [AccountController::class, 'destroy']);
});
