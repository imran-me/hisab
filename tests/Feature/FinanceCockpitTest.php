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

    public function test_the_reclaimable_slice_is_avoidable_plus_half_of_discretionary(): void
    {
        $this->record('expense', 40000, '2026-03-05', ['necessity' => 4]);   // avoidable
        $this->record('expense', 20000, '2026-03-06', ['necessity' => 3]);   // discretionary
        $this->record('expense', 90000, '2026-03-07', ['necessity' => 1]);   // essential
        $this->record('expense', 50000, '2026-03-08');                        // untagged

        // Not all of the discretionary: a figure assuming every meal out could
        // simply not have happened is true and useless, because nobody reclaims
        // it. And untagged money is not in it - it has not been judged.
        $this->assertSame(50000, $this->month('2026-03')['leak_minor']);
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

    // ------------------------------------------------ what the tabs are drawn from

    public function test_the_month_carries_its_own_rows(): void
    {
        $this->record('expense', 40000, '2026-03-05', ['payee' => 'Bazar', 'necessity' => 1]);

        $rows = $this->month('2026-03')['rows'];

        // The ledger tab draws from these rather than asking again, so anything
        // it needs to render has to be in the shape - the omission that showed
        // every row as "—" once already.
        $this->assertCount(1, $rows);
        $this->assertSame('Bazar', $rows[0]['payee']);
        $this->assertSame(1, $rows[0]['necessity']);
        $this->assertArrayHasKey('reverses_id', $rows[0]);
    }

    public function test_the_row_shape_does_not_leak_the_whole_table(): void
    {
        $this->record('expense', 40000, '2026-03-05');

        // Explicit, so the next column added to `transactions` does not appear
        // in the API by itself.
        $this->assertArrayNotHasKey('fx_rate', $this->month('2026-03')['rows'][0]);
        $this->assertArrayNotHasKey('user_id', $this->month('2026-03')['rows'][0]);
    }

    public function test_the_calendar_totals_a_day_by_flow(): void
    {
        $this->record('income', 100000, '2026-03-05');
        $this->record('expense', 30000, '2026-03-05');
        $this->record('deposit', 20000, '2026-03-05');
        $this->record('expense', 5000, '2026-03-06');

        $days = $this->month('2026-03')['days'];

        $this->assertSame(100000, $days['2026-03-05']['in']);
        $this->assertSame(30000, $days['2026-03-05']['out']);
        $this->assertSame(20000, $days['2026-03-05']['dep']);
        $this->assertSame(3, $days['2026-03-05']['n']);
        $this->assertSame(5000, $days['2026-03-06']['out']);
    }

    public function test_a_reversal_subtracts_from_its_day_rather_than_adding(): void
    {
        $this->record('expense', 40000, '2026-03-05');

        $expense = \Hisab\Ledger\Models\Transaction::query()->where('type', 'expense')->firstOrFail();
        $this->actingAs($this->owner)->postJson("/api/ledger/{$expense->id}/reverse")->assertCreated();

        // The mirror is dated today. Grouping the rows in the browser would have
        // to know a reversal subtracts, and the day it forgets is the day the
        // heatmap shows a spike that was actually a correction.
        $today = now()->toDateString();
        $days = $this->month(now()->format('Y-m'))['days'];

        $this->assertSame(-40000, $days[$today]['out']);
    }

    public function test_the_necessity_mix_leaves_untagged_money_out(): void
    {
        $this->record('expense', 40000, '2026-03-05', ['necessity' => 1]);
        $this->record('expense', 20000, '2026-03-06', ['necessity' => 4]);
        $this->record('expense', 50000, '2026-03-07');

        $m = $this->month('2026-03');

        $this->assertSame(40000, $m['by_need']['1']);
        $this->assertSame(20000, $m['by_need']['4']);
        $this->assertSame(50000, $m['untagged_minor']);
    }

    public function test_the_soft_bands_and_the_reclaimable_slice_are_different_numbers(): void
    {
        $this->record('expense', 40000, '2026-03-05', ['necessity' => 4]);   // avoidable
        $this->record('expense', 20000, '2026-03-06', ['necessity' => 3]);   // discretionary

        $m = $this->month('2026-03');

        // What sat in those bands…
        $this->assertSame(60000, $m['soft_spend_minor']);
        // …and the slice of it anyone would actually reclaim. Stating one as the
        // other turns a target into fiction.
        $this->assertSame(50000, $m['leak_minor']);
    }

    public function test_sectors_and_methods_are_kept_per_flow(): void
    {
        $this->record('income', 100000, '2026-03-01', ['method' => 'bank']);
        $this->record('expense', 30000, '2026-03-02', ['method' => 'bank']);

        $m = $this->month('2026-03');

        // Merged, 'bank' would read 130,000 - a figure that is neither what was
        // earned nor what was spent, and looks perfectly reasonable.
        $this->assertSame([['bank', 100000]], $m['methods']['in']);
        $this->assertSame([['bank', 30000]], $m['methods']['out']);
    }

    public function test_a_category_reversed_to_nothing_is_not_a_bar_of_zero(): void
    {
        $this->record('expense', 40000, '2026-03-05', ['payee' => 'Gadget']);

        $expense = \Hisab\Ledger\Models\Transaction::query()->where('type', 'expense')->firstOrFail();
        $this->actingAs($this->owner)->postJson("/api/ledger/{$expense->id}/reverse")->assertCreated();

        // A zero-length bar under a real category name reads as "we spent
        // nothing on this" rather than "this did not happen".
        $this->assertSame([], $this->month(now()->format('Y-m'))['sectors']['expense']);
    }

    public function test_insights_are_decisions_with_figures_not_sentences(): void
    {
        $this->record('income', 100000, '2026-03-01');
        $this->record('expense', 20000, '2026-03-02', ['necessity' => 4]);

        $codes = array_column($this->month('2026-03')['insights'], 'code');

        // The server decides WHICH observations are worth making; the wording
        // lives with the rest of the wording, in the client. No HTML crosses.
        $this->assertContains('kept_strong', $codes);
        $this->assertContains('soft_spend', $codes);

        foreach ($this->month('2026-03')['insights'] as $insight) {
            $this->assertStringNotContainsString('<', json_encode($insight));
        }
    }

    public function test_an_empty_month_says_so_once_rather_than_six_times(): void
    {
        $insights = $this->month('2026-03')['insights'];

        $this->assertCount(1, $insights);
        $this->assertSame('empty', $insights[0]['code']);
    }

    // --------------------------------------------------------------- archive

    public function test_the_archive_replays_every_month_in_order(): void
    {
        $this->record('income', 100000, '2026-01-10');
        $this->record('expense', 40000, '2026-01-11');   // January nets +60,000
        $this->record('expense', 10000, '2026-02-05');

        $data = $this->actingAs($this->owner)->getJson('/api/finance/archive')->assertOk()->json('data');
        $months = collect($data['months'])->keyBy('month');

        // Newest first, the way an archive is read.
        $this->assertSame('2026-02', $data['months'][0]['month']);
        $this->assertSame(0, $months['2026-01']['opening_minor']);
        $this->assertSame(60000, $months['2026-01']['closing_minor']);
        $this->assertSame(60000, $months['2026-02']['opening_minor']);
        $this->assertSame(50000, $months['2026-02']['closing_minor']);
    }

    public function test_the_archive_agrees_with_the_month_it_summarises(): void
    {
        $this->record('income', 100000, '2026-01-10');
        $this->record('deposit', 25000, '2026-01-12');
        $this->record('expense', 40000, '2026-02-05', ['necessity' => 1]);

        $archive = collect(
            $this->actingAs($this->owner)->getJson('/api/finance/archive')->json('data.months'),
        )->keyBy('month');

        // Two code paths, one answer. They compute the same figures differently
        // - one month at a time versus one pass over everything - and the day
        // they disagree is the day the archive quietly rewrites history.
        foreach (['2026-01', '2026-02'] as $key) {
            $month = $this->month($key);

            foreach (['opening_minor', 'closing_minor', 'income_minor',
                'deposit_minor', 'expense_minor', 'net_minor', 'vault_minor', 'count'] as $field) {
                $this->assertSame($month[$field], $archive[$key][$field], "{$key}.{$field}");
            }

            $this->assertSame($month['quality']['grade'], $archive[$key]['quality']['grade'], "{$key}.grade");
        }
    }

    public function test_lifetime_balance_is_what_is_in_hand_not_a_sum_of_closings(): void
    {
        $this->record('income', 100000, '2026-01-10');
        $this->record('income', 50000, '2026-02-10');

        $life = $this->actingAs($this->owner)->getJson('/api/finance/archive')->json('data.lifetime');

        // Summing the closings gives 250,000: January's leftover counted again
        // in February because it was carried through.
        $this->assertSame(150000, $life['balance_minor']);
        $this->assertSame(150000, $life['income_minor']);
        $this->assertSame(2, $life['months']);
    }

    public function test_the_average_spend_skips_months_with_no_spending(): void
    {
        $this->record('income', 100000, '2026-01-10');   // a month with no spending
        $this->record('expense', 60000, '2026-02-10');

        $life = $this->actingAs($this->owner)->getJson('/api/finance/archive')->json('data.lifetime');

        // Over both months it would read 30,000 - an average dragged down by a
        // month that was never spent in.
        $this->assertSame(60000, $life['avg_expense_minor']);
    }

    // ------------------------------------------------------ one book, one answer

    public function test_the_cockpit_and_the_ledger_summary_agree_for_every_book(): void
    {
        // The demo data carries a business book beside the personal one, which
        // is exactly the case that disagreed: ৳88,611 of September income on
        // Home and ৳259,473 here, because this added the client invoices in.
        $this->actingAs($this->owner)->postJson('/api/ledger/demo', ['months' => 3])->assertOk();

        $months = [now()->format('Y-m'), now()->subMonthNoOverflow()->format('Y-m')];
        $compared = 0;

        foreach (['personal', 'business'] as $book) {
            foreach ($months as $key) {
                $cockpit = $this->actingAs($this->owner)
                    ->getJson("/api/finance/{$key}?book={$book}")->assertOk()->json('data');
                $summary = $this->actingAs($this->owner)
                    ->getJson("/api/ledger/summary?book={$book}&period={$key}")->assertOk()->json('data');

                $this->assertSame($book, $cockpit['book']);

                // The ledger summary does not convert yet (Track B), so it is
                // only a reference for a month held in one currency. A month
                // with a dollar row is pinned by the conversion tests below.
                if ($summary['currencies'] !== ['BDT']) {
                    continue;
                }
                $compared++;

                $this->assertSame($summary['income_minor'], $cockpit['income_minor'], "{$book} {$key} income");
                $this->assertSame($summary['expense_minor'], $cockpit['expense_minor'], "{$book} {$key} spent");
                $this->assertSame($summary['deposit_minor'], $cockpit['deposit_minor'], "{$book} {$key} deposited");
                $this->assertSame($summary['spendable_minor'], $cockpit['net_minor'], "{$book} {$key} in hand");
                $this->assertSame(
                    $summary['income_minor'] - $summary['expense_minor'],
                    $cockpit['kept_minor'],
                    "{$book} {$key} kept",
                );
            }
        }

        $this->assertGreaterThanOrEqual(2, $compared, 'the business book is BDT-only and must be compared');
    }

    // ------------------------------------------------------------ currencies

    private function usdAccount(): Account
    {
        return Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => 'Payoneer', 'type' => 'wallet', 'currency' => 'USD',
            'book' => 'personal', 'opening_balance_minor' => 0,
        ]);
    }

    public function test_a_dollar_row_is_converted_before_it_is_added(): void
    {
        $usd = $this->usdAccount();

        $this->record('income', 100000, '2026-09-05');                      // ৳1,000.00
        $this->record('income', 45000, '2026-09-06', [                      // $450.00
            'account_id' => $usd->id, 'currency' => 'USD',
        ]);

        $m = $this->month('2026-09');

        // $450 at the seeded 122.50 is ৳55,125.00. Adding the cents to the
        // poisha would have said ৳1,450.00.
        $this->assertSame('BDT', $m['currency']);
        $this->assertSame(100000 + 5512500, $m['income_minor']);
        $this->assertSame([], $m['unconverted']);
    }

    public function test_a_dollar_charge_rounds_half_away_from_zero(): void
    {
        $this->record('expense', 1299, '2026-09-10', ['currency' => 'USD']);  // $12.99 on a taka account

        // 1299 × 122.50 = 159,127.5 poisha, which rounds to 159,128 - and a
        // refund of the same size must round the same distance the other way.
        $this->assertSame(159128, $this->month('2026-09')['expense_minor']);
    }

    public function test_a_row_dated_before_every_rate_uses_the_first_rate_on_file(): void
    {
        $usd = $this->usdAccount();
        // The seed is dated 2026-09-01; an August payout still converts.
        $this->record('income', 10000, '2026-08-20', ['account_id' => $usd->id, 'currency' => 'USD']);

        $this->assertSame(1225000, $this->month('2026-08')['income_minor']);
    }

    public function test_a_currency_with_no_rate_is_named_not_counted_as_one(): void
    {
        $this->record('income', 100000, '2026-09-05');
        $this->record('income', 5000, '2026-09-06', ['currency' => 'EUR']);

        // No EUR/AED rate on file in either direction.
        $m = $this->actingAs($this->owner)->getJson('/api/finance/2026-09?currency=AED')->assertOk()->json('data');

        $this->assertSame('AED', $m['currency']);
        $this->assertSame(['EUR'], $m['unconverted']);
        // ৳1,000 at the inverse of 33.35 is AED 29.99 (2998.5 fils, half up).
        $this->assertSame(2999, $m['income_minor']);
    }

    public function test_the_archive_converts_the_same_way_as_the_month(): void
    {
        $usd = $this->usdAccount();
        $this->record('income', 100000, '2026-08-05');
        $this->record('income', 45000, '2026-08-06', ['account_id' => $usd->id, 'currency' => 'USD']);
        $this->record('expense', 1299, '2026-09-10', ['currency' => 'USD']);

        $archive = collect(
            $this->actingAs($this->owner)->getJson('/api/finance/archive')->json('data.months'),
        )->keyBy('month');

        foreach (['2026-08', '2026-09'] as $key) {
            $month = $this->month($key);
            foreach (['income_minor', 'expense_minor', 'opening_minor', 'closing_minor'] as $field) {
                $this->assertSame($month[$field], $archive[$key][$field], "{$key}.{$field}");
            }
        }
    }

    public function test_a_two_leg_deposit_leaves_the_next_opening_once(): void
    {
        $dps = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => 'DPS', 'type' => 'savings', 'currency' => 'BDT',
            'book' => 'personal', 'opening_balance_minor' => 0,
        ]);

        $this->record('income', 100000, '2026-08-01');
        $this->record('deposit', 20000, '2026-08-02', ['to_account_id' => $dps->id]);

        // In hand after August: 1,000 − 200, not 1,000 − 400.
        $this->assertSame(80000, $this->month('2026-08')['closing_minor']);
        $this->assertSame(80000, $this->month('2026-09')['opening_minor']);
    }

    public function test_an_unknown_book_is_422_not_a_month_of_zeros(): void
    {
        $this->actingAs($this->owner)->getJson('/api/finance/2026-03?book=persnal')->assertStatus(422);
        $this->actingAs($this->owner)->getJson('/api/finance/archive?book=persnal')->assertStatus(422);
    }

    public function test_the_cockpit_defaults_to_the_personal_book(): void
    {
        $shop = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => 'Shop', 'type' => 'bank', 'currency' => 'BDT',
            'book' => 'business', 'opening_balance_minor' => 0,
        ]);

        $this->record('income', 100000, '2026-03-01');
        app(LedgerWriter::class)->create($this->owner, [
            'type' => 'income', 'account_id' => $shop->id, 'amount_minor' => 900000,
            'currency' => 'BDT', 'occurred_on' => '2026-03-02', 'book' => 'business',
        ]);

        // A client invoice is not pocket money.
        $this->assertSame(100000, $this->month('2026-03')['income_minor']);
        $this->assertSame(1, $this->month('2026-03')['count']);

        $business = $this->actingAs($this->owner)
            ->getJson('/api/finance/2026-03?book=business')->assertOk()->json('data');
        $this->assertSame(900000, $business['income_minor']);

        $archive = $this->actingAs($this->owner)->getJson('/api/finance/archive')->json('data.lifetime');
        $this->assertSame(100000, $archive['income_minor']);
    }

    public function test_another_book_does_not_inherit_the_personal_opening_balance(): void
    {
        Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => 'Shop', 'type' => 'bank', 'currency' => 'BDT',
            'book' => 'business', 'opening_balance_minor' => 0,
        ]);
        $this->actingAs($this->owner)->patchJson('/api/finance/settings', ['opening_balance_minor' => 500000])->assertOk();

        $business = $this->actingAs($this->owner)
            ->getJson('/api/finance/2026-03?book=business')->assertOk()->json('data');

        $this->assertSame(0, $business['opening_minor']);
        $this->assertSame(500000, $this->month('2026-03')['opening_minor']);
    }

    public function test_the_archive_needs_a_session(): void
    {
        $this->getJson('/api/finance/archive')->assertUnauthorized();
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
