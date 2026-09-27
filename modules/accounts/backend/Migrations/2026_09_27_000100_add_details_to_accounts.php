<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The details an account actually has: branch, holder, the number, the kind
 * of bank account, the card's network and statement day, a colour, notes,
 * and the last statement it was reconciled against.
 *
 * NONE OF THESE IS A BALANCE. The balance stays derived from the ledger
 * (context.md, "Account balances are derived, never stored"). The statement
 * fields are an INPUT - what the bank said on a date - so the screen can show
 * the gap between that and the derived figure and offer an adjustment entry.
 * The gap is never stored; it is recomputed from the ledger every time.
 *
 * The full account number is stored ENCRYPTED (the model's `encrypted` cast,
 * the app key). It is served only by GET /api/accounts/{id}, never in the
 * list, which the browser caches on the device; the list carries the last
 * four digits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->string('branch', 120)->nullable()->after('institution');
            $table->string('holder_name', 120)->nullable()->after('branch');
            // Ciphertext, so TEXT: its length has nothing to do with the number's.
            $table->text('account_number')->nullable()->after('holder_name');
            $table->string('bank_account_type', 16)->nullable()->after('account_number');
            $table->string('routing_number', 16)->nullable()->after('bank_account_type');
            $table->string('card_network', 16)->nullable()->after('credit_limit_minor');
            $table->unsignedTinyInteger('statement_day')->nullable()->after('card_network');
            $table->string('colour', 24)->nullable()->after('statement_day');
            $table->text('notes')->nullable()->after('colour');
            $table->bigInteger('statement_balance_minor')->nullable()->after('notes');
            $table->date('statement_on')->nullable()->after('statement_balance_minor');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->dropColumn([
                'branch', 'holder_name', 'account_number', 'bank_account_type', 'routing_number',
                'card_network', 'statement_day', 'colour', 'notes',
                'statement_balance_minor', 'statement_on',
            ]);
        });
    }
};
