<?php

namespace Hisab\Ledger\Services;

use App\Models\User;
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
            ->get(['id', 'opening_balance_minor']);

        $movements = DB::table('transactions')
            ->where('user_id', $user->id)
            ->when($book !== null, fn ($q) => $q->where('book', $book))
            ->groupBy('account_id')
            ->select('account_id', DB::raw(
                "SUM(CASE WHEN direction = 'in' THEN amount_minor ELSE -amount_minor END) AS net",
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

        return $out;
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
     * @return array<string, mixed>
     */
    public function summary(User $user, string $book, string $from, string $to): array
    {
        $rows = Transaction::query()
            ->where('user_id', $user->id)
            ->where('book', $book)
            ->whereBetween('occurred_on', [$from, $to])
            ->get(['type', 'direction', 'amount_minor', 'currency', 'reverses_id', 'category_id', 'category_label', 'necessity', 'method']);

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

        $totals = ['income' => 0, 'expense' => 0, 'deposit' => 0];

        foreach ($counted as $row) {
            // Totals are per currency in truth; this sums the minor units of
            // whatever is present and the client converts using the snapshot.
            // Stated rather than hidden: CONVENTIONS.md forbids summing two
            // currencies, so `currencies` below names what went in.
            $sign = $row->reverses_id === null ? 1 : -1;
            $totals[$row->type] = ($totals[$row->type] ?? 0) + ($sign * $row->amount_minor);
        }

        return [
            'from' => $from,
            'to' => $to,
            'book' => $book,
            'income_minor' => $totals['income'],
            'expense_minor' => $totals['expense'],
            'deposit_minor' => $totals['deposit'],
            // What you actually have left: income less what was spent AND less
            // what was moved into savings. A deposit is not spending, but it is
            // not spendable either, and that is the whole point of the type.
            'spendable_minor' => $totals['income'] - $totals['expense'] - $totals['deposit'],
            'currencies' => $counted->pluck('currency')->unique()->values(),
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
                    fn (Transaction $t): int => ($t->reverses_id === null ? 1 : -1) * $t->amount_minor,
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
