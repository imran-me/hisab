<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Corrections leave a trail.
 *
 * A saved entry is no longer altered or deleted - it is REVERSED, by a mirror
 * entry that nets it to zero, and both stay visible. Inherited from
 * OppTracker's ledger, where the rule is stated as "posted is final".
 *
 * The point is not bookkeeping ceremony. A ledger whose past can be edited
 * cannot answer "what did I think last month": the figure reported then and the
 * figure stored now quietly become different numbers, with nothing recording
 * that anything happened.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            // On the REVERSAL: the entry it cancels.
            $table->foreignUlid('reverses_id')->nullable()->after('group_id')
                ->constrained('transactions')->nullOnDelete();

            // Why, in the person's own words. Kept beside the reversal rather
            // than in a separate audit table, because a reason nobody can see
            // next to the row it explains may as well not have been asked for.
            $table->string('reversal_reason')->nullable()->after('reverses_id');

            // On a REPLACEMENT: the entry it was written instead of. Distinct
            // from reverses_id - a correction produces two new rows, the mirror
            // and the replacement, and they point at the original differently.
            $table->foreignUlid('corrects_id')->nullable()->after('reversal_reason')
                ->constrained('transactions')->nullOnDelete();

            // The list hides reversed entries and their mirrors by default, so
            // this is on the read path for every ledger query.
            $table->index(['user_id', 'reverses_id'], 'transactions_reversal');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropIndex('transactions_reversal');
            $table->dropConstrainedForeignId('corrects_id');
            $table->dropColumn('reversal_reason');
            $table->dropConstrainedForeignId('reverses_id');
        });
    }
};
