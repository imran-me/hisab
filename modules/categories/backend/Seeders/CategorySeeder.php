<?php

namespace Hisab\Categories\Seeders;

use App\Models\User;
use App\Support\Slug;
use Hisab\Categories\Models\Category;
use Hisab\Categories\Models\NecessityBand;
use Hisab\Categories\Models\PaymentMethod;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Necessity bands, payment methods, and each owner's starting categories.
 *
 * READS modules/categories/data/seed.json — the same file the frontend fetches.
 * One list, not two.
 *
 * The reference tables are shared; the categories are seeded PER OWNER, because
 * they are editable. A shared default row that one owner renames would need a
 * per-user override table to sit beside it, and then two places to look to
 * answer "what is this category called".
 *
 * Idempotent, and safe to run before any owner exists — it simply seeds no
 * categories then, and CategoriesServiceProvider fills them in when the owner
 * is created.
 */
class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $path = __DIR__.'/../../data/seed.json';

        if (! is_file($path)) {
            throw new RuntimeException("Category seed data missing at {$path}");
        }

        $seed = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        $this->seedBands($seed['necessity'] ?? []);
        $this->seedMethods($seed['methods'] ?? []);

        // Any owner who predates this module. On a fresh install there is none,
        // and the provider's listener handles the one created later.
        User::query()->each(function (User $user) use ($seed): void {
            self::seedFor($user, $seed);
        });
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    protected function seedBands(array $rows): void
    {
        foreach ($rows as $row) {
            NecessityBand::query()->updateOrCreate(
                ['band' => $row['band']],
                ['key' => $row['key'], 'label' => $row['label'], 'hint' => $row['hint'] ?? null],
            );
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    protected function seedMethods(array $rows): void
    {
        foreach ($rows as $i => $row) {
            PaymentMethod::query()->updateOrCreate(
                ['key' => $row['key']],
                ['label' => $row['label'], 'icon' => $row['icon'] ?? null, 'sort_order' => $i],
            );
        }
    }

    /**
     * The starting categories for one owner.
     *
     * Static and public so the service provider can call it when an owner is
     * created, without instantiating a Seeder.
     *
     * @param  array<string, mixed>|null  $seed
     */
    public static function seedFor(User $user, ?array $seed = null): void
    {
        $seed ??= json_decode(
            (string) file_get_contents(__DIR__.'/../../data/seed.json'),
            true, 512, JSON_THROW_ON_ERROR,
        );

        // The categories about to be written carry a necessity band, and that
        // column has a foreign key. If the reference tables have not been seeded
        // this insert fails with a constraint violation — which is what
        // `php artisan hisab:owner` would do on a database that had been
        // migrated but not seeded, and the error names a table the person did
        // not ask about.
        //
        // So owner-seeding does not DEPEND on seeding order, it establishes what
        // it needs. Cheap: one count on a four-row table, and the write only
        // happens once.
        if (NecessityBand::query()->count() === 0) {
            $reference = new self();
            $reference->seedBands($seed['necessity'] ?? []);
            $reference->seedMethods($seed['methods'] ?? []);
        }

        foreach (Category::BOOKS as $book) {
            foreach (Category::TYPES as $type) {
                $rows = $seed[$book][$type] ?? [];

                foreach ($rows as $i => $row) {
                    Category::query()->updateOrCreate(
                        [
                            'user_id' => $user->id,
                            'book' => $book,
                            'type' => $type,
                            // Matched on `key`, not on `label`: the label is the
                            // part the owner is expected to rename, and matching
                            // on it would re-create a category every time they
                            // did.
                            'key' => $row['key'] ?? Slug::make($row['label']),
                        ],
                        [
                            'label' => $row['label'],
                            // Only expenses carry a band, whatever the seed says.
                            'necessity' => $type === 'expense' ? ($row['necessity'] ?? 3) : null,
                            'sort_order' => $i,
                        ],
                    );
                }
            }
        }
    }
}
