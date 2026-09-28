<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Savings goals: "Umrah ৳3,00,000 by next Ramadan", "Emergency fund".
 *
 * Only the TARGET is stored. How far along a goal is comes from the ledger:
 * the balance of the account it is linked to (a DPS, an FDR, a savings
 * account), or the deposits filed under its category. A stored "saved so
 * far" would be a second ledger (modules/budgets/backend/endpoints.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goals', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->unsignedBigInteger('target_minor');
            $table->char('currency', 3)->default('BDT');
            $table->date('target_on')->nullable();

            // What counts towards it: one account's balance, OR deposits in
            // one category since the goal began. Null both: nothing linked yet.
            $table->foreignUlid('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignUlid('category_id')->nullable()->constrained('categories')->nullOnDelete();

            $table->string('icon', 24)->nullable();
            $table->date('started_on');
            $table->timestamp('achieved_at')->nullable();
            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->index(['user_id']);
            $table->foreign('currency')->references('code')->on('currencies')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goals');
    }
};
