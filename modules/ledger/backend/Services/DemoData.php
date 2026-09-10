<?php

namespace Hisab\Ledger\Services;

use App\Models\User;
use Hisab\Ledger\Models\Transaction;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Demo data: generating it, and removing exactly what was generated.
 *
 * A SERVICE and not a console command, though it started as one. The moment
 * Settings grew a button for this, the controller was calling Artisan to run a
 * command - booting the console application inside an HTTP request, and finding
 * the command was not even registered there, because it was registered only
 * when runningInConsole(). CONVENTIONS.md already had the answer: every rule
 * lives in a Service, and the controller and the command are two callers of it.
 *
 * WHAT IT COVERS, and why each piece is here rather than being more of the same:
 *
 *   personal book   income, expense, deposit and transfer over several months
 *   business book   its own accounts and categories, so profit means something
 *   foreign currency a dollar payout, AND a dollar charge against a taka
 *                   account - only the second exercises the rate snapshot
 *   investments     a share purchase, which is a deposit and not an expense
 *   a correction    one entry recorded wrong and reversed, so the History view
 *                   has something in it
 */
class DemoData
{
    public function __construct(private readonly LedgerWriter $writer)
    {
    }

    public static function purge(User $owner): array
    {
        return DB::transaction(function () use ($owner): array {
            $demo = Transaction::query()->where('user_id', $owner->id)->where('is_demo', true);
            $count = (clone $demo)->count();

            // Reversals point at the rows they cancel, so those go first or the
            // foreign key refuses.
            (clone $demo)->whereNotNull('reverses_id')->delete();
            (clone $demo)->delete();

            // Demo accounts can only go once nothing points at them. A real
            // entry posted to a demo account keeps it alive, deliberately -
            // deleting it would orphan money the person actually recorded.
            $accounts = DB::table('accounts')
                ->where('user_id', $owner->id)->where('is_demo', true)
                ->whereNotExists(function ($q): void {
                    $q->selectRaw('1')->from('transactions')
                        ->whereColumn('transactions.account_id', 'accounts.id');
                })
                ->delete();

            return ['transactions' => $count, 'accounts' => $accounts];
        });
    }

    public function generate(User $owner, int $months = 3): int
    {
        $accounts = DB::table('accounts')
            ->where('user_id', $owner->id)->whereNull('archived_at')
            ->get()->keyBy(fn ($a): string => $a->name);

        $cash = $accounts['Cash in hand'] ?? $accounts->first();
        $bkash = $accounts['bKash'] ?? $cash;
        $bank = $accounts['Bank account'] ?? $cash;
        $dps = $accounts['DPS'] ?? null;

        if ($cash === null) {
            throw new RuntimeException('No accounts to post against. Run `php artisan db:seed` first.');
        }

        $categories = DB::table('categories')
            ->where('user_id', $owner->id)->where('book', 'personal')
            ->get()->keyBy(fn ($c): string => $c->type.':'.$c->key);

        $cat = fn (string $key): ?string => $categories[$key]->id ?? null;

        $made = 0;
        $start = Carbon::now()->startOfMonth()->subMonths($months - 1);


        for ($m = 0; $m < $months; $m++) {
            $month = $start->copy()->addMonths($m);
            // Never generate into the future: an entry dated next week shows up
            // in "this month" and quietly inflates a total nobody has spent yet.
            // The current month stops at today; earlier months run their length.
            $lastDay = $month->isSameMonth(Carbon::now()) ? Carbon::now()->day : $month->daysInMonth;

            // --- salary, into the bank on the 1st
            $made += $this->post($owner, [
                'type' => 'income', 'account_id' => $bank->id,
                'amount_minor' => 85_000_00 + random_int(0, 5_000) * 100,
                'currency' => 'BDT', 'category_id' => $cat('income:salary'),
                'method' => 'bank', 'payee' => 'Monthly salary',
                'occurred_on' => $month->copy()->day(1)->toDateString(),
            ]);

            // --- rent, on the 3rd
            if ($lastDay >= 3) {
                $made += $this->post($owner, [
                    'type' => 'expense', 'account_id' => $bank->id,
                    'amount_minor' => 18_000_00, 'currency' => 'BDT',
                    'category_id' => $cat('expense:rent'), 'method' => 'bank',
                    'payee' => 'House rent',
                    'occurred_on' => $month->copy()->day(3)->toDateString(),
                ]);
            }

            // --- the weekly shop
            for ($day = 6; $day <= $lastDay; $day += 7) {
                $made += $this->post($owner, [
                    'type' => 'expense', 'account_id' => $bkash->id,
                    'amount_minor' => random_int(1_800, 4_600) * 100,
                    'currency' => 'BDT', 'category_id' => $cat('expense:groceries'),
                    'method' => 'bkash',
                    'payee' => ['Shwapno', 'Agora', 'Meena Bazar', 'local bazar'][intdiv($day, 7) % 4],
                    'occurred_on' => $month->copy()->day($day)->toDateString(),
                ]);
            }

            // --- transport, a few times a week, in cash
            for ($day = 2; $day <= $lastDay; $day += 3) {
                $made += $this->post($owner, [
                    'type' => 'expense', 'account_id' => $cash->id,
                    'amount_minor' => random_int(60, 480) * 100,
                    'currency' => 'BDT', 'category_id' => $cat('expense:transport'),
                    'method' => 'cash', 'payee' => random_int(0, 1) ? 'CNG' : 'Uber',
                    'occurred_on' => $month->copy()->day($day)->toDateString(),
                ]);
            }

            // --- the monthly bills
            foreach ([
                ['expense:internet', 1_200_00, 'Internet', 10],
                ['expense:utilities', random_int(1_400, 2_600) * 100, 'Electricity & gas', 12],
                ['expense:subscriptions', 550_00, 'Subscriptions', 15],
            ] as [$key, $amount, $payee, $day]) {
                if ($day > $lastDay) {
                    continue;
                }
                $made += $this->post($owner, [
                    'type' => 'expense', 'account_id' => $bkash->id,
                    'amount_minor' => $amount, 'currency' => 'BDT',
                    'category_id' => $cat($key), 'method' => 'bkash', 'payee' => $payee,
                    'occurred_on' => $month->copy()->day($day)->toDateString(),
                ]);
            }

            // --- eating out, twice
            foreach ([9, 22] as $day) {
                if ($day > $lastDay) {
                    continue;
                }
                $made += $this->post($owner, [
                    'type' => 'expense', 'account_id' => $cash->id,
                    'amount_minor' => random_int(600, 2_400) * 100,
                    'currency' => 'BDT', 'category_id' => $cat('expense:dining'),
                    'method' => 'cash', 'payee' => 'Dinner out',
                    'occurred_on' => $month->copy()->day($day)->toDateString(),
                ]);
            }

            // --- one larger, irregular thing
            $extras = [
                ['expense:health', random_int(800, 3_500), 'Pharmacy'],
                ['expense:clothing', random_int(1_500, 5_000), 'Clothes'],
                ['expense:gadgets', random_int(2_000, 9_000), 'Accessories'],
                ['expense:family', random_int(3_000, 8_000), 'Family support'],
                ['expense:charity', random_int(1_000, 5_000), 'Zakat'],
            ];
            [$key, $taka, $payee] = $extras[$m % count($extras)];
            if ($lastDay >= 18) {
                $made += $this->post($owner, [
                    'type' => 'expense', 'account_id' => $bank->id,
                    'amount_minor' => $taka * 100, 'currency' => 'BDT',
                    'category_id' => $cat($key), 'method' => 'card', 'payee' => $payee,
                    'occurred_on' => $month->copy()->day(18)->toDateString(),
                ]);
            }

            // --- moving money into savings. A DEPOSIT, not an expense: it
            //     leaves what can be spent without being spending, which is the
            //     distinction the whole app is built around.
            if ($dps !== null && $lastDay >= 5) {
                $made += $this->post($owner, [
                    'type' => 'deposit', 'account_id' => $bank->id,
                    'to_account_id' => $dps->id,
                    'amount_minor' => 5_000_00, 'currency' => 'BDT',
                    'category_id' => $cat('deposit:dps'), 'method' => 'bank',
                    'payee' => 'DPS instalment',
                    'occurred_on' => $month->copy()->day(5)->toDateString(),
                ]);
            }

            // --- topping up the wallet.
            //
            // Not decoration. Groceries and the monthly bills all come out of
            // bKash, and with nothing going in the wallet ends the quarter at
            // minus thirty thousand taka - a balance no mobile wallet can hold,
            // which makes the whole screen look broken rather than empty.
            if ($lastDay >= 4) {
                $made += $this->post($owner, [
                    'type' => 'transfer', 'account_id' => $bank->id,
                    'to_account_id' => $bkash->id,
                    'amount_minor' => 15_000_00, 'currency' => 'BDT',
                    'method' => 'bank', 'payee' => 'Top up bKash',
                    'occurred_on' => $month->copy()->day(4)->toDateString(),
                ]);
            }

            // --- cash out of the bank, so a transfer appears in the ledger
            if ($lastDay >= 7) {
                $made += $this->post($owner, [
                    'type' => 'transfer', 'account_id' => $bank->id,
                    'to_account_id' => $cash->id,
                    'amount_minor' => 10_000_00, 'currency' => 'BDT',
                    'method' => 'bank', 'payee' => 'ATM withdrawal',
                    'occurred_on' => $month->copy()->day(7)->toDateString(),
                ]);
            }
        }

        $made += $this->business($owner, $months);
        $made += $this->foreignCurrency($owner);
        $made += $this->investment($owner);
        $made += $this->aCorrection($owner);

        return $made;
    }


    /**
     * The business book.
     *
     * A separate book, with its own accounts, because CONVENTIONS.md keeps the
     * two apart: a household grocery bill has no business being inside a profit
     * figure. Without this the Business screen has nothing to show and the
     * book switch does nothing visible.
     */
    private function business(User $owner, int $months): int
    {
        $account = $this->demoAccount($owner, [
            'name' => 'Business current a/c',
            'type' => 'bank',
            'currency' => 'BDT',
            'book' => 'business',
            'institution' => 'BRAC Bank',
        ]);

        $categories = $this->categories($owner, 'business');
        $made = 0;
        $start = Carbon::now()->startOfMonth()->subMonths($months - 1);

        for ($m = 0; $m < $months; $m++) {
            $month = $start->copy()->addMonths($m);
            $lastDay = $month->isSameMonth(Carbon::now()) ? Carbon::now()->day : $month->daysInMonth;

            foreach ([
                ['income', 'income:sales', random_int(120_000, 260_000), 'Client invoice', 2],
                ['expense', 'expense:cogs', random_int(40_000, 90_000), 'Stock purchase', 6],
                ['expense', 'expense:salaries', 45_000, 'Staff salaries', 8],
                ['expense', 'expense:office-rent', 22_000, 'Office rent', 8],
                ['expense', 'expense:marketing', random_int(4_000, 15_000), 'Ads', 14],
                ['expense', 'expense:software', 3_500, 'Software & tools', 16],
            ] as [$type, $key, $taka, $payee, $day]) {
                if ($day > $lastDay) {
                    continue;
                }

                $made += $this->post($owner, [
                    'type' => $type,
                    'account_id' => $account->id,
                    'amount_minor' => $taka * 100,
                    'currency' => 'BDT',
                    'category_id' => $categories[$key]->id ?? null,
                    'method' => 'bank',
                    'payee' => $payee,
                    'occurred_on' => $month->copy()->day($day)->toDateString(),
                    'book' => 'business',
                ]);
            }
        }

        return $made;
    }

    /**
     * One payment in another currency.
     *
     * The single most load-bearing thing in the money model is that an amount
     * is an integer in ITS OWN currency, converted through a snapshotted rate -
     * and with a BDT-only ledger none of that machinery is ever exercised or
     * visible. A dollar invoice into a dollar account is what makes the
     * converted roll-up on the Overview mean something.
     */
    private function foreignCurrency(User $owner): int
    {
        $usd = $this->demoAccount($owner, [
            'name' => 'Payoneer (USD)',
            'type' => 'wallet',
            'currency' => 'USD',
            'book' => 'personal',
            'institution' => 'Payoneer',
        ]);

        $categories = $this->categories($owner, 'personal');

        // The rate is read from the fx table rather than invented, so the
        // snapshot on the row is a rate the app actually holds.
        $rate = DB::table('fx_rates')
            ->where('base', 'USD')->where('quote', 'BDT')
            ->orderByDesc('as_of')->first();

        $made = 0;

        foreach ([[1, 450], [2, 620]] as [$monthsAgo, $dollars]) {
            $made += $this->post($owner, [
                'type' => 'income',
                'account_id' => $usd->id,
                'amount_minor' => $dollars * 100,
                'currency' => 'USD',
                'category_id' => $categories['income:freelance']->id ?? null,
                'method' => 'other',
                'payee' => 'Upwork payout',
                'fx_rate_id' => $rate->id ?? null,
                'occurred_on' => Carbon::now()->subMonths($monthsAgo)->day(20)->toDateString(),
            ]);
        }

        // A charge in a currency the ACCOUNT does not hold.
        //
        // The two payouts above need no conversion - dollars into a dollar
        // account - so they never touch the snapshot machinery. This does: a
        // dollar subscription paid from a taka account has to record the rate
        // it was converted at, at the moment it was saved, or next year's
        // report re-converts last year's spending at today's rate and quietly
        // rewrites history.
        $bank = DB::table('accounts')
            ->where('user_id', $owner->id)->where('name', 'Bank account')->first();

        if ($bank !== null && $rate !== null) {
            $made += $this->post($owner, [
                'type' => 'expense',
                'account_id' => $bank->id,
                'amount_minor' => 12_99,
                'currency' => 'USD',
                'category_id' => $categories['expense:subscriptions']->id ?? null,
                'method' => 'card',
                'payee' => 'Cloud hosting',
                'fx_rate_id' => $rate->id,
                'occurred_on' => Carbon::now()->subDays(12)->toDateString(),
            ]);
        }

        return $made;
    }

    /** Shares, so the Investments section and the "held" split have content. */
    private function investment(User $owner): int
    {
        $broker = $this->demoAccount($owner, [
            'name' => 'Brokerage (DSE)',
            'type' => 'investment',
            'currency' => 'BDT',
            'book' => 'personal',
            'institution' => 'LankaBangla',
        ]);

        $bank = DB::table('accounts')
            ->where('user_id', $owner->id)->where('name', 'Bank account')->first();

        if ($bank === null) {
            return 0;
        }

        $categories = $this->categories($owner, 'personal');

        // A DEPOSIT, not an expense. Money into shares leaves what can be spent
        // without being spending - the distinction the whole app is built on.
        return $this->post($owner, [
            'type' => 'deposit',
            'account_id' => $bank->id,
            'to_account_id' => $broker->id,
            'amount_minor' => 25_000_00,
            'currency' => 'BDT',
            'category_id' => $categories['deposit:shares']->id ?? null,
            'method' => 'bank',
            'payee' => 'Share purchase',
            'occurred_on' => Carbon::now()->subMonths(1)->day(11)->toDateString(),
        ]);
    }

    /**
     * One entry recorded wrong and then corrected.
     *
     * Included on purpose: the reversal trail is the part of this app that is
     * hardest to picture from a description, and with a ledger of only clean
     * entries the History toggle shows nothing and looks broken.
     */
    private function aCorrection(User $owner): int
    {
        $cash = DB::table('accounts')
            ->where('user_id', $owner->id)->where('name', 'Cash in hand')->first();

        if ($cash === null) {
            return 0;
        }

        $categories = $this->categories($owner, 'personal');

        $legs = $this->writer->create($owner, [
            'type' => 'expense',
            'account_id' => $cash->id,
            // The classic: a missing decimal point, entered as ten times what
            // it should be.
            'amount_minor' => 12_500_00,
            'currency' => 'BDT',
            'category_id' => $categories['expense:dining']->id ?? null,
            'method' => 'cash',
            'payee' => 'Lunch',
            'occurred_on' => Carbon::now()->subDays(9)->toDateString(),
            'is_demo' => true,
        ]);

        $corrected = $this->writer->correct(
            $owner,
            $legs->first(),
            ['amount_minor' => 1_250_00, 'is_demo' => true],
            'Amount entered ten times over',
        );

        return $legs->count() + $corrected->count() + 1;   // original + replacement + mirror
    }

    /** An account the purge can remove, created only if it is not already there. */
    private function demoAccount(User $owner, array $attributes): object
    {
        $existing = DB::table('accounts')
            ->where('user_id', $owner->id)->where('name', $attributes['name'])->first();

        if ($existing !== null) {
            return $existing;
        }

        $id = strtoupper((string) Str::ulid());

        DB::table('accounts')->insert($attributes + [
            'id' => $id,
            'user_id' => $owner->id,
            'opening_balance_minor' => 0,
            'is_default' => false,
            'is_demo' => true,
            'sort_order' => 90,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        return DB::table('accounts')->where('id', $id)->first();
    }

    /** @return \Illuminate\Support\Collection<string, object> */
    private function categories(User $owner, string $book)
    {
        return DB::table('categories')
            ->where('user_id', $owner->id)->where('book', $book)
            ->get()->keyBy(fn ($c): string => $c->type.':'.$c->key);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function post(User $owner, array $data): int
    {
        // Every generated leg carries the mark, so the purge can be exact.
        $legs = $this->writer->create($owner, $data + ['is_demo' => true]);

        // Legs, not entries: a transfer is two rows and both are real.
        return $legs->count();
    }
}
