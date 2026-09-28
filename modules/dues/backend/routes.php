<?php

/*
|------------------------------------------------------------------------------
| Dues routes
|------------------------------------------------------------------------------
|
| Loaded by DuesServiceProvider. Already prefixed /api. See endpoints.md.
|
*/

use Hisab\Dues\Controllers\DueController;
use Illuminate\Support\Facades\Route;

Route::prefix('dues')->middleware('auth')->group(function (): void {
    Route::get('/', [DueController::class, 'index']);
    Route::post('/people', [DueController::class, 'store']);
    Route::get('/people/{id}', [DueController::class, 'show']);
    Route::patch('/people/{id}', [DueController::class, 'update']);
    Route::post('/people/{id}/entries', [DueController::class, 'record']);
    Route::post('/people/{id}/settle', [DueController::class, 'settle']);

    // The only way to correct a due: the Ledger refuses a Dues leg.
    Route::patch('/entries/{id}', [DueController::class, 'change']);
    Route::post('/entries/{id}/undo', [DueController::class, 'undo']);
});
