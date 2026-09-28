<?php

namespace Hisab\Dues;

use App\Models\User;
use Hisab\Dues\Services\DuesDemo;
use Illuminate\Console\Events\CommandFinished;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class DuesServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');

        // Demo dues ride on `hisab:demo` the same way demo budgets do: by
        // listening for it to finish, so the ledger's command is untouched.
        Event::listen(CommandFinished::class, function (CommandFinished $event): void {
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
                DuesDemo::purge($owner);
            }
            if (! $fresh) {
                $this->app->make(DuesDemo::class)->generate($owner);
            }
        });
    }
}
