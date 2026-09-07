<?php

namespace App\Support;

/**
 * Where modules announce their seeders.
 *
 * This exists to keep the module test honest. CONVENTIONS.md allows a module to
 * be named from exactly TWO places outside its own folder — the PSR-4 map in
 * composer.json and bootstrap/providers.php — and `DatabaseSeeder::call(
 * FxSeeder::class)` would be a third. Worse, it would be the kind that does not
 * fail loudly: deleting modules/fx/ would leave a seeder referencing a class
 * that no longer exists, and `db:seed` would fatal on a fresh install.
 *
 * So the direction of the reference is inverted. A module's service provider —
 * which is already one of the two permitted places — pushes its seeder here on
 * boot, and DatabaseSeeder runs whatever it finds without naming any module.
 * Delete a module folder and remove its provider line, and its seeder simply
 * stops registering.
 *
 * Order is registration order, which is provider order in bootstrap/providers.php.
 * That is what makes it possible for a later module to depend on an earlier
 * one's rows — accounts need currencies to exist before they can reference one.
 */
class ModuleSeeders
{
    /** @var list<class-string> */
    private static array $seeders = [];

    /**
     * @param  class-string  $seeder
     */
    public static function register(string $seeder): void
    {
        // Guarded because a provider can boot more than once in a test run, and
        // a seeder listed twice would run twice. The seeders are idempotent, so
        // this is about not doing pointless work rather than about correctness.
        if (! in_array($seeder, self::$seeders, true)) {
            self::$seeders[] = $seeder;
        }
    }

    /**
     * @return list<class-string>
     */
    public static function all(): array
    {
        return self::$seeders;
    }

    public static function flush(): void
    {
        self::$seeders = [];
    }
}
