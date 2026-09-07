<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Categories: what a transaction is FOR.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table): void {
            $table->ulid('id')->primary();

            // Owned, and not nullable. Unlike fx_rates there is no "shared
            // default" row here: the defaults are seeded PER OWNER, so that
            // renaming or archiving one is an ordinary row update rather than a
            // per-user override of a row somebody else also sees.
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();

            $table->string('key', 64);
            $table->string('label');

            // income | expense | deposit. NOT transfer: moving money between
            // your own accounts is not a category of spending, and offering one
            // produces a ledger where half the transfers are filed under
            // "Other" and the totals stop balancing.
            $table->string('type', 16);

            // personal | business. A category never moves between books - that
            // would move spending into or out of a profit figure.
            $table->string('book', 32)->default('personal');

            // 1..4, and NULL on anything that is not an expense. There is no
            // sense in which a salary is discretionary.
            $table->unsignedTinyInteger('necessity')->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);

            // Archival, never deletion - CONVENTIONS.md §5. A historical
            // transaction must keep resolving to the category it was filed
            // under, so the row survives and only leaves the pickers.
            $table->timestamp('archived_at')->nullable();

            $table->timestamps();

            // The read path: one book and type for one owner, newest last.
            $table->index(['user_id', 'book', 'type', 'archived_at'], 'categories_scope');

            // Deliberately NOT a unique index on (user_id, book, type, label).
            // The rule is that no two ACTIVE categories share a name
            // case-insensitively, and neither part of that survives a database
            // constraint: archived rows are exempt, and case-insensitivity
            // depends on the column's collation, which differs between MySQL
            // and SQLite. It is enforced in CategoryBook, where it can be
            // exempt-aware and where the failure is a 422 rather than a 500.
            $table->foreign('necessity')->references('band')->on('necessity_bands')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
