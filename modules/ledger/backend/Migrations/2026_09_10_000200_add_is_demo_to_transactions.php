<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which entries were invented.
 *
 * Added the moment demo data became reachable from a BUTTON rather than only
 * from a console command. Without it, "delete demo data" can only mean "delete
 * every transaction", because nothing distinguishes the two - and a button in
 * Settings that quietly destroys real money because it could not tell the
 * difference is exactly the kind of thing that gets pressed once, months later,
 * by someone who has forgotten what it does.
 *
 * A column rather than a marker in the note: the note is the person's own text,
 * and a tag hidden in it would show up in the app, be editable, and be gone the
 * first time someone tidied it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->boolean('is_demo')->default(false)->after('book');

            // The delete path filters on exactly this, per owner.
            $table->index(['user_id', 'is_demo'], 'transactions_demo');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropIndex('transactions_demo');
            $table->dropColumn('is_demo');
        });
    }
};
