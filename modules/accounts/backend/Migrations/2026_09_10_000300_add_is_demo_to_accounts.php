<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which accounts were invented.
 *
 * Demo data that exercises the whole app needs accounts the seed does not
 * provide - a business book has its own accounts, and a foreign-currency entry
 * needs somewhere to land. Those are created by the demo generator, so they
 * have to be removable by it, and for the same reason the transactions do:
 * "delete demo data" has to mean exactly that, or it means "delete everything".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->boolean('is_demo')->default(false)->after('is_default');
            $table->index(['user_id', 'is_demo'], 'accounts_demo');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->dropIndex('accounts_demo');
            $table->dropColumn('is_demo');
        });
    }
};
