<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The transaction record. Everything else in Hisab is a view over this table.
 *
 * ONE ROW IS ONE LEG: one effect on one account. A transfer is two rows sharing
 * a group_id, not one row with two account columns - which is what makes the
 * balance of every account a single sum over its own rows, with no special case
 * for "the other side of a transfer".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table): void {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();

            // Shared by the two legs of a pair. Null on a single-leg row.
            // Not a foreign key to anything: it names a pair, not a record.
            $table->ulid('group_id')->nullable();

            // income | expense | deposit | transfer.
            // `deposit` is NOT a kind of expense - CONVENTIONS.md. Money moved
            // into savings leaves what you can spend without being spending, and
            // folding it into expense suppresses every savings figure.
            $table->string('type', 16);

            // The effect on THIS row's account. Stored rather than derived from
            // `type`, because a deposit and a transfer each produce one row of
            // each direction - so type alone cannot answer it.
            $table->string('direction', 3);

            $table->foreignUlid('account_id')->constrained('accounts')->restrictOnDelete();

            // The other side of a pair, denormalised onto both legs so a ledger
            // list renders "Transfer to Savings" in one query rather than one
            // extra query per visible row. Null on a single-leg row.
            $table->foreignUlid('counter_account_id')->nullable()->constrained('accounts')->nullOnDelete();

            // An integer in the currency's minor unit, and ALWAYS POSITIVE.
            // The sign lives in `direction`. A signed amount plus a direction is
            // two representations of one fact, and they disagree eventually.
            $table->unsignedBigInteger('amount_minor');
            $table->char('currency', 3);

            // Nullable: a transfer has no category, deliberately.
            $table->foreignUlid('category_id')->nullable()->constrained('categories')->nullOnDelete();

            // SNAPSHOT of the category's name at save time. CONVENTIONS.md,
            // snapshot vs read-through: renaming a category must not rewrite
            // last year's report. This is also what keeps a row readable after
            // its category is deleted.
            $table->string('category_label')->nullable();

            // 1..4 on expense rows only. There is no meaningful sense in which
            // receiving a salary was avoidable.
            $table->unsignedTinyInteger('necessity')->nullable();

            $table->string('method', 32)->nullable();
            $table->string('payee')->nullable();
            $table->text('note')->nullable();

            // A LOCAL calendar date - "what day did I spend this" - not an
            // instant. Kept as a date and handled as a 'Y-m-d' string; see the
            // Transaction model for why the Carbon cast is a trap here.
            $table->date('occurred_on');

            $table->string('book', 32)->default('personal');

            // Snapshotted when the transaction's currency differs from its
            // account's. Reports read the snapshot: converting last year's total
            // at today's rate silently rewrites history.
            $table->decimal('fx_rate', 24, 10)->nullable();
            $table->date('fx_as_of')->nullable();

            $table->timestamps();

            // The ledger list: one owner's book over a date range, newest first.
            // occurred_on before id because that is the sort order, and id is
            // the cursor tiebreaker - api-contract.md §8 paginates on id, since
            // a ledger is written to while it is being read and offset
            // pagination shows a row twice or skips one.
            $table->index(['user_id', 'book', 'occurred_on', 'id'], 'transactions_list');
            $table->index(['user_id', 'account_id', 'occurred_on'], 'transactions_by_account');
            $table->index(['group_id'], 'transactions_group');

            $table->foreign('method')->references('key')->on('payment_methods')->nullOnDelete();
            $table->foreign('necessity')->references('band')->on('necessity_bands')->restrictOnDelete();
            $table->foreign('currency')->references('code')->on('currencies')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
