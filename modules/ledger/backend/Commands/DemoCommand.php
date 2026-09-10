<?php

namespace Hisab\Ledger\Commands;

use App\Models\User;
use Hisab\Ledger\Models\Transaction;
use Hisab\Ledger\Services\DemoData;
use Illuminate\Console\Command;

/**
 * The console face of Hisab\Ledger\Services\DemoData.
 *
 * All it does is ask, print and delegate. Settings has a button for the same
 * thing, and both go through the service - so the two cannot drift into
 * generating different data or deleting different rows.
 */
class DemoCommand extends Command
{
    protected $signature = 'hisab:demo
        {--months=3 : How many months back to generate}
        {--clear : Remove the demo data first}
        {--fresh : Remove the demo data and generate nothing}';

    protected $description = 'Generate demo transactions, or remove them';

    public function __construct(private readonly DemoData $demo)
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

        $months = max(1, (int) $this->option('months'));
        $this->line("Generating {$months} month(s)…");

        $made = $this->demo->generate($owner, $months);

        $this->info("Wrote {$made} entries.");
        $this->line('Remove them with:  php artisan hisab:demo --fresh');

        return self::SUCCESS;
    }

    private function clear(User $owner): bool
    {
        $count = Transaction::query()->where('user_id', $owner->id)->where('is_demo', true)->count();

        if ($count === 0) {
            $this->line('No demo entries to remove.');

            return true;
        }

        if (! $this->option('no-interaction')
            && ! $this->confirm("Remove {$count} demo entries? Anything you recorded yourself is untouched.", true)) {
            $this->line('Left alone.');

            return false;
        }

        $result = DemoData::purge($owner);
        $this->info("Removed {$result['transactions']} demo entries and {$result['accounts']} demo accounts.");

        return true;
    }
}
