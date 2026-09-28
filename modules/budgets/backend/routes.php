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
use Hisab\Budgets\Controllers\GoalController;
use Illuminate\Support\Facades\Route;

// Savings goals. Before the budgets group only for reading order; the two
// prefixes do not overlap.
Route::prefix('goals')->middleware('auth')->group(function (): void {
    Route::get('/', [GoalController::class, 'index']);
    Route::post('/', [GoalController::class, 'store']);
    Route::patch('/{id}', [GoalController::class, 'update']);
    Route::delete('/{id}', [GoalController::class, 'destroy']);
});

Route::prefix('budgets')->middleware('auth')->group(function (): void {
    Route::get('/', [BudgetController::class, 'index']);

    // Keyed by the CATEGORY, not the budget: there is one budget per
    // category, and "set Groceries to ৳12,000" is the whole request.
    Route::put('/{categoryId}', [BudgetController::class, 'update']);
    Route::delete('/{categoryId}', [BudgetController::class, 'destroy']);
});
