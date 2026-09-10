<?php

namespace Hisab\Accounts\Services;

use App\Models\User;
use Hisab\Accounts\Models\FinanceSetting;
use Hisab\Accounts\Models\MonthClose;
use Hisab\Ledger\Models\Transaction;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Everything the Accounts screen shows for one month, computed here.
 *
 * WHY ON THE SERVER. The screen this replaces derived all of it in the browser,
 * which was the only option when the data lived in the browser too. It does not
 * any more, and re-deriving in JS would mean two implementations of carry-over,
 * of the quality weighting and of recurring detection - and CONVENTIONS.md is
 * blunt about that: if a figure is computed in two places, one of them is
 * already wrong. The client asks and renders.
 *
 * NOTHING HERE IS DESTRUCTIVE. Every record stays filed under the month of its
 * own date forever; July stays July. The opening balance is DERIVED by replaying
 * every earlier month, so a record added to July tomorrow still corrects August
 * on its own, without anyone reopening anything.
 */
class MonthCockpit
{
    /**
     * The necessity mix as one number.
     *
     * Weighted share of TAGGED spending only. Untagged money is never guessed
     * at - it is left out of the score and the screen says how much was left
     * out, because a quality score that silently assumes the untagged half was
     * essential is a score that flatters.
     *
     * Keyed by the band number the ledger stores; the labels are the frontend's.
     */
    private const QUALITY_WEIGHT = [1 => 1.0, 2 => 0.85, 3 => 0.45, 4 => 0.0];

    /**
     * @return array<string, mixed>
     */
    public function month(User $user, string $monthKey): array
    {
        $settings = FinanceSetting::forOwner($user);

        [$from, $to] = $this->bounds($monthKey);

        $rows = $this->counted($user)
            ->whereBetween('occurred_on', [$from, $to])
            ->orderByDesc('occurred_on')
            ->orderByDesc('id')
            ->get();

        $totals = $this->totals($rows);
        $carry = $this->carry($user, $settings, $monthKey);
        $closing = $carry['opening'] + $totals['net'];

        return [
            'month' => $monthKey,
            'from' => $from,
            'to' => $to,
            'opening_minor' => $carry['opening'],
            'closing_minor' => $closing,
            'vault_minor' => $carry['vault'],
            'carry_forward' => $carry['on'],
            'income_minor' => $totals['income'],
            'deposit_minor' => $totals['deposit'],
            'expense_minor' => $totals['expense'],
            'net_minor' => $totals['net'],
            'kept_minor' => $totals['kept'],
            'savings_rate' => $totals['savings_rate'],
            'quality' => $this->quality($rows),
            'recurring' => $this->recurring($user, $monthKey),
            'closed' => $this->closeFor($user, $monthKey),
            'settings' => [
                'opening_balance_minor' => $settings->opening_balance_minor,
                'carry_forward' => $settings->carry_forward,
                'monthly_budget_minor' => $settings->monthly_budget_minor,
                'savings_goal_minor' => $settings->savings_goal_minor,
            ],
            'count' => $rows->count(),
        ];
    }

    /**
     * What was in hand walking into this month, and the pot behind it.
     *
     *   opening(m) = opening balance + Σ (income − deposit − expense) before m
     *   vault(m)   = Σ deposits up to and including m — the pot, never reset
     *
     * A deposit and an expense both leave your hand; only income adds to it.
     * That is why a deposit subtracts here and still counts as kept below: it
     * left what you can spend without leaving you.
     *
     * @return array{on: bool, opening: int, vault: int}
     */
    public function carry(User $user, FinanceSetting $settings, string $monthKey): array
    {
        $on = (bool) $settings->carry_forward;
        $opening = $on ? (int) $settings->opening_balance_minor : 0;
        $vault = 0;

        // One pass over every counted row rather than a query per month: the
        // ledger of one person is small, and a month-by-month replay is N
        // queries to answer one question.
        foreach ($this->counted($user)->get(['type', 'direction', 'amount_minor', 'occurred_on', 'reverses_id']) as $row) {
            $key = substr((string) $row->occurred_on, 0, 7);
            if ($key === '') {
                continue;
            }

            $sign = $row->reverses_id === null ? 1 : -1;
            $amount = $sign * (int) $row->amount_minor;

            if ($on && $key < $monthKey) {
                $opening += $row->type === 'income' ? $amount : -$amount;
            }

            if ($row->type === 'deposit' && $row->direction === 'out' && $key <= $monthKey) {
                $vault += $amount;
            }
        }

        return ['on' => $on, 'opening' => $opening, 'vault' => $vault];
    }

    /**
     * @param  Collection<int, Transaction>  $rows
     * @return array<string, int|float>
     */
    private function totals(Collection $rows): array
    {
        $sum = fn (callable $keep): int => $rows
            ->filter($keep)
            ->sum(fn (Transaction $t): int => ($t->reverses_id === null ? 1 : -1) * (int) $t->amount_minor);

        $income = $sum(fn (Transaction $t): bool => $t->type === 'income');
        $expense = $sum(fn (Transaction $t): bool => $t->type === 'expense');
        // Counted once, on the leg that takes money out of the spendable
        // account - its mirror is the leg that puts it back.
        $deposit = $sum(fn (Transaction $t): bool => $t->type === 'deposit'
            && ($t->reverses_id === null ? $t->direction === 'out' : $t->direction === 'in'));

        return [
            'income' => $income,
            'expense' => $expense,
            'deposit' => $deposit,
            // What actually moved in your hand.
            'net' => $income - $expense - $deposit,
            // What you still have of what came in. A deposit is kept.
            'kept' => $income - $expense,
            'savings_rate' => $income > 0 ? round((($income - $expense) / $income) * 100, 1) : 0.0,
        ];
    }

    /**
     * @param  Collection<int, Transaction>  $rows
     * @return array<string, mixed>
     */
    private function quality(Collection $rows): array
    {
        $spend = $rows->filter(fn (Transaction $t): bool => $t->type === 'expense' && $t->reverses_id === null);

        $tagged = $spend->filter(fn (Transaction $t): bool => $t->necessity !== null);
        $taggedTotal = (int) $tagged->sum('amount_minor');
        $untagged = (int) $spend->sum('amount_minor') - $taggedTotal;

        if ($taggedTotal === 0) {
            // No score rather than a zero. Zero reads as "all avoidable", which
            // is a judgement nobody made.
            return ['score' => null, 'grade' => null, 'tagged_minor' => 0, 'untagged_minor' => $untagged];
        }

        $weighted = $tagged->sum(
            fn (Transaction $t): float => (self::QUALITY_WEIGHT[$t->necessity] ?? 0.0) * (int) $t->amount_minor,
        );

        $score = ($weighted / $taggedTotal) * 100;

        return [
            'score' => round($score, 1),
            'grade' => match (true) {
                $score >= 85 => 'A',
                $score >= 70 => 'B',
                $score >= 55 => 'C',
                $score >= 40 => 'D',
                default => 'E',
            },
            'tagged_minor' => $taggedTotal,
            'untagged_minor' => $untagged,
        ];
    }

    /**
     * Lines that repeat, so closing a month can offer to carry them forward.
     *
     * Taken from the `recurring` LABEL rather than guessed from the history.
     * Inferring it - "this payee appeared three months running, it must be
     * rent" - is wrong often enough to be worse than useless: it offers to
     * re-post things that were one-offs, and someone accepting the offer has
     * invented a transaction.
     *
     * @return array<int, array<string, mixed>>
     */
    private function recurring(User $user, string $monthKey): array
    {
        [$from, $to] = $this->bounds($monthKey);

        return $this->counted($user)
            ->whereNotNull('recurring')
            ->whereBetween('occurred_on', [$from, $to])
            ->get(['id', 'type', 'payee', 'amount_minor', 'currency', 'category_label', 'recurring', 'occurred_on'])
            ->map(fn (Transaction $t): array => [
                'id' => $t->id,
                'type' => $t->type,
                'payee' => $t->payee,
                'amount_minor' => (int) $t->amount_minor,
                'currency' => $t->currency,
                'category_label' => $t->category_label,
                'recurring' => $t->recurring,
                'occurred_on' => $t->occurred_on,
            ])
            ->all();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function closeFor(User $user, string $monthKey): ?array
    {
        $close = MonthClose::query()
            ->where('user_id', $user->id)->where('month', $monthKey)->first();

        return $close === null ? null : [
            'month' => $close->month,
            'note' => $close->note,
            'snapshot' => $close->snapshot,
            'closed_at' => $close->closed_at?->toJSON(),
        ];
    }

    /**
     * Rows that count toward a figure.
     *
     * Transfers are excluded everywhere here: moving money between two of your
     * own accounts is neither income nor spending, and including it inflates
     * both sides by the same amount - which leaves the difference right and the
     * savings rate meaningless.
     */
    private function counted(User $user)
    {
        return Transaction::query()
            ->where('user_id', $user->id)
            ->where('type', '!=', 'transfer');
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function bounds(string $monthKey): array
    {
        $start = Carbon::createFromFormat('Y-m-d', $monthKey.'-01')->startOfMonth();

        return [$start->toDateString(), $start->copy()->endOfMonth()->toDateString()];
    }

    /**
     * Every month that has a record in it, newest first.
     *
     * @return array<int, string>
     */
    public function months(User $user): array
    {
        return $this->counted($user)
            ->selectRaw('DISTINCT SUBSTR(occurred_on, 1, 7) AS m')
            ->orderByDesc('m')
            ->pluck('m')
            ->filter()
            ->values()
            ->all();
    }
}
