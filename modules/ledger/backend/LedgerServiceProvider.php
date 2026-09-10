<?php

namespace Hisab\Ledger;

use Hisab\Ledger\Commands\DemoCommand;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The ledger has no seeder: a starting transaction would be an invented figure
 * in someone's accounts, and CONVENTIONS.md is clear that a made-up balance is
 * worse than none because it looks real.
 */
class LedgerServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');

        if ($this->app->runningInConsole()) {
            $this->commands([DemoCommand::class]);
        }
    }
}
