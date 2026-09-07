<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Fx\Seeders\FxSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AccountsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Currencies must exist before an account can reference one.
        $this->seed(FxSeeder::class);
    }

    private function owner(string $email = 'owner@example.test'): User
    {
        return User::query()->create([
            'name' => 'Owner',
            'email' => $email,
            'password' => Hash::make('a correct horse battery staple'),
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'bKash personal',
            'type' => 'mfs',
            'currency' => 'BDT',
        ], $overrides);
    }

    public function test_a_new_owner_starts_with_the_seeded_accounts(): void
    {
        $owner = $this->owner();

        $body = $this->actingAs($owner)->getJson('/api/accounts')->assertOk();

        $this->assertNotEmpty($body->json('data'));
        // api-contract.md §2: an object with meta, never a bare array.
        $this->assertIsInt($body->json('meta.total'));
    }

    public function test_the_list_never_carries_a_balance(): void
    {
        $owner = $this->owner();

        $row = $this->actingAs($owner)->getJson('/api/accounts')->json('data.0');

        // Balances are derived and served by the ledger, so there is exactly one
        // implementation of that sum. A `balance` appearing here would be a
        // second one, and one of the two would be wrong first.
        $this->assertArrayNotHasKey('balance', $row);
        $this->assertArrayNotHasKey('balance_minor', $row);
        $this->assertArrayNotHasKey('available', $row);
    }

    public function test_the_client_may_mint_the_id(): void
    {
        $owner = $this->owner();
        $id = strtoupper((string) Str::ulid());

        // The frontend mints ids so a record created offline has its final
        // identity immediately - no temporary key to reconcile on sync.
        $this->actingAs($owner)->postJson('/api/accounts', $this->payload(['id' => $id]))
            ->assertCreated()->assertJsonPath('data.id', $id);
    }

    public function test_a_client_cannot_overwrite_an_existing_row_by_reusing_its_id(): void
    {
        $owner = $this->owner();
        $id = strtoupper((string) Str::ulid());

        $this->actingAs($owner)->postJson('/api/accounts', $this->payload(['id' => $id]))->assertCreated();

        $this->actingAs($owner)->postJson('/api/accounts', $this->payload(['id' => $id, 'name' => 'Hijack']))
            ->assertStatus(422)->assertJsonValidationErrors('id');
    }

    public function test_a_malformed_id_is_rejected(): void
    {
        $owner = $this->owner();

        foreach (['not-a-ulid', '0000000000000000000000000I', 'short'] as $bad) {
            $this->actingAs($owner)->postJson('/api/accounts', $this->payload(['id' => $bad]))
                ->assertStatus(422)->assertJsonValidationErrors('id');
        }
    }

    public function test_a_derived_figure_cannot_be_posted(): void
    {
        $owner = $this->owner();

        $row = $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'balance_minor' => 999999,
            'available' => 12345,
        ]))->assertCreated()->json('data');

        // The fields do not exist on the request, so they are dropped rather
        // than stored. A ledger that trusts a posted balance can be edited into
        // anything.
        $this->assertArrayNotHasKey('balance_minor', $row);
        $this->assertDatabaseMissing('accounts', ['id' => $row['id'], 'name' => 'nonsense']);
    }

    public function test_a_credit_limit_is_kept_only_on_a_card(): void
    {
        $owner = $this->owner();

        $card = $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'name' => 'Visa', 'type' => 'card', 'credit_limit_minor' => 5000000,
        ]))->assertCreated()->json('data');

        $this->assertSame(5000000, $card['credit_limit_minor']);

        // Sent on a savings account it is nulled rather than rejected - the
        // client submits one form for every type.
        $savings = $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'name' => 'DPS', 'type' => 'savings', 'credit_limit_minor' => 5000000,
        ]))->assertCreated()->json('data');

        $this->assertNull($savings['credit_limit_minor']);
    }

    public function test_only_one_account_is_default_per_book(): void
    {
        $owner = $this->owner();

        $first = $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'name' => 'First', 'is_default' => true,
        ]))->json('data');

        $second = $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'name' => 'Second', 'is_default' => true,
        ]))->json('data');

        $this->assertTrue($second['is_default']);
        $this->assertFalse((bool) Account::query()->find($first['id'])->is_default);
    }

    public function test_the_currency_and_book_cannot_be_changed(): void
    {
        $owner = $this->owner();
        $account = $this->actingAs($owner)->postJson('/api/accounts', $this->payload())->json('data');

        $updated = $this->actingAs($owner)->patchJson("/api/accounts/{$account['id']}", [
            'name' => 'Renamed',
            'currency' => 'USD',
            'book' => 'business',
        ])->assertOk()->json('data');

        $this->assertSame('Renamed', $updated['name']);
        // Changing the currency would reinterpret every amount on the account at
        // once - 500 poisha silently becoming 500 fils - and the ledger would
        // still add up, which is what makes it dangerous.
        $this->assertSame('BDT', $updated['currency']);
        $this->assertSame('personal', $updated['book']);
    }

    public function test_archiving_clears_the_default_flag(): void
    {
        $owner = $this->owner();
        $account = $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'is_default' => true,
        ]))->json('data');

        $updated = $this->actingAs($owner)
            ->patchJson("/api/accounts/{$account['id']}", ['archived' => true])
            ->assertOk()->json('data');

        $this->assertNotNull($updated['archived_at']);
        // Otherwise the entry sheet opens on an account that is not in its own
        // picker any more.
        $this->assertFalse($updated['is_default']);
    }

    public function test_an_archived_account_is_out_of_the_list_unless_asked_for(): void
    {
        $owner = $this->owner();
        $account = $this->actingAs($owner)->postJson('/api/accounts', $this->payload())->json('data');
        $this->actingAs($owner)->patchJson("/api/accounts/{$account['id']}", ['archived' => true]);

        $active = collect($this->actingAs($owner)->getJson('/api/accounts')->json('data'));
        $this->assertNull($active->firstWhere('id', $account['id']));

        $all = collect($this->actingAs($owner)->getJson('/api/accounts?include_archived=1')->json('data'));
        $this->assertNotNull($all->firstWhere('id', $account['id']));

        // And restoring is the same field in the other direction.
        $this->actingAs($owner)->patchJson("/api/accounts/{$account['id']}", ['archived' => false])
            ->assertOk()->assertJsonPath('data.archived_at', null);
    }

    public function test_an_unreferenced_account_can_be_deleted(): void
    {
        $owner = $this->owner();
        $account = $this->actingAs($owner)->postJson('/api/accounts', $this->payload())->json('data');

        $this->actingAs($owner)->deleteJson("/api/accounts/{$account['id']}")->assertNoContent();
        $this->assertDatabaseMissing('accounts', ['id' => $account['id']]);
    }

    public function test_someone_elses_account_is_404_and_not_403(): void
    {
        $mine = $this->owner('me@example.test');
        $theirs = $this->owner('them@example.test');

        $account = $this->actingAs($theirs)->postJson('/api/accounts', $this->payload())->json('data');

        $this->actingAs($mine)->getJson("/api/accounts/{$account['id']}")->assertNotFound();
        $this->actingAs($mine)->patchJson("/api/accounts/{$account['id']}", ['name' => 'Mine'])->assertNotFound();
        $this->actingAs($mine)->deleteJson("/api/accounts/{$account['id']}")->assertNotFound();
    }

    public function test_accounts_need_a_session(): void
    {
        $this->getJson('/api/accounts')->assertUnauthorized();
        $this->postJson('/api/accounts', $this->payload())->assertUnauthorized();
    }

    public function test_an_unknown_currency_or_type_is_rejected(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner)->postJson('/api/accounts', $this->payload(['currency' => 'ZZZ']))
            ->assertStatus(422)->assertJsonValidationErrors('currency');

        $this->actingAs($owner)->postJson('/api/accounts', $this->payload(['type' => 'crypto']))
            ->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_an_account_can_open_overdrawn(): void
    {
        $owner = $this->owner();

        // A card almost always does, and rejecting a negative opening balance
        // would make it impossible to record one honestly.
        $this->actingAs($owner)->postJson('/api/accounts', $this->payload([
            'name' => 'Visa', 'type' => 'card', 'opening_balance_minor' => -1250000,
        ]))->assertCreated()->assertJsonPath('data.opening_balance_minor', -1250000);
    }
}
