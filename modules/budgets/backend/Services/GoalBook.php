<?php

namespace Hisab\Budgets\Services;

use Hisab\Ledger\Services\ReversalChain;
use App\Models\User;
use Hisab\Budgets\Models\Goal;
use Hisab\Fx\Services\Converter;
use Hisab\Ledger\Services\BalanceSheet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * How far along each goal is, read from the ledger.
 *
 *   linked to an account   the account's derived balance (a DPS, an FDR)
 *   linked to a category   deposits filed under it since the goal began,
 *                          counted once on the out leg, a mirror subtracting
 *
 * Then the arithmetic a person asks of a goal: what is left, what it needs a
 * month to land on its date, what has actually gone in a month lately, and
 * - at that rate - when it will be reached.
 */
class GoalBook
{
    /** Months of history the "lately" rate is taken over. */
    private const RECENT = 3;

    public function __construct(private readonly BalanceSheet $sheet)
    {
    }

    /** @return array<string, mixed> */
    public function all(User $user): array
    {
        $goals = Goal::query()->where('user_id', $user->id)->orderBy('created_at')->get();
        $balances = $this->sheet->balances($user);
        $fx = new Converter((string) $user->id);
        $accounts = DB::table('accounts')->where('user_id', $user->id)->get(['id', 'name', 'currency', 'type', 'institution'])->keyBy('id');
        $today = Carbon::now()->toDateString();

        $rows = $goals->map(fn (Goal $g): array => $this->shape($user, $g, $balances, $accounts, $fx, $today))->all();

        return [
            'goals' => $rows,
            'saved_minor' => array_sum(array_column($rows, 'saved_minor')),
            'target_minor' => array_sum(array_column($rows, 'target_minor')),
        ];
    }

    /** @return array<string, mixed> */
    public function one(User $user, Goal $goal): array
    {
        $accounts = DB::table('accounts')->where('user_id', $user->id)->get(['id', 'name', 'currency', 'type', 'institution'])->keyBy('id');

        return $this->shape($user, $goal, $this->sheet->balances($user), $accounts, new Converter((string) $user->id), Carbon::now()->toDateString());
    }

    /**
     * @param  array<string, int>  $balances
     * @return array<string, mixed>
     */
    private function shape(User $user, Goal $g, array $balances, Collection $accounts, Converter $fx, string $today): array
    {
        [$saved, $monthly] = $this->progress($user, $g, $balances, $accounts, $fx, $today);
        $target = $g->target_minor;
        $left = max(0, $target - $saved);
        $ratio = $target > 0 ? round($saved / $target, 4) : 0.0;

        // What it needs each month to land on its date: whole months left,
        // this one included, at least one.
        $monthsLeft = null;
        $needed = null;
        if ($g->target_on !== null && $left > 0) {
            $monthsLeft = max(1, (int) Carbon::parse($today)->startOfMonth()->diffInMonths(Carbon::parse($g->target_on)->startOfMonth()) + 1);
            if ($g->target_on < $today) {
                $monthsLeft = 0;
            }
            $needed = $monthsLeft > 0 ? (int) ceil($left / $monthsLeft) : $left;
        }

        // At the recent rate, the month it would be reached.
        $eta = null;
        if ($left > 0 && $monthly > 0) {
            $eta = Carbon::parse($today)->startOfMonth()->addMonths((int) ceil($left / $monthly) - 1)->format('Y-m');
        }

        $state = match (true) {
            $left === 0 => 'achieved',
            $g->account_id === null && $g->category_id === null => 'unlinked',
            $g->target_on === null => 'no_date',
            $needed !== null && $monthly >= $needed => 'on_track',
            default => 'behind',
        };

        $account = $g->account_id ? ($accounts[$g->account_id] ?? null) : null;

        return [
            'id' => $g->id,
            'name' => $g->name,
            'icon' => $g->icon,
            'currency' => $g->currency,
            'target_minor' => $target,
            'target_on' => $g->target_on,
            'started_on' => $g->started_on,
            'account' => $account ? ['id' => $account->id, 'name' => $account->name, 'type' => $account->type, 'institution' => $account->institution, 'currency' => $account->currency] : null,
            'category_id' => $g->category_id,
            'saved_minor' => $saved,
            'left_minor' => $left,
            'ratio' => $ratio,
            'months_left' => $monthsLeft,
            'needed_per_month_minor' => $needed,
            'recent_per_month_minor' => $monthly,
            'eta' => $eta,
            'state' => $state,
        ];
    }

    /**
     * What is saved, and the average that went in a month over the last
     * three whole months (the current one excluded, so the 3rd of the month
     * does not read as a collapse).
     *
     * @return array{0:int, 1:int}
     */
    private function progress(User $user, Goal $g, array $balances, Collection $accounts, Converter $fx, string $today): array
    {
        $recentFrom = Carbon::parse($today)->startOfMonth()->subMonths(self::RECENT)->toDateString();
        $recentTo = Carbon::parse($today)->startOfMonth()->subDay()->toDateString();
        $in = fn (int $minor, string $from, string $on): int => $fx->convert($minor, $from, $g->currency, $on) ?? 0;

        if ($g->account_id !== null && isset($accounts[$g->account_id])) {
            $account = $accounts[$g->account_id];
            $saved = $in($balances[$g->account_id] ?? 0, $account->currency, $today);

            // What moved into the account lately, net of what left it.
            $net = DB::table('transactions')
                ->where('user_id', $user->id)->where('account_id', $g->account_id)
                ->whereBetween('occurred_on', [$recentFrom, $recentTo])
                ->where('currency', $account->currency)
                ->selectRaw("SUM(CASE WHEN direction = 'in' THEN amount_minor ELSE -amount_minor END) AS net")
                ->value('net');

            return [max(0, $saved), max(0, intdiv($in((int) $net, $account->currency, $today), self::RECENT))];
        }

        if ($g->category_id !== null) {
            // A deposit counts once, on its out leg; a reversal's mirror is
            // the in leg and subtracts - the ledger summary's rule.
            $legs = DB::table('transactions')
                ->where('user_id', $user->id)->where('category_id', $g->category_id)
                ->where('type', 'deposit')->where('occurred_on', '>=', $g->started_on)
                ->get(['direction', 'reverses_id', 'amount_minor', 'currency', 'occurred_on']);

            $saved = 0;
            $recent = 0;
            foreach ($legs as $leg) {
                $counted = ReversalChain::countsDepositLeg((string) $leg->direction, $leg->reverses_id);
                if (! $counted) {
                    continue;
                }
                $value = $in((int) $leg->amount_minor, (string) $leg->currency, substr((string) $leg->occurred_on, 0, 10));
                $value = ReversalChain::sign($leg->reverses_id) * $value;
                $saved += $value;
                if ($leg->occurred_on >= $recentFrom && $leg->occurred_on <= $recentTo) {
                    $recent += $value;
                }
            }

            return [max(0, $saved), max(0, intdiv($recent, self::RECENT))];
        }

        return [0, 0];
    }
}
