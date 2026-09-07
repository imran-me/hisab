<?php

namespace Hisab\Fx\Seeders;

use Hisab\Fx\Models\Currency;
use Hisab\Fx\Models\FxRate;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Currencies and the starting rates.
 *
 * READS modules/fx/data/rates.json - the same file the frontend fetches - rather
 * than carrying its own copy of the list. CONVENTIONS.md: rules live in data,
 * and one source of truth per rule. Two lists of currencies would disagree
 * about a minor_unit eventually, and the symptom would be a Kuwaiti figure off
 * by a factor of ten on one side of the seam only.
 *
 * Idempotent: safe to run on every deploy.
 */
class FxSeeder extends Seeder
{
    public function run(): void
    {
        $path = __DIR__.'/../../data/rates.json';

        if (! is_file($path)) {
            // Loud, not silent. An empty currencies table means every amount in
            // the product loses the minor_unit it depends on.
            throw new RuntimeException("FX seed data missing at {$path}");
        }

        $seed = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        $this->seedCurrencies($seed['currencies'] ?? []);
        $this->seedRates($seed['rates'] ?? []);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function seedCurrencies(array $rows): void
    {
        foreach ($rows as $i => $row) {
            Currency::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'symbol' => $row['symbol'],
                    // No ?? 2 fallback. A currency row that quietly assumes two
                    // decimal places is the exact bug this column exists to
                    // prevent, so a seed row missing it should fail here rather
                    // than be wrong in every figure later.
                    'minor_unit' => $row['minor_unit'],
                    'symbol_first' => $row['symbol_first'] ?? true,
                    'group' => $row['group'] ?? null,
                    'sort_order' => $i,
                ],
            );
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function seedRates(array $rows): void
    {
        foreach ($rows as $row) {
            // updateOrCreate rather than upsert(), because the unique index
            // CANNOT enforce this for seeded rows: user_id is null on all of
            // them, and MySQL treats NULLs as distinct in a unique index, so
            // (null, 'USD', 'BDT', '2026-09-01') does not collide with itself.
            // The uniqueness that matters here is therefore done by the query,
            // and the index earns its keep on the owner's own rows and as the
            // read path's index.
            FxRate::query()->updateOrCreate(
                [
                    'user_id' => null,
                    'base' => $row['base'],
                    'quote' => $row['quote'],
                    'as_of' => $row['as_of'],
                ],
                [
                    'rate' => $row['rate'],
                    'source' => 'seed',
                ],
            );
        }
    }
}
