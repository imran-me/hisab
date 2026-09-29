<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * /api/vault - opaque blobs and one header per owner, stored under a second
 * layer of encryption. See modules/vault/SECURITY.md.
 */
class VaultTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = $this->user('owner@example.test');
    }

    private function user(string $email): User
    {
        return User::query()->create(['name' => 'Owner', 'email' => $email, 'password' => Hash::make('x')]);
    }

    private function header(string $salt = 'c2FsdA'): array
    {
        return [
            'v' => 1,
            'kdf' => ['name' => 'PBKDF2', 'hash' => 'SHA-256', 'iterations' => 600000],
            'salt' => $salt,
            'wrap' => ['iv' => 'aXY', 'key' => 'a2V5'],
            'verifier' => ['v' => 1, 'iv' => 'aXY', 'ct' => 'Y3Q'],
            'created_at' => '2026-09-29T08:00:00Z',
        ];
    }

    private function blob(string $ct = 'U2VjcmV0Q2lwaGVydGV4dA'): array
    {
        return ['v' => 1, 'iv' => 'MTIzNDU2Nzg5MDEy', 'ct' => $ct];
    }

    private function id(): string
    {
        return strtoupper((string) Str::ulid());
    }

    public function test_it_needs_a_session(): void
    {
        $this->getJson('/api/vault')->assertUnauthorized();
        $this->getJson('/api/vault/header')->assertUnauthorized();
    }

    public function test_a_header_is_set_up_once_and_replaced_on_a_password_change(): void
    {
        $this->actingAs($this->owner);

        $this->getJson('/api/vault/header')->assertNotFound();
        $this->postJson('/api/vault/header', $this->header())->assertCreated();
        $this->getJson('/api/vault/header')->assertOk()->assertJsonPath('data.salt', 'c2FsdA')
            ->assertJsonPath('data.wrap.key', 'a2V5');

        // A second setup would orphan every entry sealed under the first key.
        $this->postJson('/api/vault/header', $this->header('b3RoZXI'))->assertStatus(409);

        $rotated = $this->header();
        $rotated['wrap']['key'] = 'cmV3cmFwcGVk';
        $this->putJson('/api/vault/header', $rotated)->assertOk();
        $this->getJson('/api/vault/header')->assertJsonPath('data.wrap.key', 'cmV3cmFwcGVk');
    }

    public function test_entries_round_trip_and_are_replaced_and_deleted(): void
    {
        $this->actingAs($this->owner);
        $id = $this->id();

        $this->postJson('/api/vault', ['id' => $id, 'blob' => $this->blob()])->assertCreated()
            ->assertJsonPath('data.id', $id);
        $this->getJson('/api/vault')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.blob.ct', 'U2VjcmV0Q2lwaGVydGV4dA');

        $this->putJson("/api/vault/{$id}", ['blob' => $this->blob('TmV3Q2lwaGVy')])->assertOk();
        $this->getJson('/api/vault')->assertJsonPath('data.0.blob.ct', 'TmV3Q2lwaGVy');

        $this->deleteJson("/api/vault/{$id}")->assertNoContent();
        $this->getJson('/api/vault')->assertJsonCount(0, 'data');
        $this->putJson("/api/vault/{$id}", ['blob' => $this->blob()])->assertNotFound();
    }

    public function test_sending_an_entry_twice_replaces_it_rather_than_copying_it(): void
    {
        $this->actingAs($this->owner);
        $id = $this->id();

        $this->postJson('/api/vault', ['id' => $id, 'blob' => $this->blob('Rmlyc3Q')])->assertCreated();
        $this->postJson('/api/vault', ['id' => $id, 'blob' => $this->blob('U2Vjb25k')])->assertOk();

        $this->getJson('/api/vault')->assertJsonCount(1, 'data')->assertJsonPath('data.0.blob.ct', 'U2Vjb25k');
    }

    public function test_one_owner_cannot_see_or_touch_another_owners_vault(): void
    {
        $id = $this->id();
        $this->actingAs($this->owner)->postJson('/api/vault', ['id' => $id, 'blob' => $this->blob()])->assertCreated();
        $this->actingAs($this->owner)->postJson('/api/vault/header', $this->header())->assertCreated();

        $other = $this->user('other@example.test');
        $this->actingAs($other)->getJson('/api/vault')->assertJsonCount(0, 'data');
        $this->actingAs($other)->getJson('/api/vault/header')->assertNotFound();
        $this->actingAs($other)->putJson("/api/vault/{$id}", ['blob' => $this->blob('SGlqYWNr')])->assertNotFound();
        $this->actingAs($other)->deleteJson("/api/vault/{$id}")->assertNotFound();
        $this->actingAs($other)->postJson('/api/vault', ['id' => $id, 'blob' => $this->blob('SGlqYWNr')])->assertStatus(409);

        $this->actingAs($this->owner)->getJson('/api/vault')->assertJsonPath('data.0.blob.ct', 'U2VjcmV0Q2lwaGVydGV4dA');
    }

    public function test_the_database_holds_the_blob_under_a_second_layer(): void
    {
        $this->actingAs($this->owner);
        $id = $this->id();
        $this->postJson('/api/vault', ['id' => $id, 'blob' => $this->blob()])->assertCreated();
        $this->postJson('/api/vault/header', $this->header())->assertCreated();

        // The browser's ciphertext must not appear as-is in the row: the
        // outer layer (Laravel Crypt, the app key) wraps it.
        $raw = (string) DB::table('vault_items')->where('id', $id)->value('blob');
        $this->assertStringNotContainsString('U2VjcmV0Q2lwaGVydGV4dA', $raw);
        $this->assertStringNotContainsString('c2FsdA', (string) DB::table('vault_headers')->value('header'));
    }

    public function test_only_the_shape_and_size_of_a_blob_are_checked(): void
    {
        $this->actingAs($this->owner);

        $this->postJson('/api/vault', ['id' => $this->id(), 'blob' => ['ct' => 'x']])->assertUnprocessable();
        $this->postJson('/api/vault', ['id' => 'not-a-ulid', 'blob' => $this->blob()])->assertUnprocessable();
        $this->postJson('/api/vault', ['id' => $this->id(), 'blob' => $this->blob(str_repeat('A', 70 * 1024))])
            ->assertUnprocessable()->assertJsonValidationErrors('blob');
    }
}
