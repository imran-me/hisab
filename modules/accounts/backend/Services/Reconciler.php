<?php

namespace Hisab\Accounts\Services;

use Hisab\Accounts\Models\Account;
use Hisab\Fx\Services\Converter;
use Illuminate\Support\Facades\DB;

/**
 * Reconciling an account to a dated statement.
 *
 * Review round 6, H1: the gap used to be worked out against TODAY's balance
 * and posted on the statement's date, so every entry after the statement
 * became part of an "adjustment", and each new entry reopened the gap. The
 * statement is compared here with the balance AS OF its own date: the
 * opening balance plus every leg on or before that day.
 *
 * A card statement is typed as the amount due, a positive figure, while the
 * ledger holds card debt as negative - so for a card the statement is read
 * as owed (−due). Without that, a ৳12,000 bill against −৳12,000 read as
 * ৳24,000 short.
 *
 * The fix-up is NOT an income or an expense (review M1): nothing was earned
 * or spent, so it must not move the month's figures. It shifts the opening
 * balance by the gap, which moves every balance from then on and no total.
 */
class Reconciler
{
    /**
     * @return array{on:string, statement_minor:int, balance_on_minor:int, gap_minor:int, currency:string}
     */
    public function check(Account $account, int $typed, string $on): array
    {
        $statement = $this->signed($account, $typed);
        $balance = $this->balanceOn($account, $on);

        return [
            'on' => $on,
            'currency' => $account->currency,
            // The statement as the ledger reads it (a card's due, negated).
            'statement_minor' => $statement,
            'balance_on_minor' => $balance,
            // Positive: the ledger is short of the statement.
            'gap_minor' => $statement - $balance,
        ];
    }

    /**
     * Bring the ledger to the statement: record the statement, and move the
     * opening balance by the gap. Idempotent - a second call finds no gap.
     *
     * @return array<string, mixed>  check() after the fix-up
     */
    public function apply(Account $account, int $typed, string $on): array
    {
        return DB::transaction(function () use ($account, $typed, $on): array {
            $gap = $this->check($account, $typed, $on)['gap_minor'];

            $account->forceFill([
                'opening_balance_minor' => (int) $account->opening_balance_minor + $gap,
                'statement_balance_minor' => $typed,
                'statement_on' => $on,
            ])->save();

            return $this->check($account->refresh(), $typed, $on) + ['adjusted_minor' => $gap];
        });
    }

    public function signed(Account $account, int $typed): int
    {
        return $account->type === 'card' ? -abs($typed) : $typed;
    }

    /**
     * Opening balance plus every leg dated on or before `$on`, in the
     * account's currency - the same rule as the ledger's balances(): a row in
     * another currency converts through its own snapshot first.
     */
    public function balanceOn(Account $account, string $on): int
    {
        $legs = DB::table('transactions')
            ->where('user_id', $account->user_id)
            ->where('account_id', $account->id)
            ->where('occurred_on', '<=', $on)
            ->get(['direction', 'amount_minor', 'currency', 'fx_rate', 'occurred_on']);

        $fx = null;
        $total = (int) $account->opening_balance_minor;

        foreach ($legs as $leg) {
            $value = (int) $leg->amount_minor;

            if ($leg->currency !== $account->currency) {
                $fx ??= new Converter((string) $account->user_id);
                $value = $fx->convert(
                    $value, (string) $leg->currency, (string) $account->currency,
                    substr((string) $leg->occurred_on, 0, 10),
                    $leg->fx_rate === null ? null : (string) $leg->fx_rate,
                );
                if ($value === null) {
                    continue;
                }
            }

            $total += $leg->direction === 'in' ? $value : -$value;
        }

        return $total;
    }
}
