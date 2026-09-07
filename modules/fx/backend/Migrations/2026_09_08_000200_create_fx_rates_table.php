<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Exchange rates, with their history.
 *
 * A rate has an `as_of` date because it was true ON a date. Rows are kept
 * rather than overwritten so that a figure which snapshotted a rate last year
 * can still be explained — CONVENTIONS.md, "snapshot vs read-through":
 * converting last year's total at today's rate silently rewrites history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fx_rates', function (Blueprint $table): void {
            $table->ulid('id')->primary();

            // NULLABLE, and the null is meaningful rather than missing data:
            //   null -> a seeded estimate, shipped so a fresh install can
            //           convert on day one. Shared by definition.
            //   set  -> the owner's own rate, the one they actually got.
            // A read prefers the owner's row and falls back to the seed, which
            // is what lets both exist without a second table or a flag that can
            // drift out of step with the row it describes.
            $table->foreignUlid('user_id')->nullable()->constrained()->cascadeOnDelete();

            $table->char('base', 3);
            $table->char('quote', 3);

            // decimal, NOT a float. The same reason money is an integer:
            // IEEE-754 cannot hold 122.5 exactly, and a rate is multiplied
            // through every converted figure on the dashboard, so the error
            // does not stay small. 10 decimal places covers pairs like
            // IDR/KWD where the useful digits start well after the point.
            $table->decimal('rate', 24, 10);

            $table->date('as_of');

            // 'seed' or 'manual'. The UI marks a figure converted through a
            // seeded rate as an estimate, so this has to survive to the client.
            $table->string('source', 16)->default('manual');

            $table->timestamps();

            // One rate per pair per day per owner. Two rates for one pair on one
            // day are not history, they are a correction - and keeping both
            // leaves the reader to guess which was meant. The upsert in
            // RateWriter depends on this constraint existing.
            $table->unique(['user_id', 'base', 'quote', 'as_of'], 'fx_rates_pair_day_unique');

            // The read path: latest row per pair for one owner.
            $table->index(['user_id', 'base', 'quote', 'as_of'], 'fx_rates_lookup');

            $table->foreign('base')->references('code')->on('currencies')->restrictOnDelete();
            $table->foreign('quote')->references('code')->on('currencies')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fx_rates');
    }
};
