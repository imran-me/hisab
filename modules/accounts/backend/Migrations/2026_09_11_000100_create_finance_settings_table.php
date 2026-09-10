<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The few figures that are settings rather than records.
 *
 * Everything else in this product is DERIVED from transactions, deliberately -
 * a stored total and a ledger disagree eventually. These four are different:
 * they are inputs, not sums.
 *
 *   opening_balance   what was in hand BEFORE the first recorded month. Without
 *                     it every balance is wrong by a constant, and the error is
 *                     invisible because everything still adds up internally.
 *   carry_forward     whether a month's leftover becomes the next month's
 *                     opening. Off means every month starts at zero.
 *   monthly_budget    a target to compare spending against, not a limit.
 *   savings_goal      the same for what is kept.
 *
 * One row per owner, created on demand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance_settings', function (Blueprint $table): void {
            // The owner IS the key. There is exactly one row per person, and a
            // separate id would allow a second one to exist - which is a state
            // nothing in the app knows how to read.
            $table->foreignUlid('user_id')->primary()->constrained()->cascadeOnDelete();

            // Integers in the minor unit, like every other amount here.
            $table->bigInteger('opening_balance_minor')->default(0);
            $table->boolean('carry_forward')->default(true);
            $table->bigInteger('monthly_budget_minor')->default(0);
            $table->bigInteger('savings_goal_minor')->default(0);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_settings');
    }
};
