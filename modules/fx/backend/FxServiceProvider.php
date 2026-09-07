<?php

namespace Hisab\Fx;

use App\Support\ModuleSeeders;
use Hisab\Fx\Seeders\FxSeeder;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The FX module's single point of contact with the application.
 *
 * Migrations live INSIDE the module rather than in database/migrations, so that
 * the module test holds: deleting modules/fx/ removes the feature whole, and a
 * migration left behind in a shared directory would keep creating tables for a
 * feature that no longer exists.
 */
class FxServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        ModuleSeeders::register(FxSeeder::class);

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');
    }
}
