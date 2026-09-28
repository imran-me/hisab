<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Budgets\Services\BudgetDemo;
use Hisab\Categories\Models\Category;
use Hisab\Categories\Seeders\CategorySeeder;
use Hisab\Fx\Seeders\FxSeeder;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/** /api/goals - a target, with progress read from the ledger. */
class GoalsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Account $bank;
    private Account $dps;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);
        $this->seed(CategorySeeder::class);
        Carbon::setTestNow('2026-09-28 12:00:00');

        $this->owner = User::query()->create(['name' => 'O', 'email' => 'o@example.test', 'password' => Hash::make('x')]);
        $this->bank = $this->account('Bank', 'bank');
        $this->dps = $this->account('DPS', 'savings');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function account(string $name, string $type): Account
    {
        return Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id, 'name' => $name,
            'type' => $type, 'currency' => 'BDT', 'book' => 'personal', 'opening_balance_minor' => 0,
        ]);
    }

    private function shares(): Category
    {
        return Category::query()->where('user_id', $this->owner->id)->where('type', 'deposit')->where('key', 'shares')->firstOrFail();
    }

    private function deposit(int $minor, string $on, array $extra = []): \Illuminate\Support\Collection
    {
        return app(LedgerWriter::class)->create($this->owner, [
            'type' => 'deposit', 'account_id' => $this->bank->id, 'amount_minor' => $minor,
            'currency' => 'BDT', 'occurred_on' => $on,
        ] + $extra);
    }

    public function test_a_goal_on_an_account_is_its_balance_with_a_pace_and_an_eta(): void
    {
        foreach (['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05'] as $on) {
            $this->deposit(500_000, $on, ['to_account_id' => $this->dps->id]);
        }

        $goal = $this->actingAs($this->owner)->postJson('/api/goals', [
            'name' => 'Umrah', 'target_minor' => 30_000_000, 'target_on' => '2027-08-01',
            'account_id' => $this->dps->id,
        ])->assertCreated()->json('data');

        $this->assertSame(2_000_000, $goal['saved_minor']);
        $this->assertSame(28_000_000, $goal['left_minor']);
        // September 2026 to August 2027 is twelve months, this one included.
        $this->assertSame(12, $goal['months_left']);
        $this->assertSame(2_333_334, $goal['needed_per_month_minor']);
        // June, July and August put in ৳5,000 each.
        $this->assertSame(500_000, $goal['recent_per_month_minor']);
        $this->assertSame('behind', $goal['state']);
        // ৳2,80,000 at ৳5,000 a month is 56 months from September.
        $this->assertSame('2031-04', $goal['eta']);
    }

    public function test_a_goal_on_a_deposit_category_counts_each_deposit_once_and_nets_a_reversal(): void
    {
        $shares = $this->shares();
        $legs = $this->deposit(1_000_000, '2026-09-10', ['to_account_id' => $this->dps->id, 'category_id' => $shares->id]);
        $this->deposit(400_000, '2026-09-12', ['category_id' => $shares->id]);
        app(LedgerWriter::class)->reverse($this->owner, $legs->first(), 'wrong');

        $goal = $this->actingAs($this->owner)->postJson('/api/goals', [
            'name' => 'Emergency fund', 'target_minor' => 400_000, 'category_id' => $shares->id,
        ])->json('data');

        $this->assertSame(400_000, $goal['saved_minor']);
        $this->assertSame('achieved', $goal['state']);
    }

    public function test_refusals(): void
    {
        $this->actingAs($this->owner)->postJson('/api/goals', [
            'name' => 'X', 'target_minor' => 1000, 'account_id' => $this->dps->id, 'category_id' => $this->shares()->id,
        ])->assertStatus(422);

        $expense = Category::query()->where('user_id', $this->owner->id)->where('type', 'expense')->firstOrFail();
        $this->postJson('/api/goals', ['name' => 'X', 'target_minor' => 1000, 'category_id' => $expense->id])->assertNotFound();

        $other = User::query()->create(['name' => 'B', 'email' => 'b@example.test', 'password' => Hash::make('x')]);
        $id = $this->actingAs($other)->postJson('/api/goals', ['name' => 'Theirs', 'target_minor' => 1000])->json('data.id');
        $this->actingAs($this->owner)->patchJson("/api/goals/{$id}", ['name' => 'Mine'])->assertNotFound();

        // There is no field for progress.
        $goal = $this->postJson('/api/goals', ['name' => 'Car', 'target_minor' => 1000, 'saved_minor' => 1000])->json('data');
        $this->assertSame(0, $goal['saved_minor']);
        $this->assertSame('unlinked', $goal['state']);
    }

    public function test_demo_goals(): void
    {
        $this->assertSame(2, BudgetDemo::goals($this->owner));
        $this->assertSame(0, BudgetDemo::goals($this->owner));
        $this->assertCount(2, $this->actingAs($this->owner)->getJson('/api/goals')->json('data.goals'));
        BudgetDemo::purge($this->owner);
        $this->assertSame([], $this->getJson('/api/goals')->json('data.goals'));
    }
}
