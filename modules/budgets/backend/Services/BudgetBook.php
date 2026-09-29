<?php

namespace Hisab\Budgets\Services;

use Hisab\Ledger\Services\ReversalChain;
use App\Models\User;
use Hisab\Budgets\Models\Budget;
use Hisab\Categories\Models\Category;
use Hisab\Fx\Services\Converter;
use Hisab\Ledger\Models\Transaction;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A month's budgets, and how far into each one the month is.
 *
 * SPENT IS COUNTED BY THE LEDGER'S RULE, not a rule of its own: expense rows
 * only (a deposit is not spending, a transfer has no category), each converted
 * into the target currency before it is added, a reversal's mirror
 * subtracting. It has to be summed here rather than read from
 * BalanceSheet::summary(), because that groups by the category's SNAPSHOT
 * label and a budget belongs to the category itself - rename "Groceries" to
 * "Bazar" and last week's entries still count against it. A test pins the sum
 * of every category here to the summary's expense_minor, so the two can never
 * drift apart silently.
 */
class BudgetBook
{
    /** From this share of the budget used, the month is a warning. */
    public const WARN_AT = 0.75;

    /** How many earlier months the average and the suggestion look at. */
    private const HISTORY = 3;

    private Converter $fx;

    /** @var array<string, string> account id => its currency, for the snapshot rule */
    private array $accountCurrency = [];

    /** @var array<string, int> code => minor_unit */
    private array $minorUnit = [];

    /** @var array<string, true> */
    private array $unconvertible = [];

    /** @var array<string, array<string, array<string, array{0:int,1:int}>>> target => month => category => [minor, count] */
    private array $memo = [];

    /**
     * @return array<string, mixed>
     */
    public function month(User $user, string $book, string $month, string $currency): array
    {
        $this->begin($user);

        $start = Carbon::createFromFormat('Y-m-d', $month.'-01')->startOfDay();
        $from = $start->toDateString();
        $to = $start->copy()->endOfMonth()->toDateString();
        $historyFrom = $start->copy()->subMonths(self::HISTORY)->toDateString();

        $rows = Transaction::query()
            ->where('user_id', $user->id)
            ->where('book', $book)
            ->where('type', 'expense')
            ->whereBetween('occurred_on', [$historyFrom, $to])
            ->get(['id', 'account_id', 'amount_minor', 'currency', 'fx_rate', 'occurred_on', 'reverses_id', 'category_id']);

        $categories = Category::query()
            ->where('user_id', $user->id)->where('book', $book)->where('type', 'expense')
            ->whereNull('archived_at')
            ->orderBy('sort_order')->orderBy('label')
            ->get(['id', 'key', 'label', 'necessity', 'sort_order']);

        $budgets = Budget::query()
            ->where('user_id', $user->id)->where('book', $book)
            ->get()->keyBy('category_id');

        $now = Carbon::now();
        $isCurrent = $now->format('Y-m') === $month;
        $daysIn = $start->daysInMonth;
        $daysLeft = match (true) {
            $isCurrent => $daysIn - $now->day + 1,
            $month > $now->format('Y-m') => $daysIn,
            default => 0,
        };

        $previous = [];
        for ($i = 1; $i <= self::HISTORY; $i++) {
            $previous[] = $start->copy()->subMonths($i)->format('Y-m');
        }

        $out = [];
        $listed = [];

        foreach ($categories as $category) {
            $listed[$category->id] = true;
            $budget = $budgets[$category->id] ?? null;
            $target = $budget?->currency ?? $currency;
            $sums = $this->spent($rows, $target);

            [$spent, $count] = $sums[$month][$category->id] ?? [0, 0];
            $history = array_map(fn (string $m): int => $sums[$m][$category->id][0] ?? 0, $previous);
            $withData = array_values(array_filter($history, fn (int $v): bool => $v > 0));
            $average = $withData ? intdiv(array_sum($withData), count($withData)) : 0;
            $lastMonth = $history[0];

            $row = [
                'category_id' => $category->id,
                'key' => $category->key,
                'label' => $category->label,
                'necessity' => $category->necessity,
                'budget' => $budget ? [
                    'id' => $budget->id,
                    'amount_minor' => $budget->amount_minor,
                    'currency' => $budget->currency,
                ] : null,
                'currency' => $target,
                'spent_minor' => $spent,
                'count' => $count,
                'left_minor' => null,
                'per_day_minor' => null,
                'ratio' => null,
                'state' => null,
                'last_month_minor' => $lastMonth,
                'average_minor' => $average,
                'suggested_minor' => $this->roundUp(max($average, $lastMonth, $spent), $target),
            ];

            if ($budget) {
                $row = array_merge($row, $this->progress($budget->amount_minor, $spent, $daysLeft, $target));
            }

            $out[] = $row;
        }

        // Budgeted first, most used first - the one about to run out is the
        // one to read. Then the rest by what they cost, so the category worth
        // a budget is at the top of the offer.
        usort($out, function (array $a, array $b): int {
            if (($a['budget'] === null) !== ($b['budget'] === null)) {
                return $a['budget'] === null ? 1 : -1;
            }

            return $a['budget'] !== null
                ? $b['ratio'] <=> $a['ratio']
                : $b['spent_minor'] <=> $a['spent_minor'];
        });

        // Spending this screen has no row for: uncategorised, or a category
        // since archived. Returned so the rows plus this add up to the month.
        $inCurrency = $this->spent($rows, $currency)[$month] ?? [];
        $other = 0;
        foreach ($inCurrency as $categoryId => [$minor]) {
            if (! isset($listed[$categoryId])) {
                $other += $minor;
            }
        }

        return [
            'month' => $month,
            'book' => $book,
            'currency' => $currency,
            'days_in_month' => $daysIn,
            'days_left' => $daysLeft,
            'is_current' => $isCurrent,
            'totals' => $this->totals($out, $budgets, $currency, $daysLeft, $to),
            'rows' => $out,
            'other_minor' => $other,
            'unconvertible' => array_keys($this->unconvertible),
        ];
    }

    /**
     * Left, the pace and the state for one budget.
     *
     * @return array<string, mixed>
     */
    public function progress(int $amount, int $spent, int $daysLeft, string $currency): array
    {
        $left = $amount - $spent;
        $ratio = $amount > 0 ? round($spent / $amount, 4) : null;

        return [
            'left_minor' => $left,
            'per_day_minor' => $this->perDay($left, $daysLeft, $currency),
            'ratio' => $ratio,
            'state' => self::state($ratio),
        ];
    }

    public static function state(?float $ratio): ?string
    {
        return match (true) {
            $ratio === null => null,
            $ratio >= 1.0 => 'over',
            $ratio >= self::WARN_AT => 'warn',
            default => 'ok',
        };
    }

    /**
     * What can still go out each day, floored to a whole unit.
     *
     * Floored, never rounded: a pace rounded up tells someone they can spend a
     * taka a day more than they have, and over a month that is the overrun.
     * A past month has no days left, so no pace at all.
     */
    private function perDay(int $left, int $daysLeft, string $currency): ?int
    {
        if ($daysLeft <= 0) {
            return null;
        }
        if ($left <= 0) {
            return 0;
        }

        $unit = 10 ** ($this->minorUnit[$currency] ?? 2);

        return intdiv(intdiv($left, $daysLeft), $unit) * $unit;
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  Collection<string, Budget>  $budgets
     * @return array<string, mixed>
     */
    private function totals(array $rows, Collection $budgets, string $currency, int $daysLeft, string $on): array
    {
        $budgeted = 0;
        $spent = 0;
        $count = 0;
        $over = 0;
        // Kept apart, not netted (review round 7, M8): 3,071 taka over in two
        // budgets does not make the other four's 4,141 of room smaller -
        // money over in Dining is not taken back out of Groceries.
        $headroom = 0;
        $overrun = 0;

        foreach ($rows as $row) {
            if ($row['budget'] === null) {
                continue;
            }

            $count++;
            $over += $row['state'] === 'over' ? 1 : 0;

            // A budget kept in another currency is converted into the totals'
            // currency, and so is what it spent - never added as it stands.
            $amount = $this->fx->convert($row['budget']['amount_minor'], $row['budget']['currency'], $currency, $on);
            $used = $this->fx->convert($row['spent_minor'], $row['currency'], $currency, $on);

            if ($amount === null || $used === null) {
                $this->unconvertible[$row['budget']['currency']] = true;

                continue;
            }

            $budgeted += $amount;
            $spent += $used;
            if ($used > $amount) {
                $overrun += $used - $amount;
            } else {
                $headroom += $amount - $used;
            }
        }

        return [
            'budgeted_minor' => $budgeted, 'spent_minor' => $spent, 'count' => $count, 'over' => $over,
            'under' => $count - $over,
            'headroom_minor' => $headroom,
            'overrun_minor' => $overrun,
            // The pace is over the room that is really left, not the net.
            'headroom_per_day_minor' => $count > 0 ? $this->perDay($headroom, $daysLeft, $currency) : null,
        ] + ($count > 0
            ? $this->progress($budgeted, $spent, $daysLeft, $currency)
            : ['left_minor' => null, 'per_day_minor' => null, 'ratio' => null, 'state' => null]);
    }

    /**
     * Expense per month and category, in one currency.
     *
     * @param  Collection<int, Transaction>  $rows
     * @return array<string, array<string, array{0:int,1:int}>>  month => category id ('' for none) => [minor, standing count]
     */
    private function spent(Collection $rows, string $target): array
    {
        if (isset($this->memo[$target])) {
            return $this->memo[$target];
        }

        // A corrected entry leaves the original, its mirror and the
        // replacement. The mirror nets the money; this keeps the original out
        // of the COUNT, so a fixed typo is one entry and not two.
        $reversed = $rows->whereNotNull('reverses_id')->pluck('reverses_id')->flip()->all();

        $out = [];
        foreach ($rows as $row) {
            $day = substr((string) $row->getRawOriginal('occurred_on'), 0, 10);
            $snapshot = ($this->accountCurrency[$row->account_id] ?? null) === $target
                && $row->getRawOriginal('fx_rate') !== null
                ? (string) $row->getRawOriginal('fx_rate')
                : null;

            $value = $this->fx->convert((int) $row->amount_minor, (string) $row->currency, $target, $day, $snapshot);

            if ($value === null) {
                $this->unconvertible[(string) $row->currency] = true;

                continue;
            }

            $month = substr($day, 0, 7);
            $key = (string) ($row->category_id ?? '');
            $mirror = $row->reverses_id !== null;

            $out[$month][$key][0] = ($out[$month][$key][0] ?? 0) + ReversalChain::sign($row->reverses_id) * $value;
            $out[$month][$key][1] = ($out[$month][$key][1] ?? 0) + ($mirror || isset($reversed[$row->id]) ? 0 : 1);
        }

        return $this->memo[$target] = $out;
    }

    /**
     * Up to a round figure: ৳7,340 → ৳7,500, ৳830 → ৳850, ৳45,000 stays.
     *
     * Two significant figures with a step of five, because a suggested
     * budget of ৳7,341 reads as a computer's number, and a person accepts a
     * round one with a single tap.
     */
    private function roundUp(int $minor, string $currency): int
    {
        if ($minor <= 0) {
            return 0;
        }

        $unit = 10 ** ($this->minorUnit[$currency] ?? 2);
        $whole = (int) ceil($minor / $unit);
        $digits = strlen((string) $whole);
        $step = $digits <= 2 ? 5 : 5 * 10 ** ($digits - 2);

        return (int) (ceil($whole / $step) * $step) * $unit;
    }

    private function begin(User $user): void
    {
        $this->fx = new Converter((string) $user->id);
        $this->memo = [];
        $this->unconvertible = [];
        $this->accountCurrency = DB::table('accounts')
            ->where('user_id', $user->id)->pluck('currency', 'id')->all();
        $this->minorUnit = DB::table('currencies')->pluck('minor_unit', 'code')
            ->map(fn ($v): int => (int) $v)->all();
    }
}
