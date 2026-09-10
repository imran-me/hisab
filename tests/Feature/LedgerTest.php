<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Categories\Models\Category;
use Hisab\Fx\Seeders\FxSeeder;
use Hisab\Ledger\Models\Transaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LedgerTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);
        $this->owner = User::query()->create([
            'name' => 'Owner',
            'email' => 'owner@example.test',
            'password' => Hash::make('a correct horse battery staple'),
        ]);
    }

    private function account(string $name, array $overrides = []): Account
    {
        return Account::query()->create(array_merge([
            'id' => strtoupper((string) \Illuminate\Support\Str::ulid()),
            'user_id' => $this->owner->id,
            'name' => $name,
            'type' => 'bank',
            'currency' => 'BDT',
            'book' => 'personal',
            'opening_balance_minor' => 0,
        ], $overrides));
    }

    private function category(string $type = 'expense'): Category
    {
        return Category::query()->where('user_id', $this->owner->id)->where('type', $type)->firstOrFail();
    }

    private function entry(array $payload)
    {
        return $this->actingAs($this->owner)->postJson('/api/ledger', $payload);
    }

    // ---------------------------------------------------------------- writing

    public function test_an_expense_writes_one_leg_going_out(): void
    {
        $account = $this->account('Cash');

        $row = $this->entry([
            'type' => 'expense',
            'account_id' => $account->id,
            'amount_minor' => 45000,
            'currency' => 'BDT',
            'category_id' => $this->category()->id,
            'occurred_on' => '2026-09-05',
        ])->assertCreated()->json('data');

        $this->assertSame('out', $row['direction']);
        $this->assertNull($row['group_id']);
        $this->assertSame(1, Transaction::query()->count());
    }

    public function test_a_transfer_always_writes_two_legs_sharing_a_group(): void
    {
        $from = $this->account('Cash');
        $to = $this->account('Bank');

        $body = $this->entry([
            'type' => 'transfer',
            'account_id' => $from->id,
            'to_account_id' => $to->id,
            'amount_minor' => 100000,
            'currency' => 'BDT',
            'occurred_on' => '2026-09-05',
        ])->assertCreated()->json();

        $legs = Transaction::query()->get();
        $this->assertCount(2, $legs);
        $this->assertCount(1, $legs->pluck('group_id')->unique());
        $this->assertNotNull($legs->first()->group_id);
        $this->assertEqualsCanonicalizing(['in', 'out'], $legs->pluck('direction')->all());
        $this->assertCount(2, $body['meta']['legs']);
    }

    public function test_a_transfer_carries_no_category_on_either_leg(): void
    {
        $from = $this->account('Cash');
        $to = $this->account('Bank');

        $this->entry([
            'type' => 'transfer',
            'account_id' => $from->id,
            'to_account_id' => $to->id,
            'amount_minor' => 100000,
            'currency' => 'BDT',
            'category_id' => $this->category()->id,
            'occurred_on' => '2026-09-05',
        ])->assertCreated();

        // Moving your own money is not spending. A category here would put
        // transfers into the spending breakdown.
        $this->assertSame(0, Transaction::query()->whereNotNull('category_id')->count());
    }

    public function test_a_transfer_needs_somewhere_to_go(): void
    {
        $account = $this->account('Cash');

        $this->entry([
            'type' => 'transfer',
            'account_id' => $account->id,
            'amount_minor' => 100000,
            'currency' => 'BDT',
            'occurred_on' => '2026-09-05',
        ])->assertStatus(422)->assertJsonValidationErrors('to_account_id');

        $this->assertSame(0, Transaction::query()->count());
    }

    public function test_money_cannot_be_transferred_to_the_account_it_came_from(): void
    {
        $account = $this->account('Cash');

        $this->entry([
            'type' => 'transfer',
            'account_id' => $account->id,
            'to_account_id' => $account->id,
            'amount_minor' => 100000,
            'currency' => 'BDT',
            'occurred_on' => '2026-09-05',
        ])->assertStatus(422)->assertJsonValidationErrors('to_account_id');
    }

    public function test_a_deposit_pairs_only_when_the_destination_is_tracked(): void
    {
        $cash = $this->account('Cash');
        $dps = $this->account('DPS', ['type' => 'savings']);

        // Into an account you track: two legs.
        $this->entry([
            'type' => 'deposit', 'account_id' => $cash->id, 'to_account_id' => $dps->id,
            'amount_minor' => 500000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05',
        ])->assertCreated();
        $this->assertSame(2, Transaction::query()->count());

        // Into one you do not: a single leg, because there is nowhere to land.
        $this->entry([
            'type' => 'deposit', 'account_id' => $cash->id,
            'amount_minor' => 300000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05',
        ])->assertCreated();
        $this->assertSame(3, Transaction::query()->count());
    }

    public function test_the_client_cannot_post_a_direction_or_a_group(): void
    {
        $account = $this->account('Cash');

        $row = $this->entry([
            'type' => 'expense',
            'account_id' => $account->id,
            'amount_minor' => 45000,
            'currency' => 'BDT',
            'occurred_on' => '2026-09-05',
            // Both derived server-side. A client that can post a direction can
            // post an `in` leg for an expense and quietly add money to its ledger.
            'direction' => 'in',
            'group_id' => 'FORGED',
        ])->assertCreated()->json('data');

        $this->assertSame('out', $row['direction']);
        $this->assertNull($row['group_id']);
    }

    public function test_an_amount_of_zero_is_not_a_transaction(): void
    {
        $account = $this->account('Cash');

        $this->entry([
            'type' => 'expense', 'account_id' => $account->id,
            'amount_minor' => 0, 'currency' => 'BDT', 'occurred_on' => '2026-09-05',
        ])->assertStatus(422)->assertJsonValidationErrors('amount_minor');
    }

    public function test_another_owners_account_cannot_be_written_to(): void
    {
        $stranger = User::query()->create([
            'name' => 'Them', 'email' => 'them@example.test', 'password' => Hash::make('x'),
        ]);
        $theirs = Account::query()->create([
            'id' => strtoupper((string) \Illuminate\Support\Str::ulid()),
            'user_id' => $stranger->id, 'name' => 'Theirs', 'type' => 'bank',
            'currency' => 'BDT', 'book' => 'personal', 'opening_balance_minor' => 0,
        ]);

        $this->entry([
            'type' => 'expense', 'account_id' => $theirs->id,
            'amount_minor' => 1000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05',
        ])->assertStatus(422)->assertJsonValidationErrors('account_id');
    }

    // ------------------------------------------------------------- snapshots

    public function test_the_category_name_is_snapshotted_so_a_rename_cannot_rewrite_history(): void
    {
        $account = $this->account('Cash');
        $category = $this->category();

        $id = $this->entry([
            'type' => 'expense', 'account_id' => $account->id,
            'amount_minor' => 45000, 'currency' => 'BDT',
            'category_id' => $category->id, 'occurred_on' => '2026-09-05',
        ])->json('data.id');

        $original = $category->label;
        $category->update(['label' => 'Something else entirely']);

        // Last year's report must still say what it said.
        $this->assertSame($original, Transaction::query()->find($id)->category_label);
    }

    public function test_the_necessity_band_comes_from_the_category(): void
    {
        $account = $this->account('Cash');
        $category = Category::query()
            ->where('user_id', $this->owner->id)->where('type', 'expense')
            ->whereNotNull('necessity')->firstOrFail();

        $row = $this->entry([
            'type' => 'expense', 'account_id' => $account->id,
            'amount_minor' => 45000, 'currency' => 'BDT',
            'category_id' => $category->id, 'occurred_on' => '2026-09-05',
        ])->json('data');

        $this->assertSame($category->necessity, $row['necessity']);
    }

    public function test_income_never_carries_a_necessity_band(): void
    {
        $account = $this->account('Cash');

        $row = $this->entry([
            'type' => 'income', 'account_id' => $account->id,
            'amount_minor' => 45000, 'currency' => 'BDT',
            'necessity' => 1, 'occurred_on' => '2026-09-05',
        ])->json('data');

        // There is no sense in which receiving a salary was avoidable.
        $this->assertNull($row['necessity']);
        $this->assertSame('in', $row['direction']);
    }

    // -------------------------------------------------------------- balances

    public function test_a_balance_is_opening_plus_in_minus_out(): void
    {
        $account = $this->account('Cash', ['opening_balance_minor' => 100000]);

        $this->entry(['type' => 'income', 'account_id' => $account->id,
            'amount_minor' => 50000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);
        $this->entry(['type' => 'expense', 'account_id' => $account->id,
            'amount_minor' => 20000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);

        $balances = $this->actingAs($this->owner)->getJson('/api/ledger/balances')
            ->assertOk()->json('data');

        $this->assertSame(130000, $balances[$account->id]);
    }

    public function test_a_transfer_moves_a_balance_even_though_it_is_in_no_total(): void
    {
        $from = $this->account('Cash', ['opening_balance_minor' => 100000]);
        $to = $this->account('Bank', ['opening_balance_minor' => 0]);

        $this->entry([
            'type' => 'transfer', 'account_id' => $from->id, 'to_account_id' => $to->id,
            'amount_minor' => 40000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05',
        ])->assertCreated();

        $balances = $this->actingAs($this->owner)->getJson('/api/ledger/balances')->json('data');

        // Excluding transfers from the balance would leave the money in both
        // accounts at once.
        $this->assertSame(60000, $balances[$from->id]);
        $this->assertSame(40000, $balances[$to->id]);
    }

    // --------------------------------------------------------------- summary

    public function test_a_deposit_is_counted_once_and_is_not_an_expense(): void
    {
        $cash = $this->account('Cash');
        $dps = $this->account('DPS', ['type' => 'savings']);

        $this->entry(['type' => 'income', 'account_id' => $cash->id,
            'amount_minor' => 1000000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);
        $this->entry(['type' => 'expense', 'account_id' => $cash->id,
            'amount_minor' => 300000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);
        // Two legs. Summing both would double every savings figure.
        $this->entry(['type' => 'deposit', 'account_id' => $cash->id, 'to_account_id' => $dps->id,
            'amount_minor' => 200000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);

        $summary = $this->actingAs($this->owner)
            ->getJson('/api/ledger/summary?period=2026-09')->assertOk()->json('data');

        $this->assertSame(1000000, $summary['income_minor']);
        // The deposit must NOT have landed in here.
        $this->assertSame(300000, $summary['expense_minor']);
        $this->assertSame(200000, $summary['deposit_minor']);
        // Income less spending less what was moved out of reach.
        $this->assertSame(500000, $summary['spendable_minor']);
    }

    public function test_a_transfer_is_in_no_total_at_all(): void
    {
        $from = $this->account('Cash');
        $to = $this->account('Bank');

        $this->entry(['type' => 'transfer', 'account_id' => $from->id, 'to_account_id' => $to->id,
            'amount_minor' => 900000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);

        $summary = $this->actingAs($this->owner)
            ->getJson('/api/ledger/summary?period=2026-09')->json('data');

        // Including it inflates both sides by the same amount, which leaves the
        // difference right and the savings rate meaningless.
        $this->assertSame(0, $summary['income_minor']);
        $this->assertSame(0, $summary['expense_minor']);
        $this->assertSame(0, $summary['deposit_minor']);
    }

    // -------------------------------------------------------- editing, pairs

    public function test_correcting_an_entry_reverses_it_rather_than_editing_it(): void
    {
        $account = $this->account("Cash", ["opening_balance_minor" => 0]);

        $id = $this->entry([
            "type" => "expense", "account_id" => $account->id,
            "amount_minor" => 45000, "currency" => "BDT", "occurred_on" => "2026-09-05",
        ])->json("data.id");

        $this->actingAs($this->owner)
            ->patchJson("/api/ledger/{$id}", ["amount_minor" => 4500, "reason" => "Typo"])
            ->assertOk();

        // Three rows: the original, its mirror, and the replacement. The
        // original is untouched - that is the whole point.
        $this->assertSame(3, Transaction::query()->count());
        $this->assertSame(45000, Transaction::query()->find($id)->amount_minor);

        $mirror = Transaction::query()->where("reverses_id", $id)->firstOrFail();
        $this->assertSame("in", $mirror->direction);   // opposite of the original
        $this->assertSame(45000, $mirror->amount_minor);
        $this->assertSame("Typo", $mirror->reversal_reason);

        $replacement = Transaction::query()->where("corrects_id", $id)->firstOrFail();
        $this->assertSame(4500, $replacement->amount_minor);

        // The balance reflects only the corrected figure: original and mirror
        // cancel exactly.
        $balances = $this->actingAs($this->owner)->getJson("/api/ledger/balances")->json("data");
        $this->assertSame(-4500, $balances[$account->id]);
    }

    public function test_the_list_shows_only_what_still_stands(): void
    {
        $account = $this->account("Cash");
        $id = $this->entry([
            "type" => "expense", "account_id" => $account->id,
            "amount_minor" => 45000, "currency" => "BDT", "occurred_on" => "2026-09-05",
        ])->json("data.id");

        $this->actingAs($this->owner)->patchJson("/api/ledger/{$id}", ["amount_minor" => 4500]);

        // One row, not three - a ledger where every fixed typo takes three lines
        // is one nobody can read.
        $rows = $this->actingAs($this->owner)->getJson("/api/ledger")->json("data");
        $this->assertCount(1, $rows);
        $this->assertSame(4500, $rows[0]["amount_minor"]);

        // Nothing is hidden from someone who asks.
        $all = $this->actingAs($this->owner)->getJson("/api/ledger?include_reversed=1")->json("data");
        $this->assertCount(3, $all);
    }

    public function test_a_reversal_nets_the_totals_to_the_corrected_figure(): void
    {
        $account = $this->account("Cash");
        $id = $this->entry([
            "type" => "expense", "account_id" => $account->id,
            "amount_minor" => 45000, "currency" => "BDT", "occurred_on" => "2026-09-05",
        ])->json("data.id");

        $this->actingAs($this->owner)->patchJson("/api/ledger/{$id}", ["amount_minor" => 4500]);

        // The mirror is dated today, so ask over a range covering both.
        $summary = $this->actingAs($this->owner)
            ->getJson("/api/ledger/summary?from=2026-01-01&to=2099-12-31")->json("data");

        // 45000 out, 45000 back as the mirror, 4500 out again.
        $this->assertSame(4500, $summary["expense_minor"]);
    }

    public function test_deleting_reverses_instead_of_destroying(): void
    {
        $account = $this->account("Cash");
        $id = $this->entry([
            "type" => "expense", "account_id" => $account->id,
            "amount_minor" => 45000, "currency" => "BDT", "occurred_on" => "2026-09-05",
        ])->json("data.id");

        $this->actingAs($this->owner)->deleteJson("/api/ledger/{$id}")->assertCreated();

        // The row survives. Nothing in this app removes a recorded entry.
        $this->assertDatabaseHas("transactions", ["id" => $id]);
        $this->assertSame(2, Transaction::query()->count());

        $balances = $this->actingAs($this->owner)->getJson("/api/ledger/balances")->json("data");
        $this->assertSame(0, $balances[$account->id]);
    }

    public function test_reversing_a_transfer_mirrors_both_legs(): void
    {
        $from = $this->account("Cash", ["opening_balance_minor" => 100000]);
        $to = $this->account("Bank");

        $id = $this->entry([
            "type" => "transfer", "account_id" => $from->id, "to_account_id" => $to->id,
            "amount_minor" => 40000, "currency" => "BDT", "occurred_on" => "2026-09-05",
        ])->json("data.id");

        $this->actingAs($this->owner)
            ->postJson("/api/ledger/{$id}/reverse", ["reason" => "Wrong account"])
            ->assertCreated();

        // Two originals plus two mirrors. Half a reversal is money that left one
        // account and arrived nowhere.
        $this->assertSame(4, Transaction::query()->count());
        $this->assertSame(2, Transaction::query()->whereNotNull("reverses_id")->count());

        $balances = $this->actingAs($this->owner)->getJson("/api/ledger/balances")->json("data");
        $this->assertSame(100000, $balances[$from->id]);
        $this->assertSame(0, $balances[$to->id]);
    }

    public function test_an_entry_cannot_be_reversed_twice(): void
    {
        $account = $this->account("Cash");
        $id = $this->entry([
            "type" => "expense", "account_id" => $account->id,
            "amount_minor" => 45000, "currency" => "BDT", "occurred_on" => "2026-09-05",
        ])->json("data.id");

        $this->actingAs($this->owner)->postJson("/api/ledger/{$id}/reverse")->assertCreated();

        // A second mirror would take the balance the other way and read as a
        // real transaction.
        $this->actingAs($this->owner)->postJson("/api/ledger/{$id}/reverse")->assertStatus(409);
    }

    public function test_the_mirror_is_dated_today_not_backdated(): void
    {
        $account = $this->account("Cash");
        $id = $this->entry([
            "type" => "expense", "account_id" => $account->id,
            "amount_minor" => 45000, "currency" => "BDT", "occurred_on" => "2026-01-05",
        ])->json("data.id");

        $this->actingAs($this->owner)->postJson("/api/ledger/{$id}/reverse");

        // Backdating it would change a month already looked at, which is the
        // thing this whole rule exists to prevent.
        $mirror = Transaction::query()->where("reverses_id", $id)->firstOrFail();
        $this->assertSame(now()->toDateString(), $mirror->occurred_on);
        $this->assertNotSame("2026-01-05", $mirror->occurred_on);
    }

    public function test_an_account_with_transactions_cannot_be_deleted(): void
    {
        $account = $this->account('Cash');
        $this->entry(['type' => 'expense', 'account_id' => $account->id,
            'amount_minor' => 1000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05']);

        // 409 carrying the count, so the client can offer archiving instead.
        $this->actingAs($this->owner)->deleteJson("/api/accounts/{$account->id}")
            ->assertStatus(409);
    }

    // --------------------------------------------------------------- reading

    public function test_the_list_is_filtered_and_cursor_paginated(): void
    {
        $account = $this->account('Cash');

        foreach (range(1, 5) as $i) {
            $this->entry(['type' => 'expense', 'account_id' => $account->id,
                'amount_minor' => $i * 1000, 'currency' => 'BDT',
                'payee' => "Shop {$i}", 'occurred_on' => '2026-09-0'.$i]);
        }

        $first = $this->actingAs($this->owner)->getJson('/api/ledger?limit=2')->assertOk()->json();
        $this->assertCount(2, $first['data']);
        $this->assertTrue($first['meta']['has_more']);

        $next = $this->actingAs($this->owner)
            ->getJson('/api/ledger?limit=2&after='.$first['meta']['next_cursor'])->json();

        // No overlap between pages.
        $this->assertEmpty(array_intersect(
            array_column($first['data'], 'id'),
            array_column($next['data'], 'id'),
        ));
    }

    public function test_the_list_can_be_searched_and_filtered_by_period(): void
    {
        $account = $this->account('Cash');

        $this->entry(['type' => 'expense', 'account_id' => $account->id, 'amount_minor' => 1000,
            'currency' => 'BDT', 'payee' => 'Shwapno', 'occurred_on' => '2026-09-05']);
        $this->entry(['type' => 'expense', 'account_id' => $account->id, 'amount_minor' => 2000,
            'currency' => 'BDT', 'payee' => 'Agora', 'occurred_on' => '2026-08-05']);

        $this->actingAs($this->owner)->getJson('/api/ledger?period=2026-09')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.payee', 'Shwapno');

        $this->actingAs($this->owner)->getJson('/api/ledger?q=Agora')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.payee', 'Agora');
    }

    public function test_someone_elses_transaction_is_404(): void
    {
        $account = $this->account('Cash');
        $id = $this->entry(['type' => 'expense', 'account_id' => $account->id,
            'amount_minor' => 1000, 'currency' => 'BDT', 'occurred_on' => '2026-09-05'])->json('data.id');

        $stranger = User::query()->create([
            'name' => 'Them', 'email' => 'them@example.test', 'password' => Hash::make('x'),
        ]);

        $this->actingAs($stranger)->deleteJson("/api/ledger/{$id}")->assertNotFound();
    }

    public function test_the_ledger_needs_a_session(): void
    {
        $this->getJson('/api/ledger')->assertUnauthorized();
        $this->getJson('/api/ledger/balances')->assertUnauthorized();
    }
}
