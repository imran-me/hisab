<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Categories\Seeders\CategorySeeder;
use Hisab\Dues\Services\DuesDemo;
use Hisab\Fx\Seeders\FxSeeder;
use Hisab\Ledger\Models\Transaction;
use Hisab\Ledger\Services\BalanceSheet;
use Hisab\Ledger\Services\DemoData;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * /api/dues - money lent and borrowed, as ledger transfers into a Dues
 * account, with each person's balance read back from the ledger.
 */
class DuesTest extends TestCase
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
        $this->cash = $this->account('Wallet cash', 'cash', 'BDT');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function account(string $name, string $type, string $currency, string $book = 'personal'): Account
    {
        return Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $this->owner->id,
            'name' => $name, 'type' => $type, 'currency' => $currency, 'book' => $book,
            'opening_balance_minor' => 100_000_00,
        ]);
    }

    private function person(string $name = 'Rahim'): string
    {
        return $this->actingAs($this->owner)->postJson('/api/dues/people', ['name' => $name])
            ->assertCreated()->json('data.id');
    }

    private function due(string $person, string $kind, int $minor, array $extra = []): array
    {
        return $this->actingAs($this->owner)->postJson("/api/dues/people/{$person}/entries", [
            'kind' => $kind, 'amount_minor' => $minor, 'account_id' => $this->cash->id,
            'occurred_on' => '2026-09-10',
        ] + $extra)->assertCreated()->json('data');
    }

    private function balance(string $accountId): int
    {
        return app(BalanceSheet::class)->balances($this->owner)[$accountId];
    }

    public function test_lending_moves_money_but_is_not_spending(): void
    {
        $rahim = $this->person();
        $data = $this->due($rahim, 'lent', 5_000_00);

        $this->assertSame(5_000_00, $data['person']['balance_minor']);
        $this->assertSame('owes_you', $data['person']['state']);

        // The cash left the wallet the day it was lent...
        $legs = Transaction::query()->where('user_id', $this->owner->id)->get();
        $this->assertCount(2, $legs);
        $this->assertSame(['transfer'], $legs->pluck('type')->unique()->values()->all());
        $out = $legs->firstWhere('account_id', $this->cash->id);
        $this->assertSame('out', $out->direction);
        $this->assertSame('Rahim', $out->payee);

        // ...into a held Dues account, and the month has no spending in it.
        $dues = Account::query()->where('user_id', $this->owner->id)->where('type', 'dues')->sole();
        $this->assertSame($dues->id, $legs->firstWhere('direction', 'in')->account_id);

        $month = app(BalanceSheet::class)->summary($this->owner, 'personal', '2026-09-01', '2026-09-30');
        $this->assertSame(0, $month['expense_minor']);
        $this->assertSame(0, $month['income_minor']);
    }

    public function test_the_four_kinds_and_the_running_balance(): void
    {
        $karim = $this->person('Karim');
        $this->due($karim, 'borrowed', 15_000_00, ['occurred_on' => '2026-09-01']);
        $this->due($karim, 'paid_back', 5_000_00, ['occurred_on' => '2026-09-05']);

        $rahim = $this->person('Rahim');
        $this->due($rahim, 'lent', 8_000_00, ['occurred_on' => '2026-09-02']);
        $this->due($rahim, 'got_back', 3_000_00, ['occurred_on' => '2026-09-06']);

        $all = $this->getJson('/api/dues')->assertOk()->json('data');
        $this->assertSame(5_000_00, $all['owed_to_you_minor']);
        $this->assertSame(10_000_00, $all['you_owe_minor']);
        $this->assertSame(-5_000_00, $all['net_minor']);

        $k = collect($all['people'])->firstWhere('name', 'Karim');
        $this->assertSame(-10_000_00, $k['balance_minor']);
        $this->assertSame('you_owe', $k['state']);

        // The Dues account holds the net, which is what keeps net worth right.
        $this->assertSame(-5_000_00, $this->balance($all['account_id']));

        $detail = $this->getJson("/api/dues/people/{$rahim}")->assertOk()->json('data');
        $this->assertSame([5_000_00, 8_000_00], array_column($detail['entries'], 'balance_after_minor'));
    }

    public function test_settle_is_one_real_entry_for_the_whole_balance(): void
    {
        $rahim = $this->person();
        $this->due($rahim, 'lent', 8_000_00);
        $this->due($rahim, 'got_back', 3_000_00);
        $this->patchJson("/api/dues/people/{$rahim}", ['remind_on' => '2026-09-27'])->assertOk()
            ->assertJsonPath('data.remind_due', true);

        $before = $this->balance($this->cash->id);
        $data = $this->postJson("/api/dues/people/{$rahim}/settle", ['account_id' => $this->cash->id])
            ->assertCreated()->json('data');

        $this->assertSame(0, $data['person']['balance_minor']);
        $this->assertSame('settled', $data['person']['state']);
        $this->assertNull($data['person']['remind_on']);
        $this->assertSame('got_back', $data['entries'][0]['kind']);
        $this->assertSame(5_000_00, $data['entries'][0]['amount_minor']);
        $this->assertSame($before + 5_000_00, $this->balance($this->cash->id));

        // Nothing left to settle.
        $this->postJson("/api/dues/people/{$rahim}/settle", ['account_id' => $this->cash->id])->assertStatus(422);
    }

    public function test_reversing_the_transfer_in_the_ledger_corrects_the_person(): void
    {
        $rahim = $this->person();
        $data = $this->due($rahim, 'lent', 5_000_00);

        $leg = Transaction::query()->findOrFail($data['entries'][0]['transaction_id']);
        app(LedgerWriter::class)->reverse($this->owner, $leg, 'Recorded twice');

        $person = $this->getJson("/api/dues/people/{$rahim}")->json('data');
        $this->assertSame(0, $person['person']['balance_minor']);
        $this->assertTrue($person['entries'][0]['reversed']);
    }

    public function test_refusals(): void
    {
        $rahim = $this->person();

        // Another currency: the Dues account is in taka.
        $usd = $this->account('Payoneer', 'wallet', 'USD');
        $this->postJson("/api/dues/people/{$rahim}/entries", [
            'kind' => 'lent', 'amount_minor' => 1000, 'account_id' => $usd->id,
        ])->assertStatus(422);

        // Another book.
        $biz = $this->account('Shop till', 'cash', 'BDT', 'business');
        $this->postJson("/api/dues/people/{$rahim}/entries", [
            'kind' => 'lent', 'amount_minor' => 1000, 'account_id' => $biz->id,
        ])->assertStatus(422);

        $this->postJson("/api/dues/people/{$rahim}/entries", [
            'kind' => 'gift', 'amount_minor' => 1000, 'account_id' => $this->cash->id,
        ])->assertStatus(422);

        // Someone else's person and someone else's account are 404s.
        $other = User::query()->create(['name' => 'B', 'email' => 'b@example.test', 'password' => Hash::make('x')]);
        $theirs = $this->actingAs($other)->postJson('/api/dues/people', ['name' => 'X'])->json('data.id');
        $this->actingAs($this->owner)->getJson("/api/dues/people/{$theirs}")->assertNotFound();

        $theirCash = Account::query()->create([
            'id' => strtoupper((string) Str::ulid()), 'user_id' => $other->id, 'name' => 'C',
            'type' => 'cash', 'currency' => 'BDT', 'book' => 'personal', 'opening_balance_minor' => 0,
        ]);
        $this->postJson("/api/dues/people/{$rahim}/entries", [
            'kind' => 'lent', 'amount_minor' => 1000, 'account_id' => $theirCash->id,
        ])->assertNotFound();

        $this->assertSame(0, Transaction::query()->where('user_id', $this->owner->id)->count());
    }

    public function test_a_balance_cannot_be_posted(): void
    {
        $rahim = $this->person();
        $this->due($rahim, 'lent', 1_000_00, ['balance_minor' => 99]);

        $this->assertSame(1_000_00, $this->getJson('/api/dues')->json('data.people.0.balance_minor'));
    }

    public function test_demo_dues_and_their_purge(): void
    {
        app(DemoData::class)->generate($this->owner, 2);
        $this->assertSame(7, app(DuesDemo::class)->generate($this->owner));

        $all = $this->actingAs($this->owner)->getJson('/api/dues')->json('data');
        $this->assertCount(3, $all['people']);
        // Rahim's reminder was yesterday and he still owes, so he leads.
        $this->assertSame('Rahim (cousin)', $all['people'][0]['name']);
        $this->assertTrue($all['people'][0]['remind_due']);

        DemoData::purge($this->owner);
        DuesDemo::purge($this->owner);
        $this->assertSame([], $this->getJson('/api/dues')->json('data.people'));
    }

    public function test_it_needs_a_session(): void
    {
        $this->getJson('/api/dues')->assertUnauthorized();
    }
}
