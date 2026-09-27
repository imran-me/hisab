<?php

namespace Hisab\Fx\Services;

use Hisab\Fx\Models\Currency;
use Hisab\Fx\Models\FxRate;
use Illuminate\Support\Collection;

/**
 * Converting an amount in minor units from one currency to another, on the
 * server.
 *
 * WHY THIS EXISTS. A month's total over rows in two currencies cannot be a sum
 * of their amount_minor: USD 450.00 is 45000 cents and adding it to poisha
 * counts $450 as ৳450, about a 120th of what it is. The frontend has always
 * converted row by row (money.js convertAndSum); the server summed. This is the
 * server's half, so a figure computed on the server can be converted before it
 * is added, never after.
 *
 * WHICH RATE, in order:
 *   1. the row's own snapshot, when the caller has one for exactly this pair -
 *      it is the rate the money actually moved at;
 *   2. the owner's own rate for the pair, else the seeded estimate (the
 *      RateBook rule: an entered rate beats a shipped guess);
 *   3. within that, the latest rate dated on or before the day, else the
 *      earliest one after it - a payout in August converts at the first rate
 *      on file rather than not at all;
 *   4. the inverse pair, when only that one is on file.
 * No rate at all is NOT treated as 1. convert() returns null and the caller
 * reports the currency as left out, the same contract as convertAndSum().
 *
 * ARITHMETIC. bcmath, on the decimal string the database holds. A rate is
 * stored as DECIMAL(24,10) precisely so it never passes through a float, and
 * minor × rate × 10^k overflows a 64-bit integer for a large enough balance.
 * Rounded once, half away from zero, so an expense and its refund convert to
 * the same size - the same rule as money.js convert().
 */
class Converter
{
    private const SCALE = 12;

    /** @var array<string, int> code => minor_unit */
    private array $minor;

    /** @var Collection<string, Collection<int, FxRate>> "BASE/QUOTE" => rates, oldest first */
    private Collection $pairs;

    /** @var array<string, ?string> memo of rate lookups */
    private array $memo = [];

    public function __construct(?string $userId)
    {
        $this->minor = Currency::query()->pluck('minor_unit', 'code')->map(fn ($v): int => (int) $v)->all();

        $rows = FxRate::query()->visibleTo($userId)->orderBy('as_of')->get(['user_id', 'base', 'quote', 'rate', 'as_of']);

        // Owner rows shadow the seed for a whole pair (RateBook::preferred):
        // once someone has entered the rate they actually got, a shipped
        // estimate is not a better answer for any date.
        $this->pairs = $rows
            ->groupBy(fn (FxRate $r): string => $r->base.'/'.$r->quote)
            ->map(function (Collection $forPair): Collection {
                $own = $forPair->filter(fn (FxRate $r): bool => $r->user_id !== null);

                return ($own->isNotEmpty() ? $own : $forPair)->values();
            });
    }

    /**
     * @param  string|null  $snapshot  a rate snapshotted for exactly $from → $to
     */
    public function convert(int $minor, string $from, string $to, ?string $on = null, ?string $snapshot = null): ?int
    {
        if ($from === $to) {
            return $minor;
        }

        $rate = ($snapshot !== null && bccomp($snapshot, '0', self::SCALE) > 0)
            ? $snapshot
            : $this->rate($from, $to, $on);

        if ($rate === null) {
            return null;
        }

        $shift = ($this->minor[$to] ?? 2) - ($this->minor[$from] ?? 2);
        $scaled = bcmul((string) $minor, $rate, self::SCALE);
        $scaled = $shift >= 0
            ? bcmul($scaled, bcpow('10', (string) $shift), self::SCALE)
            : bcdiv($scaled, bcpow('10', (string) -$shift), self::SCALE);

        return $this->round($scaled);
    }

    /** The rate from → to on a day, as a decimal string, or null. */
    public function rate(string $from, string $to, ?string $on = null): ?string
    {
        $key = "{$from}/{$to}@{$on}";

        return $this->memo[$key] ??= $this->pick("{$from}/{$to}", $on)
            ?? $this->inverse($this->pick("{$to}/{$from}", $on));
    }

    private function pick(string $pair, ?string $on): ?string
    {
        $rates = $this->pairs->get($pair);
        if ($rates === null || $rates->isEmpty()) {
            return null;
        }

        if ($on === null) {
            return (string) $rates->last()->getRawOriginal('rate');
        }

        $before = $rates->filter(fn (FxRate $r): bool => $r->as_of <= $on)->last();

        return (string) ($before ?? $rates->first())->getRawOriginal('rate');
    }

    private function inverse(?string $rate): ?string
    {
        if ($rate === null || bccomp($rate, '0', self::SCALE) <= 0) {
            return null;
        }

        return bcdiv('1', $rate, self::SCALE);
    }

    /** Half away from zero, to a whole minor unit. */
    private function round(string $value): int
    {
        $half = str_starts_with($value, '-') ? '-0.5' : '0.5';

        return (int) bcadd($value, $half, 0);
    }
}
