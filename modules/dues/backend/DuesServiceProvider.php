<?php

namespace Hisab\Dues;

use App\Models\User;
use Hisab\Dues\Services\DuesDemo;
use Illuminate\Console\Events\CommandFinished;
use Illuminate\Foundation\Http\Events\RequestHandled;
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

        // Demo dues follow the ledger's demo data the same way demo budgets
        // do: by listening for `hisab:demo` and for Settings' POST / DELETE
        // /api/ledger/demo, so neither of the ledger's files is edited.
        Event::listen(CommandFinished::class, function (CommandFinished $event): void {
            if ($event->command !== 'hisab:demo' || $event->exitCode !== 0) {
                return;
            }
            $input = $event->input;
            $fresh = $input->hasOption('fresh') && $input->getOption('fresh');
            $clear = $fresh || ($input->hasOption('clear') && $input->getOption('clear'));
            $this->demo(User::query()->first(), $clear, ! $fresh);
        });

        Event::listen(RequestHandled::class, function (RequestHandled $event): void {
            $request = $event->request;
            if ($request->path() !== 'api/ledger/demo' || ! $event->response->isSuccessful()) {
                return;
            }
            if ($request->isMethod('POST')) {
                $this->demo($request->user(), false, true);
            } elseif ($request->isMethod('DELETE')) {
                $this->demo($request->user(), true, false);
            }
        });
    }

    private function demo(?User $owner, bool $clear, bool $generate): void
    {
        if ($owner === null) {
            return;
        }
        if ($clear) {
            DuesDemo::purge($owner);
        }
        if ($generate) {
            $this->app->make(DuesDemo::class)->generate($owner);
        }
    }
}
