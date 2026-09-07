<?php

namespace Database\Seeders;

use App\Support\ModuleSeeders;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * Runs whatever the loaded modules registered, and names none of them.
 *
 * See App\Support\ModuleSeeders for why the reference points that way round.
 *
 * NOTE WHAT IS NOT HERE: this does not create a user. Laravel's skeleton seeds
 * a `test@example.com` account, which on this app would be a second owner with
 * a known email and a factory-generated password, created by any run of
 * `db:seed` - including one on the server. The owner is created by
 * `php artisan hisab:owner`, interactively, and there is exactly one.
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        foreach (ModuleSeeders::all() as $seeder) {
            $this->call($seeder);
        }
    }
}
