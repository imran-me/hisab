<?php

/*
|------------------------------------------------------------------------------
| Categories routes
|------------------------------------------------------------------------------
|
| Loaded by CategoriesServiceProvider. Already prefixed /api.
|
*/

use Hisab\Categories\Controllers\CategoryController;
use Illuminate\Support\Facades\Route;

Route::prefix('categories')->group(function (): void {

    // Reference data - the vocabulary, not anyone's money - so it is readable
    // without a session, like currencies.
    Route::get('/necessity', [CategoryController::class, 'necessity']);
    Route::get('/methods', [CategoryController::class, 'methods']);

    // Everything else is the owner's own rows.
    Route::middleware('auth')->group(function (): void {
        Route::get('/', [CategoryController::class, 'index']);
        Route::post('/', [CategoryController::class, 'store']);
        Route::patch('/{id}', [CategoryController::class, 'update']);
        Route::delete('/{id}', [CategoryController::class, 'destroy']);
        Route::post('/{id}/restore', [CategoryController::class, 'restore']);
    });
});
