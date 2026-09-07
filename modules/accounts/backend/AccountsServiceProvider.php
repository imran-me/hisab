<?php

namespace Hisab\Accounts;

use App\Models\User;
use App\Support\ModuleSeeders;
use Hisab\Accounts\Seeders\AccountSeeder;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AccountsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        ModuleSeeders::register(AccountSeeder::class);

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');

        // Same pattern as categories: a new owner starts with the seed, and the
        // dependency points inward to App\Models\User rather than sideways to
        // the auth module.
        User::created(static function (User $user): void {
            AccountSeeder::seedFor($user);
        });
    }
}
