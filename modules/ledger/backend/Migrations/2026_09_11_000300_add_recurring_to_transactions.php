<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How often this is expected to happen again.
 *
 * 'Monthly', 'Weekly', 'Yearly', or null for a one-off. It is a LABEL on a
 * record that already happened, not a schedule - nothing in this app posts a
 * transaction on its own, and that stays true. What it buys is the month-close
 * flow being able to offer "these are the lines that repeat, bring them
 * forward" instead of asking someone to retype rent twelve times a year.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->string('recurring', 16)->nullable()->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropColumn('recurring');
        });
    }
};
