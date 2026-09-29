<?php

/*
|------------------------------------------------------------------------------
| Vault routes
|------------------------------------------------------------------------------
|
| Loaded by VaultServiceProvider. Already prefixed /api. See endpoints.md.
|
| Throttled well below the app's default, the header most of all: it is what
| an unlock reads. A weak defence and documented as one (SECURITY.md §6) - it
| is for an unlocked phone in the wrong hands, not for someone with the
| database.
|
*/

use Hisab\Vault\Controllers\VaultController;
use Illuminate\Support\Facades\Route;

Route::prefix('vault')->middleware('auth')->group(function (): void {
    Route::middleware('throttle:vault-header')->group(function (): void {
        Route::get('/header', [VaultController::class, 'showHeader']);
        Route::post('/header', [VaultController::class, 'storeHeader']);
        Route::put('/header', [VaultController::class, 'updateHeader']);
    });

    Route::middleware('throttle:vault')->group(function (): void {
        Route::get('/', [VaultController::class, 'index']);
        Route::post('/', [VaultController::class, 'store']);
        Route::put('/{id}', [VaultController::class, 'update']);
        Route::delete('/{id}', [VaultController::class, 'destroy']);
    });
});
