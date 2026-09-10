<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Fx\Seeders\FxSeeder;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class FinanceCockpitTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Account $account;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);

        $this->owner = User::query()->create([
            'name' => 'Owner', 'email' => 'owner@example.test', 'password' => Hash::make('x'),
        ]);

        $this->account = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()),
            'user_id' => $this->owner->id, 'name' => 'Cash', 'type' => 'cash',
            'currency' => 'BDT', 'book' => 'personal', 'opening_balance_minor' => 0,
        ]);
    }

    private function record(string $type, int $minor, string $date, array $extra = []): void
    {
        app(LedgerWriter::class)->create($this->owner, array_merge([
            'type' => $type,
            'account_id' => $this->account->id,
            'amount_minor' => $minor,
            'currency' => 'BDT',
            'occurred_on' => $date,
        ], $extra));
    }

    private function month(string $key): array
    {
        return $this->actingAs($this->owner)->getJson("/api/finance/{$key}")->assertOk()->json('data');
    }

    // ------------------------------------------------------------ the totals

    public function test_a_deposit_is_kept_but_not_in_hand(): void
    {
        $this->record('income', 100000, '2026-03-05');
        $this->record('expense', 30000, '2026-03-06');
        $this->record('deposit', 20000, '2026-03-07');

        $m = $this->month('2026-03');

        // net is what moved in your HAND: a deposit left it.
        $this->assertSame(50000, $m['net_minor']);
        // kept is what you still HAVE: a deposit is still yours. Collapsing
        // these two is the mistake the whole app is arranged to avoid.
        $this->assertSame(70000, $m['kept_minor']);
        $this->assertSame(20000, $m['deposit_minor']);
        // assertEquals, not assertSame: JSON has no int/float distinction, so a
        // whole 70.0 arrives as 70 and the types differ while the number does not.
        $this->assertEquals(70.0, $m['savings_rate']);
    }

    public function test_a_transfer_is_in_no_figure_at_all(): void
    {
        $other = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => 'Bank', 'type' => 'bank', 'currency' => 'BDT',
            'book' => 'personal', 'opening_balance_minor' => 0,
        ]);

        $this->record('income', 100000, '2026-03-01');
        $this->record('transfer', 40000, '2026-03-02', ['to_account_id' => $other->id]);

        $m = $this->month('2026-03');

        // Including it inflates both sides equally, which leaves the difference
        // right and the savings rate meaningless.
        $this->assertSame(100000, $m['income_minor']);
        $this->assertSame(0, $m['expense_minor']);
        $this->assertSame(100000, $m['net_minor']);
    }

    // ----------------------------------------------------------- carry-over

    public function test_a_month_opens_with_what_the_previous_ones_left(): void
    {
        $this->record('income', 100000, '2026-01-10');
        $this->record('expense', 40000, '2026-01-11');   // January nets +60,000
        $this->record('expense', 10000, '2026-02-05');

        $february = $this->month('2026-02');

        $this->assertSame(60000, $february['opening_minor']);
        $this->assertSame(50000, $february['closing_minor']);
    }

    public function test_a_record_added_to_an_earlier_month_corrects_the_later_ones(): void
    {
        $this->record('income', 100000, '2026-01-10');
        $this->assertSame(100000, $this->month('2026-02')['opening_minor']);

        // The whole reason opening is derived rather than stored. Nothing is
        // reopened, nothing is recalculated by hand, and February is simply
        // correct the next time it is read.
        $this->record('expense', 25000, '2026-01-20');

        $this->assertSame(75000, $this->month('2026-02')['opening_minor']);
    }

    public function test_carry_forward_off_starts_every_month_at_zero(): void
    {
        $this->record('income', 100000, '2026-01-10');

        $this->actingAs($this->owner)
            ->patchJson('/api/finance/settings', ['carry_forward' => false])->assertOk();

        $this->assertSame(0, $this->month('2026-02')['opening_minor']);
    }

    public function test_the_opening_balance_is_included(): void
    {
        $this->actingAs($this->owner)
            ->patchJson('/api/finance/settings', ['opening_balance_minor' => 500000])->assertOk();

        // Without it every balance is wrong by a constant, and the error is
        // invisible because everything still adds up internally.
        $this->assertSame(500000, $this->month('2026-01')['opening_minor']);
    }

    public function test_the_vault_accumulates_and_never_resets(): void
    {
        $this->record('deposit', 20000, '2026-01-05');
        $this->record('deposit', 30000, '2026-02-05');

        $this->assertSame(20000, $this->month('2026-01')['vault_minor']);
        $this->assertSame(50000, $this->month('2026-02')['vault_minor']);
    }

    // -------------------------------------------------------------- quality

    public function test_untagged_spending_is_not_scored_rather_than_scored_as_bad(): void
    {
        $this->record('expense', 50000, '2026-03-05');   // no necessity

        $q = $this->month('2026-03')['quality'];

        // A zero would read as "all avoidable", which is a judgement nobody
        // made. No score, and the untagged amount is reported so the screen can
        // say why.
        $this->assertNull($q['score']);
        $this->assertSame(50000, $q['untagged_minor']);
    }

    public function test_the_quality_score_weights_the_necessity_mix(): void
    {
        $this->record('expense', 50000, '2026-03-05', ['necessity' => 1]);   // weight 1.0
        $this->record('expense', 50000, '2026-03-06', ['necessity' => 4]);   // weight 0.0

        $q = $this->month('2026-03')['quality'];

        $this->assertEquals(50.0, $q['score']);
        $this->assertSame('D', $q['grade']);
        $this->assertSame(100000, $q['tagged_minor']);
    }

    // ------------------------------------------------------------ reversals

    public function test_a_reversed_entry_stops_counting_everywhere(): void
    {
        $this->record('income', 100000, '2026-03-01');
        $this->record('expense', 40000, '2026-03-02');

        $expense = \Hisab\Ledger\Models\Transaction::query()->where('type', 'expense')->firstOrFail();
        $this->actingAs($this->owner)->postJson("/api/ledger/{$expense->id}/reverse")->assertCreated();

        // The mirror is dated today, so ask a range that covers both.
        $m = $this->month(now()->format('Y-m'));
        $march = $this->month('2026-03');

        // March still shows what March said; the correction lands in the month
        // it was made. What must NOT happen is the mirror counting as a second
        // expense - which is exactly what summing by type alone would do.
        $this->assertSame(40000, $march['expense_minor']);
        $this->assertSame(-40000, $m['expense_minor']);
    }

    // -------------------------------------------------------------- closing

    public function test_closing_files_the_month_without_touching_a_record(): void
    {
        $this->record('income', 100000, '2026-03-01');

        $this->actingAs($this->owner)
            ->postJson('/api/finance/2026-03/close', ['note' => 'Looked at it'])
            ->assertCreated();

        $m = $this->month('2026-03');

        $this->assertNotNull($m['closed']);
        $this->assertSame('Looked at it', $m['closed']['note']);
        // Closing is a review, not a lock: the figures are unchanged.
        $this->assertSame(100000, $m['income_minor']);
    }

    public function test_a_month_closed_twice_is_one_review_not_two(): void
    {
        $this->record('income', 100000, '2026-03-01');

        $this->actingAs($this->owner)->postJson('/api/finance/2026-03/close', ['note' => 'first']);
        $this->actingAs($this->owner)->postJson('/api/finance/2026-03/close', ['note' => 'second']);

        $this->assertSame(1, \Hisab\Accounts\Models\MonthClose::query()->count());
        $this->assertSame('second', $this->month('2026-03')['closed']['note']);
    }

    public function test_a_closed_month_still_accepts_records(): void
    {
        $this->record('income', 100000, '2026-03-01');
        $this->actingAs($this->owner)->postJson('/api/finance/2026-03/close');

        // Closing is deliberately not a lock. A receipt found in April belongs
        // in March, and refusing it would push it into the wrong month.
        $this->record('expense', 10000, '2026-03-15');

        $this->assertSame(10000, $this->month('2026-03')['expense_minor']);
    }

    public function test_reopening_removes_the_review_only(): void
    {
        $this->record('income', 100000, '2026-03-01');
        $this->actingAs($this->owner)->postJson('/api/finance/2026-03/close');
        $this->actingAs($this->owner)->deleteJson('/api/finance/2026-03/close')->assertNoContent();

        $m = $this->month('2026-03');
        $this->assertNull($m['closed']);
        $this->assertSame(100000, $m['income_minor']);
    }

    // --------------------------------------------------------------- shape

    public function test_recurring_lines_are_labelled_not_guessed(): void
    {
        $this->record('expense', 18000, '2026-03-03', ['recurring' => 'Monthly', 'payee' => 'Rent']);
        $this->record('expense', 2000, '2026-03-04', ['payee' => 'One off']);

        $recurring = $this->month('2026-03')['recurring'];

        // Inferred recurrence offers to re-post things that were one-offs, and
        // accepting the offer invents a transaction.
        $this->assertCount(1, $recurring);
        $this->assertSame('Rent', $recurring[0]['payee']);
    }

    public function test_a_bad_month_key_is_422_not_404(): void
    {
        // 404 would read as "no such month" rather than "that is not a month".
        $this->actingAs($this->owner)->getJson('/api/finance/2026-13')->assertStatus(422);
        $this->actingAs($this->owner)->getJson('/api/finance/nonsense')->assertStatus(422);
    }

    public function test_the_cockpit_needs_a_session(): void
    {
        $this->getJson('/api/finance/2026-03')->assertUnauthorized();
        $this->getJson('/api/finance/settings')->assertUnauthorized();
    }
}
