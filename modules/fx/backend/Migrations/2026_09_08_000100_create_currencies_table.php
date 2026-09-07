<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Currencies.
 *
 * The most load-bearing table in the product, because of one column:
 * `minor_unit`. CONVENTIONS.md requires every amount to be an integer in the
 * currency's minor unit, with the number of decimal places read from HERE and
 * never from a constant — it is 2 for USD, 3 for KWD and 0 for JPY, so a
 * hardcoded /100 multiplies a Kuwaiti figure by ten and divides a Japanese one
 * by a hundred.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('currencies', function (Blueprint $table): void {
            // The ISO 4217 code IS the key. This is the one table not keyed by a
            // ULID, and deliberately: the code is already a stable, globally
            // agreed public identifier, so adding a ULID beside it would create
            // two ways to name one currency and a chance for them to disagree.
            $table->char('code', 3)->primary();

            $table->string('name');
            $table->string('symbol', 8);

            // 2 for USD, 3 for KWD, 0 for JPY. unsignedTinyInteger and not a
            // default of 2: a currency row that silently assumes two decimal
            // places is exactly the bug this column exists to prevent, so it is
            // required and every seeded row states it.
            $table->unsignedTinyInteger('minor_unit');

            // Whether the symbol leads ("$5") or trails ("5 kr"). Presentation,
            // but it lives with the currency because it is a fact about the
            // currency rather than a preference of the reader.
            $table->boolean('symbol_first')->default(true);

            // 'indian', 'western', … Used to group the picker so the currencies
            // this owner actually uses are not buried among 180 others.
            $table->string('group', 32)->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('currencies');
    }
};
