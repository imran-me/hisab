<?php

namespace Hisab\Accounts\Services;

use App\Models\User;
use Hisab\Accounts\Models\FinanceSetting;
use Hisab\Accounts\Models\MonthClose;
use Hisab\Ledger\Models\Transaction;
use Hisab\Ledger\Services\BalanceSheet;
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
 *
 * ONE BOOK AT A TIME. Every figure here is for a single book, personal unless
 * asked otherwise. This used to read every row the owner had, so September's
 * income was the salary PLUS the business's client invoices - ৳259,473 here
 * against ৳88,611 on Home for the same month. Mixing the books is the thing
 * context.md §1 says they exist to prevent: a household grocery bill has no
 * business inside a profit figure, and a client invoice is not pocket money.
 *
 * The month's income, spending and deposits come from the ledger's own
 * BalanceSheet::summary() rather than being summed again here, so the two
 * screens cannot drift apart: there is one implementation of the counting
 * rules, and this class adds only what the ledger does not know (carry-over,
 * the necessity mix, the review).
 *
 * The finance SETTINGS (opening balance, budget, goal) belong to the personal
 * book. A business's money does not start from your pocket's opening balance,
 * and a household budget is not a limit on stock purchases.
 */
class MonthCockpit
{
    public const PERSONAL = 'personal';

    public function __construct(private readonly BalanceSheet $sheet)
    {
    }

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
    public function month(User $user, string $monthKey, string $book = self::PERSONAL): array
    {
        $settings = $this->settingsFor($user, $book);

        [$from, $to] = $this->bounds($monthKey);

        $rows = $this->counted($user, $book)
            ->whereBetween('occurred_on', [$from, $to])
            ->orderByDesc('occurred_on')
            ->orderByDesc('id')
            ->get();

        $totals = $this->ledgerTotals($user, $book, $from, $to);
        $carry = $this->carry($user, $settings, $monthKey, $book);
        $closing = $carry['opening'] + $totals['net'];

        $breakdown = $this->breakdown($rows);

        return [
            'month' => $monthKey,
            'book' => $book,
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
            'leak_minor' => $this->leak($rows),
            'quality' => $this->quality($rows),
            'recurring' => $this->recurring($user, $monthKey, $book),
            'closed' => $book === self::PERSONAL ? $this->closeFor($user, $monthKey) : null,
            'rows' => $this->shape($rows),
            'days' => $this->days($rows),
            'by_need' => $breakdown['by_need'],
            'untagged_minor' => $breakdown['untagged'],
            // The two soft bands IN FULL - a different number from leak_minor,
            // which is the realistically reclaimable slice of them. The screen
            // states both, because conflating "this was discretionary" with
            // "this could have been saved" is how a target becomes fiction.
            'soft_spend_minor' => $breakdown['soft'],
            'sectors' => $breakdown['sectors'],
            'methods' => $breakdown['methods'],
            'insights' => $this->insights($user, $settings, $monthKey, $totals, $breakdown, $book),
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
    public function carry(User $user, FinanceSetting $settings, string $monthKey, string $book = self::PERSONAL): array
    {
        $on = (bool) $settings->carry_forward;
        $opening = $on ? (int) $settings->opening_balance_minor : 0;
        $vault = 0;

        // One pass over every counted row rather than a query per month: the
        // ledger of one person is small, and a month-by-month replay is N
        // queries to answer one question.
        foreach ($this->counted($user, $book)->get(['type', 'direction', 'amount_minor', 'occurred_on', 'reverses_id']) as $row) {
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
     * A row's contribution to any total.
     *
     * A reversal is stored as a row of the SAME type as the entry it cancels -
     * a reversed expense is still `type: expense` - so summing by type alone
     * counts a corrected 450 as 945 spent. That bug shipped once. Every sum on
     * this screen goes through here.
     */
    private function signed(Transaction $row): int
    {
        return ($row->reverses_id === null ? 1 : -1) * (int) $row->amount_minor;
    }

    /**
     * The leg of a deposit that counts.
     *
     * A deposit takes money out of the spendable account; when the destination
     * is an account you track it writes a second leg putting it in. Counting
     * both would show every deposit twice and cancel it to nothing. A REVERSED
     * deposit mirrors that, so the leg that counts flips with it.
     */
    private function isCountedDepositLeg(Transaction $row): bool
    {
        return $row->direction === ($row->reverses_id === null ? 'out' : 'in');
    }

    /**
     * The month's rows, as the screen reads them.
     *
     * Explicit rather than the model's own JSON: a transaction carries columns
     * this screen has no business showing (the fx rate, the counter account,
     * the group id), and shipping the whole row means the next column added to
     * the table silently appears in the API.
     *
     * @param  Collection<int, Transaction>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function shape(Collection $rows): array
    {
        return $rows->map(fn (Transaction $t): array => [
            'id' => $t->id,
            'type' => $t->type,
            'direction' => $t->direction,
            'occurred_on' => $t->occurred_on,
            'amount_minor' => (int) $t->amount_minor,
            'currency' => $t->currency,
            'category_id' => $t->category_id,
            'category_label' => $t->category_label,
            'necessity' => $t->necessity,
            'method' => $t->method,
            'payee' => $t->payee,
            'note' => $t->note,
            'recurring' => $t->recurring,
            // Carried so the ledger can MARK a correction rather than hide it.
            // An immutable ledger is only honest if its corrections are visible.
            'reverses_id' => $t->reverses_id,
            'reversal_reason' => $t->reversal_reason,
            'corrects_id' => $t->corrects_id,
            'is_demo' => (bool) $t->is_demo,
        ])->values()->all();
    }

    /**
     * Per-day totals for the calendar.
     *
     * Computed here rather than grouped in the browser for one reason: the
     * signing rule above. A client that groups the rows itself has to know a
     * reversal subtracts, and the day it forgets is the day the heatmap shows a
     * spending spike that was actually a correction.
     *
     * @param  Collection<int, Transaction>  $rows
     * @return array<string, array<string, int>>
     */
    private function days(Collection $rows): array
    {
        $days = [];

        foreach ($rows as $row) {
            $key = (string) $row->occurred_on;
            $day = $days[$key] ?? ['in' => 0, 'out' => 0, 'dep' => 0, 'n' => 0];
            $amount = $this->signed($row);

            if ($row->type === 'income') {
                $day['in'] += $amount;
            } elseif ($row->type === 'expense') {
                $day['out'] += $amount;
            } elseif ($this->isCountedDepositLeg($row)) {
                $day['dep'] += $amount;
            }

            $day['n']++;
            $days[$key] = $day;
        }

        ksort($days);

        return $days;
    }

    /**
     * The necessity mix, the sectors and the payment methods.
     *
     * PER FLOW, never merged. Summing income and expense into one figure per
     * payment method produces a number that is neither what you earned nor what
     * you spent, and it looks perfectly reasonable on the screen.
     *
     * @param  Collection<int, Transaction>  $rows
     * @return array<string, mixed>
     */
    private function breakdown(Collection $rows): array
    {
        $expense = $rows->filter(fn (Transaction $t): bool => $t->type === 'expense');
        $income = $rows->filter(fn (Transaction $t): bool => $t->type === 'income');
        $deposit = $rows->filter(fn (Transaction $t): bool => $t->type === 'deposit'
            && $this->isCountedDepositLeg($t));

        $byNeed = [1 => 0, 2 => 0, 3 => 0, 4 => 0];
        $untagged = 0;

        foreach ($expense as $row) {
            $band = $row->necessity;

            if ($band !== null && isset($byNeed[$band])) {
                $byNeed[$band] += $this->signed($row);
            } else {
                // Never folded into a band. Guessing puts money into a "could
                // have saved" figure that nobody classified.
                $untagged += $this->signed($row);
            }
        }

        return [
            'by_need' => $byNeed,
            'untagged' => $untagged,
            'soft' => $byNeed[3] + $byNeed[4],
            'sectors' => [
                'income' => $this->group($income, 'category_label', 'Uncategorised'),
                'expense' => $this->group($expense, 'category_label', 'Uncategorised'),
                'deposit' => $this->group($deposit, 'category_label', 'Uncategorised'),
            ],
            'methods' => [
                'in' => $this->group($income, 'method', 'Other'),
                'out' => $this->group($expense, 'method', 'Other'),
                'dep' => $this->group($deposit, 'method', 'Other'),
            ],
        ];
    }

    /**
     * Sum one column into [label, minor] pairs, biggest first.
     *
     * Zero and negative buckets are dropped: a category whose only entry was
     * reversed nets to nothing, and a bar of length zero labelled with a real
     * category name reads as "we spent nothing on this" rather than "this did
     * not happen".
     *
     * @param  Collection<int, Transaction>  $rows
     * @return array<int, array{0: string, 1: int}>
     */
    private function group(Collection $rows, string $column, string $fallback): array
    {
        $buckets = [];

        foreach ($rows as $row) {
            $key = (string) ($row->{$column} ?: $fallback);
            $buckets[$key] = ($buckets[$key] ?? 0) + $this->signed($row);
        }

        $out = [];
        foreach ($buckets as $label => $amount) {
            if ($amount > 0) {
                $out[] = [(string) $label, $amount];
            }
        }

        usort($out, fn (array $a, array $b): int => $b[1] <=> $a[1]);

        return $out;
    }

    /**
     * What the month is telling you, as decisions rather than sentences.
     *
     * The SERVER decides which observations are worth making and supplies the
     * figures; the CLIENT owns the wording. Splitting it there keeps every
     * threshold - what counts as a strong savings rate, how big a swing is
     * worth mentioning - in one place, without this file generating HTML that a
     * browser is then asked to trust.
     *
     * @param  array<string, int|float>  $totals
     * @param  array<string, mixed>  $breakdown
     * @return array<int, array<string, mixed>>
     */
    private function insights(
        User $user,
        FinanceSetting $settings,
        string $monthKey,
        array $totals,
        array $breakdown,
        string $book = self::PERSONAL,
    ): array {
        $income = (int) $totals['income'];
        $expense = (int) $totals['expense'];
        $deposit = (int) $totals['deposit'];
        $kept = (int) $totals['kept'];

        if ($income === 0 && $expense === 0 && $deposit === 0) {
            return [['code' => 'empty', 'tone' => 'slate', 'ico' => 'info-circle']];
        }

        $out = [];

        if ($income > 0) {
            $rate = (float) $totals['savings_rate'];
            $out[] = match (true) {
                // 20% is the conventional healthy mark, and the screen names it
                // so the number is not a threshold out of nowhere.
                $rate >= 20 => ['code' => 'kept_strong', 'tone' => 'green', 'ico' => 'piggy-bank',
                    'rate' => $rate, 'kept_minor' => $kept,
                    'deposit_minor' => $deposit, 'net_minor' => (int) $totals['net']],
                $kept >= 0 => ['code' => 'kept_thin', 'tone' => 'amber', 'ico' => 'piggy-bank',
                    'rate' => $rate, 'kept_minor' => $kept,
                    'deposit_minor' => $deposit, 'net_minor' => (int) $totals['net']],
                default => ['code' => 'overspent', 'tone' => 'red', 'ico' => 'graph-down-arrow',
                    'over_minor' => -$kept],
            };
        }

        if ($deposit > 0) {
            $out[] = ['code' => 'deposited', 'tone' => 'violet', 'ico' => 'bank',
                'deposit_minor' => $deposit,
                'share' => $income > 0 ? round(($deposit / $income) * 100, 1) : null];
        }

        $soft = (int) $breakdown['soft'];
        if ($soft > 0 && $expense > 0) {
            $out[] = ['code' => 'soft_spend', 'tone' => 'red', 'ico' => 'scissors',
                'soft_minor' => $soft,
                'leak_minor' => $breakdown['by_need'][4] + intdiv($breakdown['by_need'][3], 2),
                'share' => round(($soft / $expense) * 100, 1)];
        }

        if ($breakdown['untagged'] > 0) {
            $out[] = ['code' => 'untagged', 'tone' => 'slate', 'ico' => 'question-circle',
                'untagged_minor' => (int) $breakdown['untagged']];
        }

        $sectors = $breakdown['sectors']['expense'];
        if ($sectors !== [] && $expense > 0) {
            $out[] = ['code' => 'top_sector', 'tone' => 'blue', 'ico' => 'pie-chart',
                'label' => $sectors[0][0], 'amount_minor' => $sectors[0][1],
                'share' => round(($sectors[0][1] / $expense) * 100, 1)];
        }

        $previous = $this->shiftMonth($monthKey, -1);
        $was = (int) $this->totals($this->rowsFor($user, $previous, $book))['expense'];
        // 8%: below that a month-on-month "change" is noise, and reporting noise
        // as a trend teaches people to ignore the ones that matter.
        if ($was > 0 && abs($expense - $was) > $was * 0.08) {
            $out[] = ['code' => 'spend_moved', 'tone' => $expense > $was ? 'amber' : 'green',
                'ico' => $expense > $was ? 'arrow-up-right' : 'arrow-down-right',
                'up' => $expense > $was, 'share' => round(abs(($expense - $was) / $was) * 100, 1),
                'previous' => $previous];
        }

        $budget = (int) $settings->monthly_budget_minor;
        if ($budget > 0) {
            $out[] = $expense > $budget
                ? ['code' => 'over_budget', 'tone' => 'red', 'ico' => 'flag',
                    'over_minor' => $expense - $budget, 'budget_minor' => $budget]
                : ['code' => 'within_budget', 'tone' => 'green', 'ico' => 'flag',
                    'left_minor' => $budget - $expense, 'budget_minor' => $budget];
        }

        return $out;
    }

    /**
     * Every month on file, with what it opened and closed on.
     *
     * ONE PASS over the ledger rather than a query per month. Three years of
     * records is thirty-six months, and thirty-six round trips to answer one
     * question is how an archive screen becomes the slow one.
     *
     * @return array<string, mixed>
     */
    public function archive(User $user, string $book = self::PERSONAL): array
    {
        $settings = $this->settingsFor($user, $book);
        $carryOn = (bool) $settings->carry_forward;

        /** @var array<string, array<string, int>> $months */
        $months = [];
        $weighted = [];
        $tagged = [];

        foreach ($this->counted($user, $book)->get() as $row) {
            $key = substr((string) $row->occurred_on, 0, 7);
            if ($key === '') {
                continue;
            }

            $months[$key] ??= ['income' => 0, 'deposit' => 0, 'expense' => 0, 'count' => 0];
            $weighted[$key] ??= 0.0;
            $tagged[$key] ??= 0;

            $amount = $this->signed($row);
            $months[$key]['count']++;

            if ($row->type === 'income') {
                $months[$key]['income'] += $amount;
            } elseif ($row->type === 'expense') {
                $months[$key]['expense'] += $amount;

                if ($row->necessity !== null && isset(self::QUALITY_WEIGHT[$row->necessity])) {
                    $weighted[$key] += self::QUALITY_WEIGHT[$row->necessity] * $amount;
                    $tagged[$key] += $amount;
                }
            } elseif ($this->isCountedDepositLeg($row)) {
                $months[$key]['deposit'] += $amount;
            }
        }

        ksort($months);

        // A review is of the personal month; another book has none to show.
        $closes = $book === self::PERSONAL
            ? MonthClose::query()->where('user_id', $user->id)->get()->keyBy('month')
            : collect();

        // Running, in date order: the opening of one month is the closing of the
        // last, and the vault never resets.
        $running = $carryOn ? (int) $settings->opening_balance_minor : 0;
        $vault = 0;
        $out = [];

        foreach ($months as $key => $m) {
            $net = $m['income'] - $m['expense'] - $m['deposit'];
            $vault += $m['deposit'];
            $opening = $running;
            $running = $carryOn ? $running + $net : 0;

            $close = $closes->get($key);

            $out[] = [
                'month' => $key,
                'opening_minor' => $opening,
                'closing_minor' => $opening + $net,
                'income_minor' => $m['income'],
                'deposit_minor' => $m['deposit'],
                'expense_minor' => $m['expense'],
                'net_minor' => $net,
                'kept_minor' => $m['income'] - $m['expense'],
                'savings_rate' => $m['income'] > 0
                    ? round((($m['income'] - $m['expense']) / $m['income']) * 100, 1) : 0.0,
                'vault_minor' => $vault,
                'count' => $m['count'],
                'quality' => $tagged[$key] > 0
                    ? $this->grade(($weighted[$key] / $tagged[$key]) * 100)
                    : ['score' => null, 'grade' => null],
                'closed' => $close === null ? null : [
                    'note' => $close->note,
                    'closed_at' => $close->closed_at?->toJSON(),
                ],
            ];
        }

        $life = [
            'months' => count($out),
            'count' => array_sum(array_column($out, 'count')),
            'income_minor' => array_sum(array_column($out, 'income_minor')),
            'deposit_minor' => array_sum(array_column($out, 'deposit_minor')),
            'expense_minor' => array_sum(array_column($out, 'expense_minor')),
            'vault_minor' => $vault,
            // What is in hand after the LAST month on file - not a sum of the
            // closings, which counts every leftover once per month it survived.
            'balance_minor' => $out === [] ? 0 : $out[count($out) - 1]['closing_minor'],
        ];
        $life['kept_minor'] = $life['income_minor'] - $life['expense_minor'];
        $life['savings_rate'] = $life['income_minor'] > 0
            ? round(($life['kept_minor'] / $life['income_minor']) * 100, 1) : 0.0;
        // Averaged over the months that HAD spending. Dividing by every month on
        // file drags the average down with months that were never used.
        $spending = array_filter($out, fn (array $m): bool => $m['expense_minor'] > 0);
        $life['avg_expense_minor'] = $spending === []
            ? 0 : intdiv($life['expense_minor'], count($spending));

        // Newest first, the way an archive is read.
        return ['months' => array_reverse($out), 'lifetime' => $life];
    }

    /** @return array{score: float, grade: string} */
    private function grade(float $score): array
    {
        return [
            'score' => round($score, 1),
            'grade' => match (true) {
                $score >= 85 => 'A',
                $score >= 70 => 'B',
                $score >= 55 => 'C',
                $score >= 40 => 'D',
                default => 'E',
            },
        ];
    }

    /** @return Collection<int, Transaction> */
    private function rowsFor(User $user, string $monthKey, string $book): Collection
    {
        [$from, $to] = $this->bounds($monthKey);

        return $this->counted($user, $book)->whereBetween('occurred_on', [$from, $to])->get();
    }

    /**
     * The month's totals, taken from the ledger rather than summed again.
     *
     * BalanceSheet::summary() is what /api/ledger/summary answers with, so Home
     * and this screen read the same three numbers from the same code. The two
     * derived figures keep the names this screen has always used: `net` is
     * what moved in your hand (the ledger's spendable_minor) and `kept` is what
     * you still have of what came in, a deposit included.
     *
     * @return array<string, int|float>
     */
    private function ledgerTotals(User $user, string $book, string $from, string $to): array
    {
        $s = $this->sheet->summary($user, $book, $from, $to);

        $income = (int) $s['income_minor'];
        $expense = (int) $s['expense_minor'];
        $deposit = (int) $s['deposit_minor'];

        return [
            'income' => $income,
            'expense' => $expense,
            'deposit' => $deposit,
            'net' => (int) $s['spendable_minor'],
            'kept' => $income - $expense,
            'savings_rate' => $income > 0 ? round((($income - $expense) / $income) * 100, 1) : 0.0,
        ];
    }

    /**
     * The settings that apply to a book.
     *
     * The stored row is the personal book's. Any other book gets the same
     * shape with nothing set - carry-over on, from zero, no budget - rather
     * than inheriting a pocket-money opening balance it never had. Built in
     * memory and never saved, so asking about the business book cannot write
     * a row.
     */
    private function settingsFor(User $user, string $book): FinanceSetting
    {
        if ($book === self::PERSONAL) {
            return FinanceSetting::forOwner($user);
        }

        return new FinanceSetting(['user_id' => $user->id]);
    }

    private function shiftMonth(string $monthKey, int $by): string
    {
        return Carbon::createFromFormat('Y-m-d', $monthKey.'-01')
            ->startOfMonth()->addMonthsNoOverflow($by)->format('Y-m');
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
     * The realistically reclaimable slice of a month's spending.
     *
     * All of the avoidable, plus HALF of the discretionary. Not all of the
     * discretionary: a figure that assumes every meal out and every book could
     * simply not have happened is arithmetically true and useless as a target -
     * nobody reclaims it, so nobody acts on it. Half is a number a person can
     * look at and believe.
     *
     * Untagged spending is not in it, for the same reason it is not in the
     * quality score: it has not been judged, and guessing would put money in a
     * "could have saved" figure that nobody put there.
     */
    private function leak(Collection $rows): int
    {
        $spend = $rows->filter(
            fn (Transaction $t): bool => $t->type === 'expense' && $t->reverses_id === null,
        );

        $avoidable = (int) $spend->where('necessity', 4)->sum('amount_minor');
        $discretionary = (int) $spend->where('necessity', 3)->sum('amount_minor');

        return $avoidable + intdiv($discretionary, 2);
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
    private function recurring(User $user, string $monthKey, string $book): array
    {
        [$from, $to] = $this->bounds($monthKey);

        return $this->counted($user, $book)
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
     *
     * And one book only, always: see the class comment.
     */
    private function counted(User $user, string $book)
    {
        return Transaction::query()
            ->where('user_id', $user->id)
            ->where('book', $book)
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
    public function months(User $user, string $book = self::PERSONAL): array
    {
        return $this->counted($user, $book)
            ->selectRaw('DISTINCT SUBSTR(occurred_on, 1, 7) AS m')
            ->orderByDesc('m')
            ->pluck('m')
            ->filter()
            ->values()
            ->all();
    }
}
