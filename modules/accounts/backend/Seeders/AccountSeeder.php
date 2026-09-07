<?php

namespace Hisab\Accounts\Seeders;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * The starting accounts, so the app opens on something usable rather than on an
 * empty screen with a form.
 *
 * Reads modules/accounts/data/seed.json - the same file the frontend fetches.
 *
 * Opening balances are ZERO in that file, and the comment there explains why: a
 * made-up balance is worse than no balance, because it is a number that looks
 * real. Nothing here invents one either.
 */
class AccountSeeder extends Seeder
{
    public function run(): void
    {
        User::query()->each(fn (User $user) => self::seedFor($user));
    }

    /**
     * @param  array<string, mixed>|null  $seed
     */
    public static function seedFor(User $user, ?array $seed = null): void
    {
        $path = __DIR__.'/../../data/seed.json';

        if ($seed === null) {
            if (! is_file($path)) {
                throw new RuntimeException("Account seed data missing at {$path}");
            }
            $seed = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        }

        foreach (($seed['accounts'] ?? []) as $i => $row) {
            // The currency has to exist before an account can reference it -
            // there is a foreign key. Skipping rather than failing, because a
            // seed listing a currency this install does not carry is a reason to
            // leave that one account out, not to abandon the whole seeding.
            $currencyExists = $user->getConnection()
                ->table('currencies')->where('code', $row['currency'])->exists();

            if (! $currencyExists) {
                continue;
            }

            Account::query()->updateOrCreate(
                [
                    'user_id' => $user->id,
                    'book' => $row['book'] ?? 'personal',
                    // Matched on the name, which is what identifies a seeded
                    // account. Renaming one and re-running the seeder therefore
                    // re-creates the original - accepted, because the
                    // alternative is a synthetic key on a row whose whole
                    // purpose is to be edited or deleted on day one.
                    'name' => $row['name'],
                ],
                [
                    'type' => $row['type'],
                    'currency' => $row['currency'],
                    'opening_balance_minor' => $row['opening_balance_minor'] ?? 0,
                    'opening_on' => $row['opening_on'] ?? null,
                    'institution' => $row['institution'] ?? null,
                    'number_tail' => $row['number_tail'] ?? null,
                    'credit_limit_minor' => ($row['type'] ?? null) === 'card' ? ($row['credit_limit_minor'] ?? null) : null,
                    'is_default' => $row['is_default'] ?? false,
                    'sort_order' => $i,
                ],
            );
        }
    }
}
