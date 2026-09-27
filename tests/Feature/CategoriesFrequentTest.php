<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Categories\Models\Category;
use Hisab\Categories\Seeders\CategorySeeder;
use Hisab\Fx\Seeders\FxSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * GET /api/categories/frequent - the entry sheet's one-tap tiles.
 *
 * The ranking decides which eight categories are one tap away, so each rule
 * that could quietly put the wrong one there has a test: reversed entries do
 * not count, old ones do not count, archived categories never appear, and a
 * new owner still gets a full grid.
 */
class CategoriesFrequentTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);
        $this->seed(CategorySeeder::class);
        Carbon::setTestNow('2026-09-27 12:00:00');

        $this->owner = User::query()->create([
            'name' => 'Owner',
            'email' => 'owner@example.test',
            'password' => Hash::make('a correct horse battery staple'),
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function account(string $name): Account
    {
        return Account::query()->create([
            'id' => strtoupper((string) Str::ulid()),
            'user_id' => $this->owner->id,
            'name' => $name,
            'type' => 'cash',
            'currency' => 'BDT',
            'book' => 'personal',
            'opening_balance_minor' => 0,
        ]);
    }

    private function category(string $key): Category
    {
        return Category::query()->where('user_id', $this->owner->id)
            ->where('type', 'expense')->where('key', $key)->firstOrFail();
    }

    private function spend(Account $account, Category $category, string $on): string
    {
        return $this->actingAs($this->owner)->postJson('/api/ledger', [
            'type' => 'expense', 'account_id' => $account->id, 'amount_minor' => 25000,
            'currency' => 'BDT', 'category_id' => $category->id, 'occurred_on' => $on,
        ])->assertCreated()->json('data.id');
    }

    private function frequent(string $query = ''): array
    {
        return $this->actingAs($this->owner)
            ->getJson('/api/categories/frequent'.$query)->assertOk()->json('data');
    }

    public function test_the_most_used_come_first_and_the_grid_is_always_full(): void
    {
        $cash = $this->account('Cash');
        $dining = $this->category('dining');
        $health = $this->category('health');

        foreach (['2026-09-20', '2026-09-21', '2026-09-22'] as $day) {
            $this->spend($cash, $health, $day);
        }
        $this->spend($cash, $dining, '2026-09-23');

        $rows = $this->frequent();

        $this->assertCount(8, $rows);
        $this->assertSame(['health', 'dining'], [$rows[0]['key'], $rows[1]['key']]);
        $this->assertSame(3, $rows[0]['uses']);
        // The rest are filled in seed order, unused.
        $this->assertSame('groceries', $rows[2]['key']);
        $this->assertSame(0, $rows[2]['uses']);
    }

    public function test_a_reversed_entry_and_its_mirror_are_not_uses(): void
    {
        $cash = $this->account('Cash');
        $travel = $this->category('travel');

        $id = $this->spend($cash, $travel, '2026-09-20');
        $this->actingAs($this->owner)->postJson("/api/ledger/{$id}/reverse", ['reason' => 'Typo'])->assertSuccessful();

        $row = collect($this->frequent('?limit=24'))->firstWhere('key', 'travel');

        $this->assertSame(0, $row['uses'] ?? 0);
    }

    public function test_entries_outside_the_window_do_not_count(): void
    {
        $cash = $this->account('Cash');
        $this->spend($cash, $this->category('travel'), '2026-06-01');

        $rows = $this->frequent();

        $this->assertNotSame('travel', $rows[0]['key']);
        // A wider window does see it, so it was the window that left it out.
        $this->assertSame(1, collect($this->frequent('?days=366&limit=24'))->firstWhere('key', 'travel')['uses']);
    }

    public function test_archived_categories_never_appear(): void
    {
        $cash = $this->account('Cash');
        $health = $this->category('health');
        $this->spend($cash, $health, '2026-09-20');
        $health->update(['archived_at' => Carbon::now()]);

        $keys = array_column($this->frequent('?limit=24'), 'key');

        $this->assertNotContains('health', $keys);
    }

    public function test_the_last_account_used_for_a_category_is_named(): void
    {
        $cash = $this->account('Cash');
        $bkash = $this->account('bKash');
        $utilities = $this->category('utilities');

        $this->spend($cash, $utilities, '2026-09-01');
        $this->spend($bkash, $utilities, '2026-09-15');

        $row = collect($this->frequent())->firstWhere('key', 'utilities');

        $this->assertSame($bkash->id, $row['last_account_id']);
    }

    public function test_another_owners_entries_are_not_counted(): void
    {
        $other = User::query()->create([
            'name' => 'Other', 'email' => 'other@example.test', 'password' => Hash::make('x'),
        ]);

        // A fresh owner has no history: nothing is used, and nothing leaks.
        $this->spend($this->account('Cash'), $this->category('health'), '2026-09-20');

        $rows = $this->actingAs($other)->getJson('/api/categories/frequent')->assertOk()->json('data');

        $this->assertSame([0], array_values(array_unique(array_column($rows, 'uses'))));
    }
}
