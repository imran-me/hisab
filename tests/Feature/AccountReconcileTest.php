<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Fx\Seeders\FxSeeder;
use Hisab\Ledger\Services\BalanceSheet;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Review round 6, H1 and M1: a dated statement is compared with the balance
 * on its own date, a card statement is read as owed, and the fix-up moves no
 * month's income or spending.
 */
class AccountReconcileTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);
        $this->owner = User::query()->create(['name' => 'O', 'email' => 'o@example.test', 'password' => Hash::make('x')]);
    }

    private function account(string $type, int $opening = 0): Account
    {
        return Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => ucfirst($type), 'type' => $type, 'currency' => 'BDT', 'book' => 'personal',
            'opening_balance_minor' => $opening,
        ]);
    }

    private function spend(Account $a, int $minor, string $on): void
    {
        app(LedgerWriter::class)->create($this->owner, [
            'type' => 'expense', 'account_id' => $a->id, 'amount_minor' => $minor,
            'currency' => 'BDT', 'occurred_on' => $on,
        ]);
    }

    public function test_an_entry_after_the_statement_is_not_part_of_the_gap(): void
    {
        $bkash = $this->account('mfs', 10_000_00);
        $this->spend($bkash, 1_000_00, '2026-09-15');
        // After the statement: today's balance is ৳7,000, the 20th's was ৳9,000.
        $this->spend($bkash, 2_000_00, '2026-09-25');

        $check = $this->actingAs($this->owner)
            ->getJson("/api/accounts/{$bkash->id}/reconcile?statement_minor=900000&on=2026-09-20")
            ->assertOk()->json('data');

        $this->assertSame(9_000_00, $check['balance_on_minor']);
        // The old code compared with today's ৳7,000 and offered a ৳2,000 fix.
        $this->assertSame(0, $check['gap_minor']);
    }

    public function test_the_fix_up_moves_the_opening_balance_and_no_months_figures(): void
    {
        $bank = $this->account('bank', 50_000_00);
        $this->spend($bank, 5_000_00, '2026-09-10');
        $this->spend($bank, 3_000_00, '2026-09-25');

        // The statement of the 20th says ৳44,500: ৳500 of fees never recorded.
        $done = $this->actingAs($this->owner)
            ->postJson("/api/accounts/{$bank->id}/reconcile", ['statement_minor' => 44_500_00, 'on' => '2026-09-20'])
            ->assertOk()->json('data');

        $this->assertSame(-500_00, $done['adjusted_minor']);
        $this->assertSame(0, $done['gap_minor']);
        $this->assertSame(49_500_00, $done['account']['opening_balance_minor']);
        $this->assertSame('2026-09-20', $done['account']['statement_on']);

        // Today's balance carries the fix; the month's spending does not.
        $this->assertSame(41_500_00, app(BalanceSheet::class)->balances($this->owner)[$bank->id]);
        $month = app(BalanceSheet::class)->summary($this->owner, 'personal', '2026-09-01', '2026-09-30');
        $this->assertSame(8_000_00, $month['expense_minor']);
        $this->assertSame(0, $month['income_minor']);

        // Idempotent, and a later entry does not reopen it.
        $this->spend($bank, 700_00, '2026-09-27');
        $again = $this->getJson("/api/accounts/{$bank->id}/reconcile?statement_minor=4450000&on=2026-09-20")->json('data');
        $this->assertSame(0, $again['gap_minor']);
    }

    public function test_a_card_statement_is_the_amount_due(): void
    {
        $card = $this->account('card');
        $this->spend($card, 12_000_00, '2026-09-05');

        // Typed as the bill, ৳12,000, against a ledger holding −৳12,000.
        $check = $this->actingAs($this->owner)
            ->getJson("/api/accounts/{$card->id}/reconcile?statement_minor=1200000&on=2026-09-20")->json('data');

        $this->assertSame(-12_000_00, $check['statement_minor']);
        $this->assertSame(0, $check['gap_minor']);
    }

    public function test_someone_elses_account_is_a_404(): void
    {
        $other = User::query()->create(['name' => 'B', 'email' => 'b@example.test', 'password' => Hash::make('x')]);
        $theirs = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $other->id, 'name' => 'X',
            'type' => 'cash', 'currency' => 'BDT', 'book' => 'personal', 'opening_balance_minor' => 0,
        ]);

        $this->actingAs($this->owner)
            ->postJson("/api/accounts/{$theirs->id}/reconcile", ['statement_minor' => 1, 'on' => '2026-09-20'])
            ->assertNotFound();
    }
}
