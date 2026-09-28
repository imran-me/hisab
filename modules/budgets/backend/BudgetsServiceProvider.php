<?php

namespace Hisab\Budgets;

use App\Models\User;
use Hisab\Budgets\Services\BudgetDemo;
use Illuminate\Console\Events\CommandFinished;
use Illuminate\Foundation\Http\Events\RequestHandled;
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

        // Demo budgets and goals ride on the ledger's demo data by LISTENING
        // for it - `hisab:demo` finishing, or Settings' POST / DELETE
        // /api/ledger/demo succeeding - rather than by editing the ledger's
        // command or controller. The dependency points from this module to
        // that one, and deleting modules/budgets/ leaves both untouched.
        Event::listen(CommandFinished::class, static function (CommandFinished $event): void {
            if ($event->command !== 'hisab:demo' || $event->exitCode !== 0) {
                return;
            }
            $input = $event->input;
            $clear = ($input->hasOption('clear') && $input->getOption('clear'))
                || ($input->hasOption('fresh') && $input->getOption('fresh'));
            $fresh = $input->hasOption('fresh') && $input->getOption('fresh');
            self::demo(User::query()->first(), $clear, ! $fresh);
        });

        Event::listen(RequestHandled::class, static function (RequestHandled $event): void {
            $request = $event->request;
            if ($request->path() !== 'api/ledger/demo' || ! $event->response->isSuccessful()) {
                return;
            }
            if ($request->isMethod('POST')) {
                self::demo($request->user(), false, true);
            } elseif ($request->isMethod('DELETE')) {
                self::demo($request->user(), true, false);
            }
        });
    }

    private static function demo(?User $owner, bool $clear, bool $generate): void
    {
        if ($owner === null) {
            return;
        }
        if ($clear) {
            BudgetDemo::purge($owner);
        }
        if ($generate) {
            BudgetDemo::generate($owner);
            BudgetDemo::goals($owner);
        }
    }
}
