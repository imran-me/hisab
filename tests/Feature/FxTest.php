<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Fx\Models\FxRate;
use Hisab\Fx\Seeders\FxSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class FxTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FxSeeder::class);
    }

    /**
     * The seed carries several rows with the same base (USD/BDT and USD/AED
     * among them), so a pair has to be found by BOTH sides of it.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    private function pair(array $rows, string $base, string $quote): array
    {
        $row = collect($rows)->first(
            fn (array $r): bool => $r['base'] === $base && $r['quote'] === $quote,
        );

        $this->assertNotNull($row, "No {$base}/{$quote} row in the response.");

        return $row;
    }

    private function owner(): User
    {
        return User::query()->create([
            'name' => 'Md Imran Hossain',
            'email' => 'owner@example.test',
            'password' => Hash::make('a correct horse battery staple'),
        ]);
    }

    public function test_currencies_carry_the_minor_unit_that_is_not_two(): void
    {
        $rows = collect($this->getJson('/api/fx/currencies')->assertOk()->json('data'))
            ->keyBy('code');

        // The whole reason this table exists. CONVENTIONS.md: a hardcoded /100
        // multiplies a Kuwaiti figure by ten and divides a Japanese one by a
        // hundred. If these two ever come back as 2, every amount in those
        // currencies is silently wrong and nothing else in the suite would say so.
        $this->assertSame(3, $rows['KWD']['minor_unit']);
        $this->assertSame(0, $rows['JPY']['minor_unit']);
        $this->assertSame(2, $rows['USD']['minor_unit']);
    }

    public function test_the_seed_lets_a_fresh_install_convert_on_day_one(): void
    {
        $rows = $this->getJson('/api/fx/rates')->assertOk()->json('data');

        $this->assertNotEmpty($rows);
        $this->assertSame('seed', $this->pair($rows, 'USD', 'BDT')['source']);
    }

    public function test_a_rate_is_a_string_so_no_digits_are_lost_to_a_float(): void
    {
        $usd = $this->pair($this->getJson('/api/fx/rates')->json('data'), 'USD', 'BDT');

        // api-contract.md: a rate is a decimal and IEEE-754 cannot hold 122.5
        // exactly. If this ever arrives as a JSON number, the client is being
        // handed a float and the precision is already gone.
        $this->assertIsString($usd['rate']);
        $this->assertSame('122.5', rtrim(rtrim($usd['rate'], '0'), '.'));
    }

    public function test_the_owners_own_rate_beats_the_seeded_estimate(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner)->postJson('/api/fx/rates', [
            'base' => 'USD', 'quote' => 'BDT', 'rate' => '130.25', 'as_of' => '2026-09-05',
        ])->assertCreated();

        $usd = $this->pair($this->actingAs($owner)->getJson('/api/fx/rates')->json('data'), 'USD', 'BDT');

        // Even though the seed carries a LATER as_of (2026-09-01 vs … whichever
        // is newer), a rate the owner actually got beats an estimate shipped
        // with the install.
        $this->assertSame('manual', $usd['source']);
        $this->assertSame('130.25', rtrim(rtrim($usd['rate'], '0'), '.'));
    }

    public function test_a_signed_out_reader_sees_only_the_seeds(): void
    {
        $owner = $this->owner();
        $this->actingAs($owner)->postJson('/api/fx/rates', [
            'base' => 'USD', 'quote' => 'BDT', 'rate' => '130.25', 'as_of' => '2026-09-05',
        ])->assertCreated();

        // A new guest session, not the one that just posted.
        $this->app['auth']->guard('web')->logout();
        session()->flush();

        $usd = $this->pair($this->getJson('/api/fx/rates')->json('data'), 'USD', 'BDT');

        $this->assertSame('seed', $usd['source']);
    }

    public function test_recording_a_rate_needs_a_session(): void
    {
        $this->postJson('/api/fx/rates', [
            'base' => 'USD', 'quote' => 'BDT', 'rate' => '130.25', 'as_of' => '2026-09-05',
        ])->assertUnauthorized();
    }

    public function test_a_rate_of_zero_or_less_is_not_a_rate(): void
    {
        $owner = $this->owner();

        foreach (['0', '-1.5'] as $bad) {
            $this->actingAs($owner)->postJson('/api/fx/rates', [
                'base' => 'USD', 'quote' => 'BDT', 'rate' => $bad, 'as_of' => '2026-09-05',
            ])->assertStatus(422)->assertJsonValidationErrors('rate');
        }
    }

    public function test_a_currency_cannot_be_priced_against_itself(): void
    {
        $this->actingAs($this->owner())->postJson('/api/fx/rates', [
            'base' => 'USD', 'quote' => 'USD', 'rate' => '1.02', 'as_of' => '2026-09-05',
        ])->assertStatus(422)->assertJsonValidationErrors('quote');
    }

    public function test_a_rate_cannot_be_dated_in_the_future(): void
    {
        $this->actingAs($this->owner())->postJson('/api/fx/rates', [
            'base' => 'USD', 'quote' => 'BDT', 'rate' => '130.25',
            'as_of' => now()->addDay()->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors('as_of');
    }

    public function test_writing_the_same_pair_and_day_twice_is_a_correction_not_a_second_row(): void
    {
        $owner = $this->owner();

        foreach (['130.25', '131.00'] as $rate) {
            $this->actingAs($owner)->postJson('/api/fx/rates', [
                'base' => 'USD', 'quote' => 'BDT', 'rate' => $rate, 'as_of' => '2026-09-05',
            ])->assertCreated();
        }

        $rows = FxRate::query()
            ->where('user_id', $owner->id)
            ->where('base', 'USD')->where('quote', 'BDT')
            ->where('as_of', '2026-09-05')
            ->get();

        $this->assertCount(1, $rows, 'Two rates for one pair on one day are a correction, not history.');
        $this->assertSame('131', rtrim(rtrim((string) $rows->first()->getRawOriginal('rate'), '0'), '.'));
    }

    public function test_an_unknown_currency_is_rejected(): void
    {
        $this->actingAs($this->owner())->postJson('/api/fx/rates', [
            'base' => 'ZZZ', 'quote' => 'BDT', 'rate' => '1.5', 'as_of' => '2026-09-05',
        ])->assertStatus(422)->assertJsonValidationErrors('base');
    }

    public function test_a_lowercase_code_is_accepted_rather_than_pedantically_rejected(): void
    {
        $this->actingAs($this->owner())->postJson('/api/fx/rates', [
            'base' => 'usd', 'quote' => 'bdt', 'rate' => '130.25', 'as_of' => '2026-09-05',
        ])->assertCreated()->assertJsonPath('data.base', 'USD');
    }
}
