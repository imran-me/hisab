<?php

namespace Hisab\Categories;

use App\Models\User;
use App\Support\ModuleSeeders;
use Hisab\Categories\Seeders\CategorySeeder;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class CategoriesServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        ModuleSeeders::register(CategorySeeder::class);

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');

        $this->seedCategoriesForNewOwners();
    }

    /**
     * A new owner starts with the default categories.
     *
     * Listening to the model event rather than having `hisab:owner` call this
     * module: the auth module must not name this one, or the module test breaks
     * in both directions - deleting either would leave the other referencing a
     * class that is gone. The dependency points inward instead, from this module
     * to App\Models\User, which is shared code that every module may use.
     *
     * An owner created BEFORE this module existed is handled by CategorySeeder,
     * which walks the users table. Between the two, every owner ends up seeded
     * exactly once, whichever order things happened in.
     */
    private function seedCategoriesForNewOwners(): void
    {
        User::created(static function (User $user): void {
            CategorySeeder::seedFor($user);
        });
    }
}
