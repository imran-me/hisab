<?php

/*
|------------------------------------------------------------------------------
| Budgets routes
|------------------------------------------------------------------------------
|
| Loaded by BudgetsServiceProvider. Already prefixed /api. See endpoints.md.
|
*/

use Hisab\Budgets\Controllers\BudgetController;
use Illuminate\Support\Facades\Route;

Route::prefix('budgets')->middleware('auth')->group(function (): void {
    Route::get('/', [BudgetController::class, 'index']);

    // Keyed by the CATEGORY, not the budget: there is one budget per
    // category, and "set Groceries to ৳12,000" is the whole request.
    Route::put('/{categoryId}', [BudgetController::class, 'update']);
    Route::delete('/{categoryId}', [BudgetController::class, 'destroy']);
});
