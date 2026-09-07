<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Categories\Models\Category;
use Hisab\Categories\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CategoriesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Reference data only; the per-owner categories arrive via the
        // User::created listener when owner() runs.
        $this->seed(CategorySeeder::class);
    }

    private function owner(string $email = 'owner@example.test'): User
    {
        return User::query()->create([
            'name' => 'Owner',
            'email' => $email,
            'password' => Hash::make('a correct horse battery staple'),
        ]);
    }

    public function test_a_new_owner_starts_with_categories_in_both_books(): void
    {
        $owner = $this->owner();

        $personal = $this->actingAs($owner)->getJson('/api/categories?book=personal&type=expense')->assertOk();
        $business = $this->actingAs($owner)->getJson('/api/categories?book=business&type=income')->assertOk();

        $this->assertNotEmpty($personal->json('data'));
        $this->assertNotEmpty($business->json('data'));
    }

    public function test_transfer_is_not_a_category_type(): void
    {
        // The absence is the design: a transfer between your own accounts is not
        // a category of spending. If this ever starts passing, the ledger will
        // grow transfers filed under "Other" and the totals will stop balancing.
        $this->actingAs($this->owner())->postJson('/api/categories', [
            'label' => 'Moving money', 'type' => 'transfer',
        ])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_an_expense_gets_a_necessity_band_and_income_never_does(): void
    {
        $owner = $this->owner();

        $expense = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Vet bills', 'type' => 'expense',
        ])->assertCreated();

        // Defaults to 3, discretionary, rather than null.
        $this->assertSame(3, $expense->json('data.necessity'));

        // Sent on an income it is IGNORED, not rejected - the client submits one
        // form for every type.
        $income = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Consulting', 'type' => 'income', 'necessity' => 1,
        ])->assertCreated();

        $this->assertNull($income->json('data.necessity'));
    }

    public function test_a_duplicate_name_is_refused_whatever_the_casing(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Vet bills', 'type' => 'expense',
        ])->assertCreated();

        // Two categories differing only in case split a year of spending across
        // two rows in every report and cannot be told apart in the picker.
        $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'VET BILLS', 'type' => 'expense',
        ])->assertStatus(422)->assertJsonValidationErrors('label');
    }

    public function test_the_same_name_is_fine_in_a_different_book_or_type(): void
    {
        $owner = $this->owner();

        // The shipped seed already demonstrates the rule: 'Utilities' is a
        // category in BOTH books, and has to be, because a household electricity
        // bill and an office one are not the same figure.
        foreach (['personal', 'business'] as $book) {
            $rows = collect($this->actingAs($owner)
                ->getJson("/api/categories?book={$book}&type=expense")->json('data'));

            $this->assertNotNull(
                $rows->firstWhere('label', 'Utilities'),
                "Expected a Utilities category in the {$book} book.",
            );
        }

        // And a new name behaves the same way in both.
        foreach (['personal', 'business'] as $book) {
            $this->actingAs($owner)->postJson('/api/categories', [
                'label' => 'Drone parts', 'type' => 'expense', 'book' => $book,
            ])->assertCreated();
        }
    }

    public function test_a_label_with_no_latin_letters_still_gets_a_key(): void
    {
        $owner = $this->owner();

        // slugify() drops Bengali rather than transliterating it, so the slug is
        // empty and the id has to stand in. This is the case the fallback exists
        // for, and it is easy to lose in a refactor.
        $row = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'বাজার', 'type' => 'expense',
        ])->assertCreated()->json('data');

        $this->assertNotSame('', $row['key']);
        $this->assertSame(strtolower($row['id']), $row['key']);
    }

    public function test_renaming_works_but_the_type_cannot_be_changed(): void
    {
        $owner = $this->owner();
        $id = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Vet bills', 'type' => 'expense',
        ])->json('data.id');

        $updated = $this->actingAs($owner)->patchJson("/api/categories/{$id}", [
            'label' => 'Veterinary', 'type' => 'income',
        ])->assertOk()->json('data');

        $this->assertSame('Veterinary', $updated['label']);
        // `type` is not an accepted field, so sending it changes nothing. A
        // category moving from expense to income would flip the sign of every
        // transaction already filed under it.
        $this->assertSame('expense', $updated['type']);
    }

    public function test_the_key_survives_a_rename(): void
    {
        $owner = $this->owner();
        $created = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Vet bills', 'type' => 'expense',
        ])->json('data');

        $renamed = $this->actingAs($owner)
            ->patchJson("/api/categories/{$created['id']}", ['label' => 'Veterinary'])
            ->json('data');

        // The key is a stable handle used in exports and URLs. Re-slugging on
        // rename would break references for a cosmetic gain.
        $this->assertSame($created['key'], $renamed['key']);
    }

    public function test_a_category_nothing_references_is_deleted_outright(): void
    {
        $owner = $this->owner();
        $id = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Made by mistake', 'type' => 'expense',
        ])->json('data.id');

        // CONVENTIONS.md §5's single exception: created and removed without ever
        // being referenced. A tombstone for that is clutter with no history.
        $this->actingAs($owner)->deleteJson("/api/categories/{$id}")
            ->assertOk()->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('categories', ['id' => $id]);
    }

    public function test_an_archived_category_is_hidden_from_pickers_but_still_fetchable(): void
    {
        $owner = $this->owner();
        $id = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Old thing', 'type' => 'expense',
        ])->json('data.id');

        // Archive by hand: the delete route hard-deletes while nothing
        // references it, and the ledger does not exist yet to reference it.
        Category::query()->whereKey($id)->update(['archived_at' => now()]);

        $active = collect($this->actingAs($owner)->getJson('/api/categories?type=expense')->json('data'));
        $this->assertNull($active->firstWhere('id', $id));

        $all = collect($this->actingAs($owner)
            ->getJson('/api/categories?type=expense&include_archived=1')->json('data'));
        $this->assertNotNull($all->firstWhere('id', $id));
    }

    public function test_restoring_into_a_taken_name_is_refused(): void
    {
        $owner = $this->owner();
        $id = $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Vet bills', 'type' => 'expense',
        ])->json('data.id');

        Category::query()->whereKey($id)->update(['archived_at' => now()]);

        // The name is free again, so this succeeds.
        $this->actingAs($owner)->postJson('/api/categories', [
            'label' => 'Vet bills', 'type' => 'expense',
        ])->assertCreated();

        // And now restoring the old one would create the duplicate that create()
        // refuses, so it is refused too rather than silently allowed.
        $this->actingAs($owner)->postJson("/api/categories/{$id}/restore")
            ->assertStatus(422)->assertJsonValidationErrors('label');
    }

    public function test_someone_elses_category_is_404_and_not_403(): void
    {
        $mine = $this->owner('me@example.test');
        $theirs = $this->owner('them@example.test');

        $id = $this->actingAs($theirs)->postJson('/api/categories', [
            'label' => 'Their private thing', 'type' => 'expense',
        ])->json('data.id');

        // api-contract.md §6: 404, not 403. Confirming that an id exists is
        // itself information.
        $this->actingAs($mine)->patchJson("/api/categories/{$id}", ['label' => 'Mine now'])
            ->assertNotFound();
        $this->actingAs($mine)->deleteJson("/api/categories/{$id}")->assertNotFound();
    }

    public function test_categories_need_a_session_but_the_vocabulary_does_not(): void
    {
        $this->getJson('/api/categories')->assertUnauthorized();

        // Reference data is the vocabulary, not anyone's money.
        $this->getJson('/api/categories/necessity')->assertOk()->assertJsonCount(4, 'data');
        $this->getJson('/api/categories/methods')->assertOk()->assertJsonCount(8, 'data');
    }
}
