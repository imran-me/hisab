<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Budgets\Services\BudgetDemo;
use Hisab\Categories\Models\Category;
use Hisab\Categories\Seeders\CategorySeeder;
use Hisab\Fx\Seeders\FxSeeder;
use Hisab\Ledger\Services\BalanceSheet;
use Hisab\Ledger\Services\DemoData;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * /api/budgets - a limit per category, and spent counted by the ledger's rule.
 */
class BudgetsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Account $cash;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);
        $this->seed(CategorySeeder::class);
        Carbon::setTestNow('2026-09-28 12:00:00');

        $this->owner = User::query()->create([
            'name' => 'Owner', 'email' => 'owner@example.test', 'password' => Hash::make('x'),
        ]);

        $this->cash = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()),
            'user_id' => $this->owner->id, 'name' => 'Cash', 'type' => 'cash',
            'currency' => 'BDT', 'book' => 'personal', 'opening_balance_minor' => 0,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function category(string $key): Category
    {
        return Category::query()->where('user_id', $this->owner->id)
            ->where('book', 'personal')->where('type', 'expense')->where('key', $key)->firstOrFail();
    }

    private function spend(string $key, int $minor, string $date, string $type = 'expense'): void
    {
        app(LedgerWriter::class)->create($this->owner, [
            'type' => $type, 'account_id' => $this->cash->id, 'amount_minor' => $minor,
            'currency' => 'BDT', 'category_id' => $this->category($key)->id, 'occurred_on' => $date,
        ]);
    }

    private function budgets(string $query = ''): array
    {
        return $this->actingAs($this->owner)->getJson('/api/budgets'.$query)->assertOk()->json('data');
    }

    private function row(array $data, string $key): array
    {
        return collect($data['rows'])->firstWhere('key', $key);
    }

    public function test_setting_a_budget_is_one_request_keyed_by_the_category(): void
    {
        $groceries = $this->category('groceries');

        $this->actingAs($this->owner)
            ->putJson("/api/budgets/{$groceries->id}", ['amount_minor' => 1_200_000])
            ->assertOk()->assertJsonPath('data.amount_minor', 1_200_000);

        // A second PUT replaces it: one budget per category, never two.
        $this->putJson("/api/budgets/{$groceries->id}", ['amount_minor' => 1_500_000])->assertOk();

        $row = $this->row($this->budgets(), 'groceries');
        $this->assertSame(1_500_000, $row['budget']['amount_minor']);
        $this->assertDatabaseCount('budgets', 1);
    }

    public function test_left_the_pace_and_the_three_states(): void
    {
        foreach (['groceries' => 1_000_000, 'transport' => 300_000, 'dining' => 200_000] as $key => $amount) {
            $this->actingAs($this->owner)->putJson("/api/budgets/{$this->category($key)->id}", ['amount_minor' => $amount]);
        }

        $this->spend('groceries', 400_000, '2026-09-05');     // 40%
        $this->spend('transport', 240_000, '2026-09-06');     // 80%
        $this->spend('dining', 250_000, '2026-09-07');        // 125%

        $data = $this->budgets('?month=2026-09');

        // The 28th of a 30-day month: today counts, so three days are left.
        $this->assertSame(3, $data['days_left']);

        $groceries = $this->row($data, 'groceries');
        $this->assertSame('ok', $groceries['state']);
        $this->assertSame(600_000, $groceries['left_minor']);
        // ৳6,000 over three days is ৳2,000 a day, floored to a whole taka.
        $this->assertSame(200_000, $groceries['per_day_minor']);

        $this->assertSame('warn', $this->row($data, 'transport')['state']);

        $dining = $this->row($data, 'dining');
        $this->assertSame('over', $dining['state']);
        $this->assertSame(-50_000, $dining['left_minor']);
        $this->assertSame(0, $dining['per_day_minor']);

        // The most used comes first, so the one about to run out is read first.
        $this->assertSame(['dining', 'transport', 'groceries'], array_slice(array_column($data['rows'], 'key'), 0, 3));

        $this->assertSame(1_500_000, $data['totals']['budgeted_minor']);
        $this->assertSame(890_000, $data['totals']['spent_minor']);
        $this->assertSame(1, $data['totals']['over']);
    }

    public function test_a_deposit_never_uses_a_budget_and_a_correction_counts_once(): void
    {
        $groceries = $this->category('groceries');
        $this->actingAs($this->owner)->putJson("/api/budgets/{$groceries->id}", ['amount_minor' => 1_000_000]);

        $legs = app(LedgerWriter::class)->create($this->owner, [
            'type' => 'expense', 'account_id' => $this->cash->id, 'amount_minor' => 450_000,
            'currency' => 'BDT', 'category_id' => $groceries->id, 'occurred_on' => '2026-09-10',
        ]);
        // Entered as ৳4,500, meant ৳450: the mirror has to subtract, or the
        // category reads as ৳9,450 spent.
        app(LedgerWriter::class)->correct($this->owner, $legs->first(), ['amount_minor' => 45_000], 'typo');

        // Money into savings under the same category id is still not spending.
        $this->spend('groceries', 300_000, '2026-09-11', 'deposit');

        $row = $this->row($this->budgets(), 'groceries');
        $this->assertSame(45_000, $row['spent_minor']);
        $this->assertSame(1, $row['count']);
    }

    public function test_every_category_plus_the_rest_adds_up_to_the_ledger_summary(): void
    {
        app(DemoData::class)->generate($this->owner, 3);

        foreach (['2026-07', '2026-08', '2026-09'] as $month) {
            $data = $this->budgets("?month={$month}");
            $summary = app(BalanceSheet::class)->summary(
                $this->owner, 'personal', "{$month}-01", Carbon::parse("{$month}-01")->endOfMonth()->toDateString(),
            );

            $this->assertSame(
                $summary['expense_minor'],
                array_sum(array_column($data['rows'], 'spent_minor')) + $data['other_minor'],
                "Budgets and the ledger disagree about {$month}",
            );
        }
    }

    public function test_the_suggestion_is_a_round_figure_from_the_months_before(): void
    {
        $this->spend('groceries', 734_000, '2026-08-12');
        $this->spend('groceries', 500_000, '2026-07-12');

        $row = $this->row($this->budgets('?month=2026-09'), 'groceries');

        $this->assertSame(734_000, $row['last_month_minor']);
        $this->assertSame(617_000, $row['average_minor']);
        // The larger of the two, ৳7,340, up to ৳7,500.
        $this->assertSame(750_000, $row['suggested_minor']);
        $this->assertNull($row['budget']);
        $this->assertNull($row['state']);
    }

    public function test_a_past_month_has_no_pace(): void
    {
        $groceries = $this->category('groceries');
        $this->actingAs($this->owner)->putJson("/api/budgets/{$groceries->id}", ['amount_minor' => 1_000_000]);
        $this->spend('groceries', 100_000, '2026-08-12');

        $row = $this->row($this->budgets('?month=2026-08'), 'groceries');
        $this->assertSame(900_000, $row['left_minor']);
        $this->assertNull($row['per_day_minor']);
    }

    public function test_someone_elses_category_is_a_404_and_a_derived_figure_cannot_be_posted(): void
    {
        $other = User::query()->create(['name' => 'B', 'email' => 'b@example.test', 'password' => Hash::make('x')]);
        $theirs = Category::query()->where('user_id', $other->id)->where('type', 'expense')->firstOrFail();

        $this->actingAs($this->owner)
            ->putJson("/api/budgets/{$theirs->id}", ['amount_minor' => 1000])->assertNotFound();

        // An income category has nothing to limit.
        $salary = Category::query()->where('user_id', $this->owner->id)->where('type', 'income')->firstOrFail();
        $this->putJson("/api/budgets/{$salary->id}", ['amount_minor' => 1000])->assertNotFound();

        $this->putJson("/api/budgets/{$this->category('groceries')->id}", ['amount_minor' => 0])->assertStatus(422);

        // spent_minor is not a field: sent anyway, it changes nothing.
        $this->putJson("/api/budgets/{$this->category('groceries')->id}", ['amount_minor' => 5000, 'spent_minor' => 1])->assertOk();
        $this->assertSame(0, $this->row($this->budgets(), 'groceries')['spent_minor']);
    }

    public function test_removing_a_budget(): void
    {
        $groceries = $this->category('groceries');
        $this->actingAs($this->owner)->putJson("/api/budgets/{$groceries->id}", ['amount_minor' => 1000]);

        $this->deleteJson("/api/budgets/{$groceries->id}")->assertNoContent();
        $this->deleteJson("/api/budgets/{$groceries->id}")->assertNotFound();
        $this->assertNull($this->row($this->budgets(), 'groceries')['budget']);
    }

    public function test_demo_budgets_are_removed_exactly_and_never_replace_the_owners(): void
    {
        $groceries = $this->category('groceries');
        $this->actingAs($this->owner)->putJson("/api/budgets/{$groceries->id}", ['amount_minor' => 99_900]);

        $this->assertSame(5, BudgetDemo::generate($this->owner));
        $this->assertSame(99_900, $this->row($this->budgets(), 'groceries')['budget']['amount_minor']);

        $this->assertSame(5, BudgetDemo::purge($this->owner));
        $this->assertDatabaseCount('budgets', 1);
    }

    public function test_it_needs_a_session(): void
    {
        $this->getJson('/api/budgets')->assertUnauthorized();
    }
}
