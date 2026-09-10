<?php

namespace Hisab\Ledger\Commands;

use App\Models\User;
use Hisab\Ledger\Models\Transaction;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Fill the ledger with a few months of plausible entries, so the screens have
 * something to show.
 *
 * WHY THIS NEEDS A REAL PURGE, and why that purge breaks the app's own rule.
 *
 * Entries are immutable: a mistake is corrected by a reversal, never removed.
 * That is right for money someone actually spent, and wrong for data that was
 * invented to look at. Clearing demo entries the ordinary way would write a
 * reversal for every one of them and leave a real ledger buried under hundreds
 * of cancelled rows.
 *
 * So `--clear` DELETES, and it is the only thing in this product that does.
 * That is defensible only because of what it deletes and how loudly it says so:
 * it takes every transaction belonging to the owner, it asks first, and it is a
 * console command rather than anything reachable from the app or the API.
 */
class DemoCommand extends Command
{
    protected $signature = 'hisab:demo
        {--months=3 : How many months back to generate}
        {--clear : Delete every transaction first}
        {--fresh : Delete every transaction and generate nothing}';

    protected $description = 'Generate demo transactions, or clear them';

    public function __construct(private readonly LedgerWriter $writer)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $owner = User::query()->first();

        if ($owner === null) {
            $this->error('No owner yet. Run `php artisan hisab:owner` first.');

            return self::FAILURE;
        }

        if ($this->option('clear') || $this->option('fresh')) {
            if (! $this->clear($owner)) {
                return self::FAILURE;
            }
        }

        if ($this->option('fresh')) {
            return self::SUCCESS;
        }

        return $this->generate($owner, max(1, (int) $this->option('months')));
    }

    private function clear(User $owner): bool
    {
        $count = Transaction::query()->where('user_id', $owner->id)->count();

        if ($count === 0) {
            $this->line('Nothing to clear.');

            return true;
        }

        $this->warn("This deletes ALL {$count} transactions for {$owner->email}.");
        $this->line('Not a reversal — an actual delete. Real entries would be gone with the demo ones.');

        if (! $this->confirm('Delete them?', false)) {
            $this->line('Left alone.');

            return false;
        }

        // Reversals point at the rows they cancel, so those have to go first or
        // the foreign key refuses. Deleting inside one transaction means a
        // failure half way through leaves the ledger as it was.
        DB::transaction(function () use ($owner): void {
            Transaction::query()->where('user_id', $owner->id)->whereNotNull('reverses_id')->delete();
            Transaction::query()->where('user_id', $owner->id)->delete();
        });

        $this->info("Deleted {$count} transactions.");

        return true;
    }

    private function generate(User $owner, int $months): int
    {
        $accounts = DB::table('accounts')
            ->where('user_id', $owner->id)->whereNull('archived_at')
            ->get()->keyBy(fn ($a): string => $a->name);

        $cash = $accounts['Cash in hand'] ?? $accounts->first();
        $bkash = $accounts['bKash'] ?? $cash;
        $bank = $accounts['Bank account'] ?? $cash;
        $dps = $accounts['DPS'] ?? null;

        if ($cash === null) {
            $this->error('No accounts to post against. Run `php artisan db:seed` first.');

            return self::FAILURE;
        }

        $categories = DB::table('categories')
            ->where('user_id', $owner->id)->where('book', 'personal')
            ->get()->keyBy(fn ($c): string => $c->type.':'.$c->key);

        $cat = fn (string $key): ?string => $categories[$key]->id ?? null;

        $made = 0;
        $start = Carbon::now()->startOfMonth()->subMonths($months - 1);

        $this->line("Generating {$months} month(s) from {$start->format('M Y')}…");

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

        $this->info("Wrote {$made} entries.");
        $this->line('Clear them with:  php artisan hisab:demo --fresh');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function post(User $owner, array $data): int
    {
        $legs = $this->writer->create($owner, $data);

        // Legs, not entries: a transfer is two rows and both are real.
        return $legs->count();
    }
}
