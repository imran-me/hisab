<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dues (baki): the people, and what moved between you and them.
 *
 * Neither table holds a balance. A person's balance is the sum of the Dues
 * account's ledger legs that their entries point at (endpoints.md, "the
 * counting rule"), so a transfer reversed in the Ledger corrects the person
 * too, with nothing here to update.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dues_people', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->string('book', 32)->default('personal');
            $table->string('name', 80);
            $table->string('phone', 32)->nullable();
            $table->text('note')->nullable();

            // The next day to chase this one. A date, not a schedule: a
            // reminder is "ask Rahim on the 1st", not a cron.
            $table->date('remind_on')->nullable();

            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'book']);
        });

        Schema::create('dues_entries', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('person_id')->constrained('dues_people')->cascadeOnDelete();

            // lent | got_back | borrowed | paid_back
            $table->string('kind', 16);

            // As entered, always positive; the sign comes from the kind. Kept
            // for the history line - the BALANCE is read from the ledger leg.
            $table->unsignedBigInteger('amount_minor');
            $table->char('currency', 3);
            $table->date('occurred_on');
            $table->text('note')->nullable();

            // The real account the money came out of or went into.
            $table->foreignUlid('account_id')->constrained('accounts')->restrictOnDelete();

            // The Dues account's leg of the ledger transfer. Cascade: when the
            // demo purge deletes its transactions, an entry pointing at nothing
            // would be a due with no money behind it.
            $table->foreignUlid('transaction_id')->constrained('transactions')->cascadeOnDelete();

            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'person_id', 'occurred_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dues_entries');
        Schema::dropIfExists('dues_people');
    }
};
