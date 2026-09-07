<?php

namespace Hisab\Fx\Services;

use Hisab\Fx\Models\FxRate;
use Illuminate\Support\Collection;

/**
 * Reading and writing rates.
 *
 * The one rule worth stating: for any pair there may be both a seeded estimate
 * and a rate the owner entered, and the owner's always wins. That choice is
 * made here, once, rather than in the controller and again in whatever reads
 * rates next.
 */
class RateBook
{
    /**
     * The current rate for every pair this owner can see: their own where they
     * have one, the seeded estimate otherwise.
     *
     * @return Collection<int, FxRate>
     */
    public function current(?string $userId): Collection
    {
        $rows = FxRate::query()
            ->visibleTo($userId)
            // Ordering decides which row survives the reduce below, so it is
            // load-bearing rather than cosmetic: newest date first, and within
            // the same date the owner's row ahead of the seed.
            ->orderByDesc('as_of')
            ->orderByRaw('user_id IS NULL')
            ->get();

        return $rows
            ->groupBy(fn (FxRate $r): string => $r->base.'/'.$r->quote)
            ->map(fn (Collection $forPair): FxRate => $this->preferred($forPair))
            ->values();
    }

    /**
     * @param  Collection<int, FxRate>  $forPair
     */
    private function preferred(Collection $forPair): FxRate
    {
        // The owner's most recent rate, whatever its date, beats a seed that
        // happens to carry a later one. A seed is an estimate shipped with the
        // install; a manual row is the rate they actually got, and a newer
        // guess should not displace an older fact.
        return $forPair->firstWhere(fn (FxRate $r): bool => $r->user_id !== null)
            ?? $forPair->first();
    }

    /**
     * Record a rate the owner entered.
     *
     * Writing the same pair and date twice updates that row rather than adding
     * a second: two rates for one pair on one day are not history, they are a
     * correction, and keeping both leaves the reader to guess which was meant.
     */
    public function record(string $userId, string $base, string $quote, string $rate, string $asOf): FxRate
    {
        return FxRate::query()->updateOrCreate(
            [
                'user_id' => $userId,
                'base' => $base,
                'quote' => $quote,
                'as_of' => $asOf,
            ],
            [
                'rate' => $rate,
                'source' => 'manual',
            ],
        );
    }
}
