<?php

namespace Hisab\Ledger\Services;

use Illuminate\Support\Facades\DB;

/**
 * The sign a row contributes to any total, from its place in a chain of
 * reversals.
 *
 * An entry adds. Its mirror (the reversal) subtracts. The mirror of that
 * mirror - LedgerWriter::reverse() allows it, as the way a wrong correction
 * is undone - adds again. Signing every mirror -1, as the month cockpit,
 * budgets and goals did, took the undone amount off a second time.
 *
 * One row at a time and cached per step, because every caller loads its rows
 * differently and reversals are rare: most rows are answered without a query.
 * BalanceSheet walks whole sets and keeps its own batched version.
 */
final class ReversalChain
{
    /** @var array<string, string|null> id => reverses_id, as read. */
    private static array $parent = [];

    public static function sign(?string $reversesId): int
    {
        if ($reversesId === null) {
            return 1;
        }

        $depth = 1;
        for ($at = $reversesId, $i = 0; $i < 32; $i++) {
            $at = self::parentOf($at);
            if ($at === null) {
                break;
            }
            $depth++;
        }

        return $depth % 2 === 0 ? 1 : -1;
    }

    /**
     * The leg of a deposit that counts: the one taking money out of the
     * spendable account, which a reversal flips.
     */
    public static function countsDepositLeg(string $direction, ?string $reversesId): bool
    {
        return $direction === (self::sign($reversesId) === 1 ? 'out' : 'in');
    }

    private static function parentOf(string $id): ?string
    {
        if (! array_key_exists($id, self::$parent)) {
            $parent = DB::table('transactions')->where('id', $id)->value('reverses_id');
            self::$parent[$id] = $parent === null ? null : (string) $parent;
        }

        return self::$parent[$id];
    }
}
