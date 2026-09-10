<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A month, reviewed and filed.
 *
 * CLOSING IS NOT DESTRUCTIVE, and that is the whole design. No record is
 * touched, nothing is locked, and a transaction added to July next year still
 * lands in July and still corrects every month after it. A close is a note
 * saying "I have looked at this month", plus the figures as they stood when it
 * was looked at.
 *
 * Those figures are snapshotted rather than recomputed on read, for the same
 * reason a transaction snapshots its category name: what the month said when it
 * was closed is a historical fact, and re-deriving it later would quietly
 * rewrite the review rather than the ledger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('month_closes', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();

            // 'YYYY-MM'. A string rather than a date, because a month is not a
            // day and storing it as one invites a timezone to shift it.
            $table->char('month', 7);

            $table->text('note')->nullable();

            // The figures as they stood at close time.
            $table->json('snapshot')->nullable();

            $table->timestamp('closed_at');
            $table->timestamps();

            // A month is closed once. Re-closing updates the row rather than
            // adding a second review of the same month.
            $table->unique(['user_id', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('month_closes');
    }
};
