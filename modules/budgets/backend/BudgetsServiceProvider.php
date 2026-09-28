<?php

namespace Hisab\Budgets;

use App\Models\User;
use Hisab\Budgets\Services\BudgetDemo;
use Illuminate\Console\Events\CommandFinished;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class BudgetsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');

        // Demo budgets ride on `hisab:demo` by listening for it to finish,
        // rather than by editing the ledger's demo command: the dependency
        // points from this module to that one, and deleting modules/budgets/
        // leaves the command exactly as it was.
        Event::listen(CommandFinished::class, static function (CommandFinished $event): void {
            if ($event->command !== 'hisab:demo' || $event->exitCode !== 0) {
                return;
            }

            $owner = User::query()->first();
            if ($owner === null) {
                return;
            }

            $input = $event->input;
            $clear = $input->hasOption('clear') && $input->getOption('clear');
            $fresh = $input->hasOption('fresh') && $input->getOption('fresh');

            if ($clear || $fresh) {
                BudgetDemo::purge($owner);
            }
            if (! $fresh) {
                BudgetDemo::generate($owner);
            }
        });
    }
}
