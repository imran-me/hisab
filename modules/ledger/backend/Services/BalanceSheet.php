<?php

namespace Hisab\Ledger\Services;

use App\Models\User;
use Hisab\Fx\Services\Converter;
use Hisab\Ledger\Models\Transaction;
use Illuminate\Support\Facades\DB;

/**
 * Derived figures: balances, and a period's totals.
 *
 * THE ONLY PLACE A BALANCE IS COMPUTED. Accounts deliberately does not, so
 * there is exactly one implementation of this sum — CONVENTIONS.md, one source
 * of truth per rule: if a figure is computed in two places, one of them is
 * already wrong.
 */
class BalanceSheet
{
    /**
     * Balance per account: opening + Σ(in) − Σ(out), over that account's rows,
     * regardless of type.
     *
     * Regardless of type is the important half. A transfer is excluded from
     * every TOTAL, but it absolutely moves an account balance — that is what it
     * is. Filtering transfers out here would leave the money in both accounts at
     * once.
     *
     * @return array<string, int>  account id => balance in minor units
     */
    public function balances(User $user, ?string $book = null): array
    {
        $accounts = DB::table('accounts')
            ->where('user_id', $user->id)
            ->when($book !== null, fn ($q) => $q->where('book', $book))
            ->get(['id', 'currency', 'opening_balance_minor']);

        $currencyOf = $accounts->pluck('currency', 'id');

        // Rows in their account's own currency - nearly all of them - are
        // summed by the database.
        $movements = DB::table('transactions')
            ->join('accounts', 'accounts.id', '=', 'transactions.account_id')
            ->where('transactions.user_id', $user->id)
            ->whereColumn('transactions.currency', 'accounts.currency')
            ->when($book !== null, fn ($q) => $q->where('transactions.book', $book))
            ->groupBy('transactions.account_id')
            ->select('transactions.account_id', DB::raw(
                "SUM(CASE WHEN transactions.direction = 'in' THEN transactions.amount_minor ELSE -transactions.amount_minor END) AS net",
            ))
            ->pluck('net', 'account_id');

        $out = [];

        foreach ($accounts as $account) {
            // (int) on both: the driver returns SUM() as a string, and adding a
            // numeric string to an int in PHP is fine right up until the total
            // exceeds what a float holds exactly. Money is an integer here.
            $out[$account->id] = (int) $account->opening_balance_minor
                + (int) ($movements[$account->id] ?? 0);
        }

        // A row in ANOTHER currency - a USD 12.99 charge on a taka card - is
        // converted into the account's currency first. This used to be summed
        // as it stood, so the charge moved the balance by 12.99 TAKA. The row's
        // snapshot is exactly the rate from its currency to its account's, so
        // it is used when present; otherwise the rate as of its date. With no
        // rate at all the row is left out and its currency named.
        $this->unconverted = [];
        $foreign = DB::table('transactions')
            ->join('accounts', 'accounts.id', '=', 'transactions.account_id')
            ->where('transactions.user_id', $user->id)
            ->whereColumn('transactions.currency', '!=', 'accounts.currency')
            ->when($book !== null, fn ($q) => $q->where('transactions.book', $book))
            ->get(['transactions.account_id', 'transactions.direction', 'transactions.amount_minor',
                'transactions.currency', 'transactions.fx_rate', 'transactions.occurred_on']);

        if ($foreign->isNotEmpty()) {
            $rates = new Converter((string) $user->id);

            foreach ($foreign as $row) {
                $to = $currencyOf[$row->account_id] ?? null;
                if ($to === null) {
                    continue;
                }

                $value = $rates->convert(
                    (int) $row->amount_minor,
                    (string) $row->currency,
                    (string) $to,
                    substr((string) $row->occurred_on, 0, 10),
                    $row->fx_rate === null ? null : (string) $row->fx_rate,
                );

                if ($value === null) {
                    $this->unconverted[(string) $row->currency] = true;

                    continue;
                }

                $out[$row->account_id] += $row->direction === 'in' ? $value : -$value;
            }
        }

        return $out;
    }

    /** @var array<string, true> currencies the last balances() call could not convert */
    private array $unconverted = [];

    /**
     * The currencies the last balances() call left out for want of a rate, so
     * the response can say a balance is incomplete rather than look whole.
     *
     * @return array<int, string>
     */
    public function unconverted(): array
    {
        return array_keys($this->unconverted);
    }

    /**
     * One period's totals.
     *
     * The counting rules are the part the contract calls easy to get wrong, and
     * each one is wrong in a way that still looks plausible:
     *
     *   income    Σ type = income
     *   expense   Σ type = expense
     *   deposit   Σ type = deposit AND direction = 'out' — ONCE. A two-leg
     *             deposit has an out leg and an in leg; summing both doubles
     *             every savings figure.
     *   transfer  excluded entirely. It is neither income nor spending, and
     *             including it inflates both sides by the same amount, which
     *             leaves the difference right and the savings rate meaningless.
     *
     * Every figure is in ONE currency, `$currency`: each row is converted
     * before it is added (see Hisab\Fx\Services\Converter). A row that cannot be converted is
     * left out of the figures and named in `unconvertible`, never counted 1:1.
     *
     * @return array<string, mixed>
     */
    public function summary(User $user, string $book, string $from, string $to, string $currency = 'BDT'): array
    {
        $rows = Transaction::query()
            ->where('user_id', $user->id)
            ->where('book', $book)
            ->whereBetween('occurred_on', [$from, $to])
            ->get(['id', 'type', 'direction', 'account_id', 'amount_minor', 'currency', 'fx_rate', 'occurred_on', 'reverses_id', 'category_id', 'category_label', 'necessity', 'method']);

        // A REVERSAL IS STILL type = expense.
        //
        // That is the trap here, and it does not announce itself: a corrected
        // 45,000 expense leaves an original, a mirror and a replacement, and
        // summing by type alone reports 94,500 spent - a figure that is wrong
        // and entirely plausible. The mirror has to SUBTRACT.
        //
        // reverses_id is what separates a mirror from an ordinary leg, and it
        // has to be reverses_id rather than direction: a paired deposit already
        // has one leg of each direction without any reversal involved.
        $counted = $rows->filter(function (Transaction $t): bool {
            if ($t->type === 'transfer') {
                return false;
            }

            if ($t->type !== 'deposit') {
                return true;
            }

            // A deposit is counted ONCE, on the leg that takes money out of the
            // spendable account - and its mirror is the leg that puts it back,
            // which is the `in` one.
            return $t->reverses_id === null
                ? $t->direction === 'out'
                : $t->direction === 'in';
        });

        // Converted BEFORE anything is added. This used to sum amount_minor
        // across currencies and leave the conversion to the client, which
        // cannot be done after the fact: August's USD 450.00 payout arrived as
        // "45000" added to taka poisha, reading as ৳450 instead of ~৳55,000.
        //
        // Through the fx module's Converter, the same one the month cockpit
        // uses, so the two screens cannot pick different rates for one row.
        $rates = new Converter((string) $user->id);
        $accountCurrency = DB::table('accounts')
            ->whereIn('id', $counted->pluck('account_id')->unique()->all())
            ->pluck('currency', 'id');

        $unconvertible = [];
        $counted = $counted->filter(function (Transaction $t) use ($rates, $accountCurrency, $currency, &$unconvertible): bool {
            $value = $rates->convert(
                (int) $t->amount_minor,
                (string) $t->currency,
                $currency,
                substr((string) $t->getRawOriginal('occurred_on'), 0, 10),
                // The snapshot is the rate from the row's currency to its
                // ACCOUNT's, so it only applies when that is the target.
                ($accountCurrency[$t->account_id] ?? null) === $currency && $t->getRawOriginal('fx_rate') !== null
                    ? (string) $t->getRawOriginal('fx_rate')
                    : null,
            );

            if ($value === null) {
                $unconvertible[] = (string) $t->currency;

                return false;
            }

            $t->setAttribute('converted_minor', $value);

            return true;
        });

        $totals = ['income' => 0, 'expense' => 0, 'deposit' => 0];

        foreach ($counted as $row) {
            $sign = $row->reverses_id === null ? 1 : -1;
            $totals[$row->type] = ($totals[$row->type] ?? 0) + ($sign * $row->converted_minor);
        }

        return [
            'from' => $from,
            'to' => $to,
            'book' => $book,
            // The one currency every figure below is in.
            'currency' => $currency,
            'income_minor' => $totals['income'],
            'expense_minor' => $totals['expense'],
            'deposit_minor' => $totals['deposit'],
            // What you actually have left: income less what was spent AND less
            // what was moved into savings. A deposit is not spending, but it is
            // not spendable either, and that is the whole point of the type.
            'spendable_minor' => $totals['income'] - $totals['expense'] - $totals['deposit'],
            // What went in, before conversion - so a screen can say "includes
            // a dollar payout" - and what could not be converted at all.
            'currencies' => $counted->pluck('currency')->unique()->values(),
            'unconvertible' => array_values(array_unique($unconvertible)),
            'by_category' => $this->group($counted, 'category_label'),
            'by_method' => $this->group($counted, 'method'),
            'by_necessity' => $this->group($counted->where('type', 'expense'), 'necessity'),
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Transaction>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function group($rows, string $key): array
    {
        return $rows
            ->groupBy(fn (Transaction $t) => $t->{$key} ?? '—')
            ->map(fn ($group, $label): array => [
                'key' => $label,
                // Signed, for the same reason the totals are: a mirror belongs
                // to the same category as the entry it cancels, so adding it
                // would double that category's share instead of clearing it.
                'total_minor' => $group->sum(
                    fn (Transaction $t): int => ($t->reverses_id === null ? 1 : -1) * (int) $t->converted_minor,
                ),
                // Entries that still stand, so a corrected entry counts once
                // rather than three times.
                'count' => $group->filter(fn (Transaction $t): bool => $t->reverses_id === null)->count(),
            ])
            // A category whose entries all cancelled out is not a row worth
            // showing - it would read as spending that did not happen.
            ->filter(fn (array $r): bool => $r['total_minor'] !== 0)
            ->sortByDesc('total_minor')
            ->values()
            ->all();
    }
}
