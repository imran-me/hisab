<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Accounts: a place money sits.
 *
 * NOTE WHAT IS NOT HERE: there is no `balance` column, and there never will be.
 * CONVENTIONS.md: balances are derived, never stored - a stored balance and a
 * ledger will disagree eventually, and then there are two truths and no way to
 * tell which is the lie. The only stored figure is the OPENING balance, which
 * is history rather than a running total.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table): void {
            // Minted by the CLIENT as a ULID and sent, so a transaction saved
            // offline has its final identity from the moment it is created.
            // Safe because an id is not a capability here: knowing one grants
            // nothing, since every read resolves through the owner.
            $table->ulid('id')->primary();

            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();

            $table->string('name');

            // cash | bank | mfs | card | wallet | savings | investment.
            // Not decoration: `card` carries a credit limit and runs negative,
            // and `savings`/`investment` are excluded from the spendable total
            // because money in a DPS is yours but is not money you can spend
            // today. Rolling them together is how a savings balance gets
            // accidentally budgeted.
            $table->string('type', 16);

            $table->char('currency', 3);

            // 'personal', or the id of a business. Accounts never move between
            // books: a business account becoming personal is a real financial
            // event (a drawing), and re-labelling it would rewrite the history
            // of both books.
            $table->string('book', 32)->default('personal');

            // What was in the account before the first recorded transaction.
            // Without it every balance is wrong by a constant, and the error is
            // invisible because everything still adds up internally.
            $table->bigInteger('opening_balance_minor')->default(0);
            $table->date('opening_on')->nullable();

            $table->string('institution')->nullable();

            // The last few digits only. Never the full number: this is for
            // telling two cards apart in a picker, not for making a payment,
            // and a full PAN in a ledger is a liability with no upside.
            $table->string('number_tail', 8)->nullable();

            // Only meaningful on `card`. Its "available" figure is
            // limit - |balance|, which is not the balance.
            $table->bigInteger('credit_limit_minor')->nullable();

            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'book', 'archived_at'], 'accounts_scope');

            $table->foreign('currency')->references('code')->on('currencies')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
