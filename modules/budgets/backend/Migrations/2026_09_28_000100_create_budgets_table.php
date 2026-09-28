<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A monthly limit per expense category.
 *
 * Only the LIMIT is stored. What has been spent against it is the ledger's,
 * summed on every read (modules/budgets/backend/endpoints.md) - a stored
 * "spent so far" would be a second ledger, and it would drift from the first
 * the first time an entry was corrected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budgets', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();

            // Cascade: a budget for a category that no longer exists limits
            // nothing, and keeping it would leave a row the screen cannot name.
            $table->foreignUlid('category_id')->constrained('categories')->cascadeOnDelete();

            // Copied from the category so a book's budgets are one indexed
            // read. A category never changes book, so this cannot go stale.
            $table->string('book', 32)->default('personal');

            // Integer minor units, like every amount in Hisab.
            $table->unsignedBigInteger('amount_minor');
            $table->char('currency', 3)->default('BDT');

            // Set by `hisab:demo`, so its purge removes exactly what it made.
            $table->boolean('is_demo')->default(false);

            $table->timestamps();

            // One budget per category. A second row would make "how much is
            // left" depend on which one a query happened to find first.
            $table->unique(['user_id', 'category_id']);
            $table->index(['user_id', 'book']);

            $table->foreign('currency')->references('code')->on('currencies')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('budgets');
    }
};
